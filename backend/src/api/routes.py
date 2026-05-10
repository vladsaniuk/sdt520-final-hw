import uuid
import json
import os
import re
import tempfile
import shutil
import asyncio
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain_openai import ChatOpenAI
from src.core.extractor import RequirementExtractor
from src.core.advisor import ArchitectureAdvisor
from src.core.models import ArchitecturePlan, ServiceDetail, StructuredOutputError
from src.core.prompts import ADVISOR_PROMPT, COMPACT_PROMPT, TERRAFORM_FULL_PROMPT, GATHER_PROMPT, FOLLOWUP_PROMPT
from src.db import database as db

router = APIRouter()
extractor = RequirementExtractor()
advisor = ArchitectureAdvisor()

# In-memory cache of generated Terraform HCL keyed by recommendation_id.
_terraform_cache: Dict[str, str] = {}

# Regex to detect the ready-for-architecture JSON signal from GATHER_PROMPT
READY_SIGNAL_RE = re.compile(
    r'\{\s*"ready_for"\s*:\s*\[\s*"architecture"\s*\]\s*\}'
)


def _deserialize_history(raw: List[dict]) -> List[BaseMessage]:
    """Convert client-serialized history [{"role": "human"|"ai", "content": str}] to LangChain messages."""
    result: List[BaseMessage] = []
    for item in raw:
        role = item.get("role", "")
        content = item.get("content", "")
        if role == "human":
            result.append(HumanMessage(content=content))
        elif role == "ai":
            result.append(AIMessage(content=content))
    return result


def _make_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model="openai/gpt-4o",
        openai_api_key=os.getenv("LLM_API_KEY"),
        openai_api_base="https://openrouter.ai/api/v1",
    )


class StoredMessage(BaseModel):
    role: str    # "human" or "ai"
    content: str


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    # Client sends cached history for backend state restoration after container restart (D-14)
    history: Optional[List[StoredMessage]] = None


class IaCSnippetResponse(BaseModel):
    type: str
    content: str


class ServiceDetailResponse(BaseModel):
    name: str
    description: str
    rationale: str


class ChatResponse(BaseModel):
    recommendation_id: str
    conversation_id: str
    text: str
    diagram: str
    iac: List[IaCSnippetResponse]
    costs: dict
    services: List[ServiceDetailResponse]  # for diff badge computation in frontend
    usage: Optional[dict] = None
    error: Optional[str] = None             # set on structured output failure (D-20)


class CompactResponse(BaseModel):
    conversation_id: str
    summary: str
    message: str   # human-readable status


class ClearResponse(BaseModel):
    conversation_id: str
    message: str


class ApproveRequest(BaseModel):
    recommendation_id: str


class ApproveResponse(BaseModel):
    recommendation_id: str
    hcl: str
    valid: bool | None   # None = Terraform CLI not installed (graceful fallback, D-04)
    validation_errors: List[str]


def _strip_code_fences(content: str) -> str:
    """Strip markdown code fences from LLM HCL output. Reuses pattern from terraform.py lines 20-27."""
    if "```hcl" in content:
        content = content.split("```hcl")[1].split("```")[0]
    elif "```terraform" in content:
        content = content.split("```terraform")[1].split("```")[0]
    elif "```" in content:
        content = content.split("```")[1].split("```")[0]
    return content.strip()


async def _generate_full_terraform(history: List[BaseMessage]) -> str:
    """
    Generate full deployment-ready Terraform HCL from conversation history.
    New async LLM call — does NOT use TerraformGenerator (sync, D-02).
    Uses last 10 history turns to stay within context window.
    """
    llm = ChatOpenAI(
        model="openai/gpt-4o",
        openai_api_key=os.getenv("LLM_API_KEY"),
        openai_api_base="https://openrouter.ai/api/v1",
    )
    messages: List[BaseMessage] = [
        SystemMessage(content=TERRAFORM_FULL_PROMPT),
        *history[-10:],
        HumanMessage(content="Generate the complete Terraform configuration now."),
    ]
    result = await llm.ainvoke(messages)
    raw = result.content or ""
    return _strip_code_fences(raw)


async def _validate_terraform(hcl: str, rec_id: str) -> tuple[bool | None, list[str]]:
    """
    Validate HCL via `terraform init -backend=false` then `terraform validate -json`.
    Returns (valid, error_messages).
    valid=None if Terraform CLI not installed (graceful fallback for dev env, D-04).
    Never raises — all errors return (None, []).

    IMPORTANT: Uses tempfile.mkdtemp() NOT /tmp/{id}.tf — terraform init needs
    a full directory for .terraform/ subdirectory and .terraform.lock.hcl.
    """
    if not shutil.which("terraform"):
        print("[Approve] terraform CLI not found — skipping validation (D-04 fallback)")
        return None, []

    tmpdir = tempfile.mkdtemp(prefix=f"tf_{rec_id[:8]}_")
    try:
        tf_file = Path(tmpdir) / "main.tf"
        tf_file.write_text(hcl)

        # Step 1: terraform init — downloads provider schemas (needed for validate)
        init_proc = await asyncio.create_subprocess_exec(
            "terraform", "init", "-backend=false", "-input=false",
            cwd=tmpdir,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            await asyncio.wait_for(init_proc.wait(), timeout=60.0)
        except asyncio.TimeoutError:
            print(f"[Approve] terraform init timed out for {rec_id}")
            return None, []

        if init_proc.returncode != 0:
            print(f"[Approve] terraform init failed (exit {init_proc.returncode}) for {rec_id}")
            return None, []

        # Step 2: terraform validate -json — parse structured output
        val_proc = await asyncio.create_subprocess_exec(
            "terraform", "validate", "-json",
            cwd=tmpdir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, _ = await asyncio.wait_for(val_proc.communicate(), timeout=30.0)
        except asyncio.TimeoutError:
            print(f"[Approve] terraform validate timed out for {rec_id}")
            return None, []

        result = json.loads(stdout.decode())
        valid = result.get("valid", False)
        errors = [
            d["summary"]
            for d in result.get("diagnostics", [])
            if d.get("severity") == "error"
        ]
        return valid, errors

    except Exception as e:
        print(f"[Approve] Terraform validation error for {rec_id}: {e}")
        return None, []
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


@router.get("/conversations")
async def list_conversations():
    """Return all conversations for sidebar restore."""
    convs = await asyncio.to_thread(db.list_conversations)
    return convs


@router.get("/conversations/{conv_id}/messages")
async def get_conversation_messages(conv_id: str):
    """Return messages for a conversation so the frontend can restore chat history."""
    history = await asyncio.to_thread(db.get_history, conv_id)
    return [
        {"role": m.type, "content": m.content}
        for m in history
        if m.type in ("human", "ai")
    ]


@router.get("/conversations/{conv_id}/context")
async def get_conversation_context(conv_id: str):
    """Return state + all artifacts so the frontend can restore button/panel state."""
    state = await asyncio.to_thread(db.get_state, conv_id)

    artifact_types = ["architecture", "costs", "terraform"]
    artifacts: dict = {}
    for atype in artifact_types:
        content = await asyncio.to_thread(db.get_artifact, conv_id, atype)
        if content is not None:
            artifacts[atype] = content

    return {"state": state, "artifacts": artifacts}


@router.post("/chat/stream")
async def chat_stream(request: "ChatRequest"):
    """
    SSE streaming chat endpoint. State-machine-driven:
    - 'gathering': Ask clarifying questions using GATHER_PROMPT.
      Detect {"ready_for":["architecture"]} signal to unlock architecture generation.
    - 'presenting' / 'architecture_ready' / 'complete': Conversational follow-up.

    SSE events:
      data: {"type":"token","content":"..."}\n\n
      data: {"type":"status","content":"..."}\n\n
      data: {"type":"done","payload":{...}}\n\n
      data: {"type":"error","message":"..."}\n\n
    """
    conv_id = request.conversation_id or str(uuid.uuid4())
    await asyncio.to_thread(db.ensure_conversation, conv_id)

    async def generate():
        try:
            state = await asyncio.to_thread(db.get_state, conv_id)
            history = await asyncio.to_thread(db.get_history, conv_id)
            llm = _make_llm()

            # Detect if existing architecture artifact will become stale on this new message
            existing_arch = await asyncio.to_thread(db.get_artifact, conv_id, "architecture")
            stale_fields: List[str] = []
            if existing_arch:
                stale_fields = ["architecture", "costs", "terraform"]

            if state == "gathering":
                # Build gathering messages: system prompt + history + new user message
                gather_messages: List[BaseMessage] = [
                    SystemMessage(content=GATHER_PROMPT),
                    *history,
                    HumanMessage(content=request.message),
                ]
                debug_payload = {
                    "type": "debug",
                    "event": "llm_call_start",
                    "messages": [{"role": m.type, "content": m.content[:2000]} for m in gather_messages],
                }
                yield f"data: {json.dumps(debug_payload)}\n\n"
                full_response = ""
                async for chunk in llm.astream(gather_messages):
                    token = chunk.content or ""
                    if token:
                        full_response += token
                        yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

                yield f"data: {json.dumps({'type': 'debug', 'event': 'llm_call_done', 'token_count': len(full_response.split())})}\n\n"

                # Persist this turn
                await asyncio.to_thread(db.save_message, conv_id, "human", request.message)

                if READY_SIGNAL_RE.search(full_response):
                    # Strip signal from stored text
                    clean_response = READY_SIGNAL_RE.sub("", full_response).strip()
                    await asyncio.to_thread(db.save_message, conv_id, "ai", clean_response)
                    await asyncio.to_thread(db.set_state, conv_id, "architecture_ready")

                    payload: Dict = {
                        "phase": "gathering",
                        "conversation_id": conv_id,
                        "text": clean_response,
                        "ready_for": ["architecture"],
                    }
                    if stale_fields:
                        payload["stale"] = stale_fields
                    yield f"data: {json.dumps({'type': 'done', 'payload': payload})}\n\n"
                else:
                    await asyncio.to_thread(db.save_message, conv_id, "ai", full_response)
                    payload = {
                        "phase": "gathering",
                        "conversation_id": conv_id,
                        "text": full_response,
                    }
                    if stale_fields:
                        payload["stale"] = stale_fields
                    yield f"data: {json.dumps({'type': 'done', 'payload': payload})}\n\n"

            else:
                # presenting / architecture_ready / complete — conversational follow-up
                # Use FOLLOWUP_PROMPT (no ready_for signal, stale signal instead)
                conv_messages: List[BaseMessage] = [
                    SystemMessage(content=FOLLOWUP_PROMPT),
                    *history,
                    HumanMessage(content=request.message),
                ]
                await asyncio.to_thread(db.save_message, conv_id, "human", request.message)

                debug_payload_conv = {
                    "type": "debug",
                    "event": "llm_call_start",
                    "messages": [{"role": m.type, "content": m.content[:2000]} for m in conv_messages],
                }
                yield f"data: {json.dumps(debug_payload_conv)}\n\n"
                full_response = ""
                async for chunk in llm.astream(conv_messages):
                    token = chunk.content or ""
                    if token:
                        full_response += token
                        yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

                yield f"data: {json.dumps({'type': 'debug', 'event': 'llm_call_done', 'token_count': len(full_response.split())})}\n\n"

                # If ready signal appears in a follow-up, handle it too
                if READY_SIGNAL_RE.search(full_response):
                    clean_response = READY_SIGNAL_RE.sub("", full_response).strip()
                    await asyncio.to_thread(db.save_message, conv_id, "ai", clean_response)
                    payload = {
                        "phase": "gathering",
                        "conversation_id": conv_id,
                        "text": clean_response,
                        "ready_for": ["architecture"],
                    }
                else:
                    await asyncio.to_thread(db.save_message, conv_id, "ai", full_response)
                    payload = {
                        "phase": "gathering",
                        "conversation_id": conv_id,
                        "text": full_response,
                    }

                if stale_fields:
                    payload["stale"] = stale_fields
                yield f"data: {json.dumps({'type': 'done', 'payload': payload})}\n\n"

        except Exception as e:
            print(f"[Stream] Unhandled error for {conv_id}: {e}")
            yield f"data: {json.dumps({'type': 'debug', 'event': 'error', 'detail': str(e)})}\n\n"
            yield f"data: {json.dumps({'type': 'error', 'message': 'Internal server error'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    # 1. Resolve conversation_id — use provided or create new UUID4
    conv_id = request.conversation_id or str(uuid.uuid4())
    await asyncio.to_thread(db.ensure_conversation, conv_id)

    # 2. Restore or initialize history from DB (source of truth)
    history = await asyncio.to_thread(db.get_history, conv_id)

    # 3. Extract requirements — wrap sync call in thread to avoid blocking event loop
    requirements = await asyncio.to_thread(extractor.extract, request.message)

    # 4. Get structured recommendation (async, uses history for multi-turn context)
    try:
        plan: ArchitecturePlan = await advisor.get_recommendation(requirements, history)
    except StructuredOutputError as e:
        return ChatResponse(
            recommendation_id=str(uuid.uuid4()),
            conversation_id=conv_id,
            text="",
            diagram="",
            iac=[],
            costs={},
            services=[],
            error=str(e),
        )

    # 5. Persist this turn to DB
    await asyncio.to_thread(db.save_message, conv_id, "human", request.message)
    await asyncio.to_thread(db.save_message, conv_id, "ai", plan.model_dump_json())

    # 6. Build response
    return ChatResponse(
        recommendation_id=str(uuid.uuid4()),
        conversation_id=conv_id,
        text=plan.summary,
        diagram=plan.diagram,
        iac=[IaCSnippetResponse(type="terraform", content=plan.iac_snippet)],
        costs={
            "total": plan.cost_estimate.total,
            "breakdown": [b.model_dump() for b in plan.cost_estimate.breakdown],
        },
        services=[
            ServiceDetailResponse(
                name=s.name,
                description=s.description,
                rationale=s.rationale,
            )
            for s in plan.services
        ],
    )


@router.post("/chat/{conversation_id}/compact", response_model=CompactResponse)
async def compact_conversation(conversation_id: str):
    """Summarize conversation history into a compact system message."""
    history = await asyncio.to_thread(db.get_history, conversation_id)
    if not history:
        raise HTTPException(status_code=404, detail="Conversation not found or empty")

    try:
        summary = await advisor.compact_conversation(history)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Compaction failed: {e}")

    # Replace history with single SystemMessage carrying the summary
    await asyncio.to_thread(db.clear_conversation, conversation_id)
    await asyncio.to_thread(
        db.save_message, conversation_id, "system",
        f"Previous conversation summary:\n{summary}"
    )

    return CompactResponse(
        conversation_id=conversation_id,
        summary=summary,
        message="Conversation compacted successfully.",
    )


@router.post("/chat/{conversation_id}/clear", response_model=ClearResponse)
async def clear_conversation(conversation_id: str):
    """Wipe conversation history for a session."""
    await asyncio.to_thread(db.clear_conversation, conversation_id)
    return ClearResponse(
        conversation_id=conversation_id,
        message="Conversation history cleared.",
    )


@router.post("/chat/{conversation_id}/approve", response_model=ApproveResponse)
async def approve_plan(conversation_id: str, request: ApproveRequest):
    """Generate and validate a full Terraform HCL config for the approved plan."""
    rec_id = request.recommendation_id
    history = await asyncio.to_thread(db.get_history, conversation_id)

    if rec_id in _terraform_cache:
        hcl = _terraform_cache[rec_id]
    else:
        hcl = await _generate_full_terraform(history)
        _terraform_cache[rec_id] = hcl

    # Mark conversation as complete once approved
    await asyncio.to_thread(db.set_state, conversation_id, "complete")

    valid, errors = await _validate_terraform(hcl, rec_id)
    return ApproveResponse(
        recommendation_id=rec_id,
        hcl=hcl,
        valid=valid,
        validation_errors=errors,
    )


# ---------------------------------------------------------------------------
# /generate/* endpoints — on-demand SSE streaming generators
# ---------------------------------------------------------------------------

class GenerateRequest(BaseModel):
    conversation_id: str


def _strip_json_fences(text: str) -> str:
    """Strip markdown code fences from LLM JSON output."""
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
        if "```" in text:
            text = text[:text.rindex("```")]
    elif text.startswith("```"):
        text = text[3:]
        if "```" in text:
            text = text[:text.rindex("```")]
    return text.strip()


@router.post("/generate/architecture")
async def generate_architecture(request: GenerateRequest):
    """
    Stream architecture generation for a conversation.
    SSE events: token → done (with ArchitecturePlan payload + ready_for: ["costs"])
    """
    conv_id = request.conversation_id

    async def stream():
        try:
            history = await asyncio.to_thread(db.get_history, conv_id)
            if not history:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Conversation not found or empty'})}\n\n"
                return

            messages_for_arch = await advisor.build_advisor_messages(history)
            llm = _make_llm()

            debug_payload = {
                "type": "debug",
                "event": "llm_call_start",
                "messages": [{"role": m.type, "content": m.content[:2000]} for m in messages_for_arch],
            }
            yield f"data: {json.dumps(debug_payload)}\n\n"
            arch_text = ""
            async for chunk in llm.astream(messages_for_arch):
                token = chunk.content or ""
                if token:
                    arch_text += token
                    yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

            yield f"data: {json.dumps({'type': 'debug', 'event': 'llm_call_done', 'token_count': len(arch_text.split())})}\n\n"

            # Parse accumulated JSON into ArchitecturePlan
            clean_text = _strip_json_fences(arch_text)
            try:
                plan = ArchitecturePlan.model_validate_json(clean_text)
            except Exception as parse_err:
                print(f"[generate/architecture] Parse error: {parse_err}\nRaw: {clean_text[:500]}")
                yield f"data: {json.dumps({'type': 'error', 'message': f'Failed to parse architecture plan: {parse_err}'})}\n\n"
                return

            # Persist artifact + update state
            await asyncio.to_thread(db.save_artifact, conv_id, "architecture", plan.model_dump_json())
            await asyncio.to_thread(db.set_state, conv_id, "architecture_ready")

            payload = {
                "summary": plan.summary,
                "diagram": plan.diagram,
                "services": [s.model_dump() for s in plan.services],
                "iac_snippet": plan.iac_snippet,
                "cost_estimate": plan.cost_estimate.model_dump(),
            }
            yield f"data: {json.dumps({'type': 'done', 'payload': payload, 'ready_for': ['costs']})}\n\n"

        except Exception as e:
            print(f"[generate/architecture] Unhandled error for {conv_id}: {e}")
            yield f"data: {json.dumps({'type': 'debug', 'event': 'error', 'detail': str(e)})}\n\n"
            yield f"data: {json.dumps({'type': 'error', 'message': 'Architecture generation failed'})}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/generate/costs")
async def generate_costs(request: GenerateRequest):
    """
    Stream cost estimate for a conversation's architecture.
    SSE events: token → done (ready_for: ["terraform"])
    """
    conv_id = request.conversation_id

    async def stream():
        try:
            history = await asyncio.to_thread(db.get_history, conv_id)
            arch_artifact = await asyncio.to_thread(db.get_artifact, conv_id, "architecture")

            cost_system = (
                "You are an AWS cost estimation expert. Based on the conversation and the architecture plan below, "
                "provide a detailed cost breakdown in Markdown format. Include:\n"
                "- Per-service monthly cost estimates with rationale\n"
                "- Total estimated monthly cost\n"
                "- Cost optimization recommendations\n"
                "- Assumptions made in the estimate\n\n"
                "Be specific with numbers (e.g. '$45/month for NAT Gateway based on 100GB data transfer').\n"
                "Mark estimates as approximate — not sourced from AWS Pricing API.\n\n"
            )
            if arch_artifact:
                cost_system += f"Architecture Plan:\n{arch_artifact}"

            messages: List[BaseMessage] = [
                SystemMessage(content=cost_system),
                *history,
                HumanMessage(content="Generate a detailed cost estimate for this architecture."),
            ]

            llm = _make_llm()
            debug_payload = {
                "type": "debug",
                "event": "llm_call_start",
                "messages": [{"role": m.type, "content": m.content[:2000]} for m in messages],
            }
            yield f"data: {json.dumps(debug_payload)}\n\n"
            cost_text = ""
            async for chunk in llm.astream(messages):
                token = chunk.content or ""
                if token:
                    cost_text += token
                    yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

            yield f"data: {json.dumps({'type': 'debug', 'event': 'llm_call_done', 'token_count': len(cost_text.split())})}\n\n"

            await asyncio.to_thread(db.save_artifact, conv_id, "costs", cost_text)
            await asyncio.to_thread(db.set_state, conv_id, "costs_ready")

            yield f"data: {json.dumps({'type': 'done', 'payload': {'content': cost_text}, 'ready_for': ['terraform']})}\n\n"

        except Exception as e:
            print(f"[generate/costs] Unhandled error for {conv_id}: {e}")
            yield f"data: {json.dumps({'type': 'debug', 'event': 'error', 'detail': str(e)})}\n\n"
            yield f"data: {json.dumps({'type': 'error', 'message': 'Cost generation failed'})}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/generate/terraform")
async def generate_terraform(request: GenerateRequest):
    """
    Stream full Terraform HCL for a conversation's architecture.
    SSE events: token → done (with download hint)
    """
    conv_id = request.conversation_id

    async def stream():
        try:
            history = await asyncio.to_thread(db.get_history, conv_id)
            arch_artifact = await asyncio.to_thread(db.get_artifact, conv_id, "architecture")

            system_content = TERRAFORM_FULL_PROMPT
            if arch_artifact:
                system_content += f"\n\nArchitecture Plan:\n{arch_artifact}"

            messages: List[BaseMessage] = [
                SystemMessage(content=system_content),
                *history[-10:],
                HumanMessage(content="Generate the complete Terraform configuration now."),
            ]

            llm = _make_llm()
            debug_payload = {
                "type": "debug",
                "event": "llm_call_start",
                "messages": [{"role": m.type, "content": m.content[:2000]} for m in messages],
            }
            yield f"data: {json.dumps(debug_payload)}\n\n"
            hcl_text = ""
            async for chunk in llm.astream(messages):
                token = chunk.content or ""
                if token:
                    hcl_text += token
                    yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

            yield f"data: {json.dumps({'type': 'debug', 'event': 'llm_call_done', 'token_count': len(hcl_text.split())})}\n\n"

            clean_hcl = _strip_json_fences(hcl_text)
            await asyncio.to_thread(db.save_artifact, conv_id, "terraform", clean_hcl)
            await asyncio.to_thread(db.set_state, conv_id, "terraform_ready")

            yield f"data: {json.dumps({'type': 'done', 'payload': {'content': clean_hcl, 'filename': 'main.tf'}})}\n\n"

        except Exception as e:
            print(f"[generate/terraform] Unhandled error for {conv_id}: {e}")
            yield f"data: {json.dumps({'type': 'debug', 'event': 'error', 'detail': str(e)})}\n\n"
            yield f"data: {json.dumps({'type': 'error', 'message': 'Terraform generation failed'})}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/debug/info")
async def debug_info():
    """Return system snapshot for the debug panel."""
    neo4j_connected = advisor.graph is not None
    neo4j_node_count = 0
    neo4j_chunk_count = 0
    neo4j_doc_count = 0
    if neo4j_connected:
        try:
            result = await asyncio.to_thread(advisor.graph.query, "MATCH (n) RETURN count(n) as count")
            neo4j_node_count = result[0]["count"] if result else 0
            chunks = await asyncio.to_thread(advisor.graph.query, "MATCH (n:Chunk) RETURN count(n) as count")
            neo4j_chunk_count = chunks[0]["count"] if chunks else 0
            docs = await asyncio.to_thread(advisor.graph.query, "MATCH (n:KnowledgeDocument) RETURN count(n) as count")
            neo4j_doc_count = docs[0]["count"] if docs else 0
        except Exception:
            neo4j_connected = False

    conv_count = await asyncio.to_thread(db.list_conversations)

    return {
        "model": {
            "name": os.getenv("LLM_MODEL", "openai/gpt-4o"),
            "provider": "OpenRouter",
            "base_url": "https://openrouter.ai/api/v1",
        },
        "neo4j": {
            "connected": neo4j_connected,
            "uri": os.getenv("NEO4J_URI", "bolt://neo4j:7687"),
            "node_count": neo4j_node_count,
        },
        "rag": {
            "retriever": "VectorCypherRetriever",
            "embedding_model": "all-MiniLM-L6-v2",
            "vector_index": "aws_document_chunks",
            "top_k": 5,
            "retrieval_query": "MATCH (node)-[:PART_OF]->(doc:KnowledgeDocument) RETURN node.text AS text, doc.filename AS source, score",
            "knowledge_documents": neo4j_doc_count,
            "indexed_chunks": neo4j_chunk_count,
        },
        "sqlite": {
            "path": "/app/data/advisor.db",
            "conversation_count": len(conv_count),
        },
        "prompts": {
            "gather": GATHER_PROMPT,
            "followup": FOLLOWUP_PROMPT,
            "advisor": ADVISOR_PROMPT.template if hasattr(ADVISOR_PROMPT, "template") else str(ADVISOR_PROMPT),
            "terraform": TERRAFORM_FULL_PROMPT,
        },
        "env": {
            "llm_api_key_set": bool(os.getenv("LLM_API_KEY")),
            "neo4j_uri": os.getenv("NEO4J_URI", "bolt://neo4j:7687"),
        },
    }

import uuid
import json
import os
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
from src.core.prompts import ADVISOR_PROMPT, COMPACT_PROMPT, TERRAFORM_FULL_PROMPT, GATHER_PROMPT
from src.db import database as db

router = APIRouter()
extractor = RequirementExtractor()
advisor = ArchitectureAdvisor()

# In-memory cache of generated Terraform HCL keyed by recommendation_id.
_terraform_cache: Dict[str, str] = {}

READY_MARKER = "[READY_TO_ARCHITECT]"


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


@router.post("/chat/stream")
async def chat_stream(request: "ChatRequest"):
    """
    SSE streaming chat endpoint. State-machine-driven:
    - 'gathering': Ask clarifying questions using GATHER_PROMPT. Detect [READY_TO_ARCHITECT]
      to auto-transition to 'presenting' and stream the architecture.
    - 'presenting' / 'complete': Stream the full architecture response.

    SSE events:
      data: {"type":"token","content":"..."}\n\n
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

            if state == "gathering":
                # Build gathering messages: system prompt + history + new user message
                gather_messages: List[BaseMessage] = [
                    SystemMessage(content=GATHER_PROMPT),
                    *history,
                    HumanMessage(content=request.message),
                ]
                full_response = ""
                async for chunk in llm.astream(gather_messages):
                    token = chunk.content or ""
                    if token:
                        full_response += token
                        yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

                # Persist this turn
                await asyncio.to_thread(db.save_message, conv_id, "human", request.message)

                if READY_MARKER in full_response:
                    # Strip marker from stored text
                    clean_response = full_response.replace(READY_MARKER, "").strip()
                    await asyncio.to_thread(db.save_message, conv_id, "ai", clean_response)
                    await asyncio.to_thread(db.set_state, conv_id, "presenting")

                    # Now generate the architecture
                    yield f"data: {json.dumps({'type': 'status', 'content': 'Designing your architecture…'})}\n\n"
                    updated_history = await asyncio.to_thread(db.get_history, conv_id)
                    requirements = await asyncio.to_thread(extractor.extract, request.message)
                    try:
                        plan: ArchitecturePlan = await advisor.get_recommendation(requirements, updated_history)
                    except StructuredOutputError as e:
                        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                        return

                    rec_id = str(uuid.uuid4())
                    await asyncio.to_thread(db.save_message, conv_id, "ai", plan.model_dump_json())
                    await asyncio.to_thread(db.set_state, conv_id, "presenting")

                    payload = {
                        "phase": "presenting",
                        "recommendation_id": rec_id,
                        "conversation_id": conv_id,
                        "text": plan.summary,
                        "diagram": plan.diagram,
                        "iac": [{"type": "terraform", "content": plan.iac_snippet}],
                        "costs": {
                            "total": plan.cost_estimate.total,
                            "breakdown": [b.model_dump() for b in plan.cost_estimate.breakdown],
                        },
                        "services": [
                            {"name": s.name, "description": s.description, "rationale": s.rationale}
                            for s in plan.services
                        ],
                    }
                    yield f"data: {json.dumps({'type': 'done', 'payload': payload})}\n\n"
                else:
                    await asyncio.to_thread(db.save_message, conv_id, "ai", full_response)
                    payload = {
                        "phase": "gathering",
                        "conversation_id": conv_id,
                        "text": full_response,
                    }
                    yield f"data: {json.dumps({'type': 'done', 'payload': payload})}\n\n"

            else:
                # presenting or complete — generate full architecture
                history_msgs: List[BaseMessage] = [
                    *history,
                    HumanMessage(content=request.message),
                ]
                requirements = await asyncio.to_thread(extractor.extract, request.message)
                await asyncio.to_thread(db.save_message, conv_id, "human", request.message)

                # Stream a status token so the frontend shows activity
                yield f"data: {json.dumps({'type': 'status', 'content': 'Updating architecture…'})}\n\n"

                try:
                    plan = await advisor.get_recommendation(requirements, history)
                except StructuredOutputError as e:
                    yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                    return

                rec_id = str(uuid.uuid4())
                await asyncio.to_thread(db.save_message, conv_id, "ai", plan.model_dump_json())

                payload = {
                    "phase": "presenting",
                    "recommendation_id": rec_id,
                    "conversation_id": conv_id,
                    "text": plan.summary,
                    "diagram": plan.diagram,
                    "iac": [{"type": "terraform", "content": plan.iac_snippet}],
                    "costs": {
                        "total": plan.cost_estimate.total,
                        "breakdown": [b.model_dump() for b in plan.cost_estimate.breakdown],
                    },
                    "services": [
                        {"name": s.name, "description": s.description, "rationale": s.rationale}
                        for s in plan.services
                    ],
                }
                yield f"data: {json.dumps({'type': 'done', 'payload': payload})}\n\n"

        except Exception as e:
            print(f"[Stream] Unhandled error for {conv_id}: {e}")
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

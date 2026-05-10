import uuid
import json
import os
import tempfile
import shutil
import asyncio
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain_openai import ChatOpenAI
from src.core.extractor import RequirementExtractor
from src.core.advisor import ArchitectureAdvisor
from src.core.models import ArchitecturePlan, ServiceDetail, StructuredOutputError
from src.core.prompts import ADVISOR_PROMPT, COMPACT_PROMPT, TERRAFORM_FULL_PROMPT

router = APIRouter()
extractor = RequirementExtractor()
advisor = ArchitectureAdvisor()

# In-memory conversation history keyed by conversation_id.
# Lost on container restart — v2 persistence is deferred (per D-13).
# Thread-safe for demo: FastAPI single-threaded asyncio event loop, no concurrent writes.
_conversation_history: Dict[str, List[BaseMessage]] = {}

# In-memory cache of generated Terraform HCL keyed by recommendation_id.
# Same pattern as _conversation_history — lost on container restart (acceptable for demo, per D-03).
_terraform_cache: Dict[str, str] = {}


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


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    # 1. Resolve conversation_id — use provided or create new UUID4 (D-15)
    conv_id = request.conversation_id or str(uuid.uuid4())

    # 2. Restore or initialize history
    if conv_id not in _conversation_history:
        # Restore from client cache if backend lost state (container restart)
        if request.history:
            _conversation_history[conv_id] = _deserialize_history(
                [m.model_dump() for m in request.history]
            )
        else:
            _conversation_history[conv_id] = []
    elif request.history is not None:
        # Client sends history: [] (empty) as authoritative signal to reset (clear flow)
        if len(request.history) == 0:
            _conversation_history[conv_id] = []

    history = _conversation_history[conv_id]

    # 3. Extract requirements — wrap sync call in thread to avoid blocking event loop
    requirements = await asyncio.to_thread(extractor.extract, request.message)

    # 4. Get structured recommendation (async, uses history for multi-turn context)
    try:
        plan: ArchitecturePlan = await advisor.get_recommendation(requirements, history)
    except StructuredOutputError as e:
        # D-20: return HTTP 200 with error field — frontend shows error bubble + toast
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

    # 5. Append this turn to history (AIMessage stores plan as JSON string — D-12, Pattern 4)
    history.append(HumanMessage(content=request.message))
    history.append(AIMessage(content=plan.model_dump_json()))
    _conversation_history[conv_id] = history

    # 6. Build response
    return ChatResponse(
        recommendation_id=str(uuid.uuid4()),           # CHAT-04: real UUID
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
    """
    Summarize conversation history into a compact system message.
    Replaces full history with a single SystemMessage carrying the summary.
    Architectural context is preserved (D-09).
    """
    history = _conversation_history.get(conversation_id, [])
    if not history:
        raise HTTPException(status_code=404, detail="Conversation not found or empty")

    try:
        summary = await advisor.compact_conversation(history)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Compaction failed: {e}")

    # Replace history with single SystemMessage carrying the summary
    _conversation_history[conversation_id] = [
        SystemMessage(content=f"Previous conversation summary:\n{summary}")
    ]

    return CompactResponse(
        conversation_id=conversation_id,
        summary=summary,
        message="Conversation compacted successfully.",
    )


@router.post("/chat/{conversation_id}/clear", response_model=ClearResponse)
async def clear_conversation(conversation_id: str):
    """
    Wipe conversation history for a session. conversation_id is retained (D-10).
    Next message to this conversation_id starts fresh.
    """
    if conversation_id in _conversation_history:
        del _conversation_history[conversation_id]

    return ClearResponse(
        conversation_id=conversation_id,
        message="Conversation history cleared.",
    )


@router.post("/chat/{conversation_id}/approve", response_model=ApproveResponse)
async def approve_plan(conversation_id: str, request: ApproveRequest):
    """
    Generate and validate a full Terraform HCL config for the approved plan.

    Two-step process (D-04):
    1. LLM generates full HCL from conversation history + TERRAFORM_FULL_PROMPT
    2. terraform validate subprocess checks for syntax errors

    Cache (D-03): If recommendation_id already in _terraform_cache, returns cached HCL
    (re-approval is idempotent — no duplicate LLM calls).

    Response: {recommendation_id, hcl, valid, validation_errors}
    - valid=True/False: terraform validate result
    - valid=None: terraform CLI not installed (dev env fallback)
    - validation_errors: list of error summary strings from terraform diagnostics
    HTTP 200 always — even on validation failure (frontend shows warning toast, D-05).
    """
    rec_id = request.recommendation_id
    history = _conversation_history.get(conversation_id, [])

    # Check cache first — idempotent re-approval
    if rec_id in _terraform_cache:
        hcl = _terraform_cache[rec_id]
    else:
        hcl = await _generate_full_terraform(history)
        _terraform_cache[rec_id] = hcl

    valid, errors = await _validate_terraform(hcl, rec_id)
    return ApproveResponse(
        recommendation_id=rec_id,
        hcl=hcl,
        valid=valid,
        validation_errors=errors,
    )

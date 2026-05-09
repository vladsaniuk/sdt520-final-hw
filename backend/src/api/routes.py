import uuid
import json
import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from src.core.extractor import RequirementExtractor
from src.core.advisor import ArchitectureAdvisor
from src.core.models import ArchitecturePlan, ServiceDetail, StructuredOutputError

router = APIRouter()
extractor = RequirementExtractor()
advisor = ArchitectureAdvisor()

# In-memory conversation history keyed by conversation_id.
# Lost on container restart — v2 persistence is deferred (per D-13).
# Thread-safe for demo: FastAPI single-threaded asyncio event loop, no concurrent writes.
_conversation_history: Dict[str, List[BaseMessage]] = {}


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

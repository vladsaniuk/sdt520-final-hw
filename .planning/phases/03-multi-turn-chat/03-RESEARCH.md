# Phase 3: Multi-Turn Chat — Research

**Researched:** 2026-05-10
**Domain:** LangChain async structured output · FastAPI in-memory session state · React localStorage conversation cache · context-fill heuristics · diff badges
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** History is **unlimited** — every turn is kept in memory for the session.
- **D-02:** No hard turn-count limit. Instead, track **context fill** (% of model's context window used) and surface it in the UI.
- **D-03:** Warning threshold is **model-aware** — derive max context tokens from the model being used (gpt-4o = 128k) and warn when fill exceeds ~75%.
- **D-04:** Show a **live pre-send estimate** (tiktoken or character approximation) before each message is sent.
- **D-05:** Update with **actual usage** (from `usage.prompt_tokens` in the LLM API response) after each turn.
- **D-06:** Display as a **progress bar + % label** in the chat interface.
- **D-07:** Both controls are always visible in the UI (persistent buttons in sidebar/header).
- **D-08:** A **dismissible warning banner** appears in the chat when context fill exceeds the model-aware threshold.
- **D-09:** **Compact** — calls the LLM to summarize the conversation into a shorter system-message block, replaces raw history with the summary. Architectural context is preserved.
- **D-10:** **Clear** — wipes history entirely; conversation starts fresh. `conversation_id` is retained (same session, fresh context).
- **D-11:** Conversation history is passed to the LLM as a **LangChain message list** (`[SystemMessage, HumanMessage, AIMessage, ...]`) via `llm.ainvoke(messages)`.
- **D-12:** The existing `ADVISOR_PROMPT` string becomes the `SystemMessage` content. Graph context and vector context are injected into the system message. Each user turn is a `HumanMessage`; each advisor response is an `AIMessage`.
- **D-13:** **Backend is source of truth** — in-memory `dict[conversation_id, List[BaseMessage]]` on the FastAPI server. History is lost on container restart (v2 persistence is deferred).
- **D-14:** **Client caches history in `localStorage`** keyed by `conversation_id`. On page refresh within a session, the client re-sends cached history to the backend to restore state. Backend accepts an optional `history` field in the request body for this purpose.
- **D-15:** Server assigns a new `conversation_id` (UUID4) if the request provides none.
- **D-16:** All LLM calls use `await llm.ainvoke(messages)` — no blocking `.invoke()` in async FastAPI handlers.
- **D-17:** Use `llm.with_structured_output(ArchitecturePlan)` where `ArchitecturePlan` is a Pydantic model with fields: `diagram: str`, `services: List[ServiceDetail]`, `iac_snippet: str`, `cost_estimate: CostBreakdown`.
- **D-18:** `recommendation_id` is a real `uuid.uuid4()` string.
- **D-19:** On parse failure, **retry once** with a corrective prompt.
- **D-20:** If the retry also fails: return HTTP 200 with an error payload; frontend shows both a dismissible error toast AND an error bubble in the conversation thread.
- **D-21:** Each refined plan appears as a **new chat bubble** below the previous one.
- **D-22:** Each response bubble shows a **diff badge** indicating what changed from the previous plan. Derived by comparing `services` list between turns.

### the Agent's Discretion
- Exact diff-badge visual design (color, placement, format) — keep consistent with AWS Console aesthetic established in Phase 02.1.
- Compaction prompt wording — use whatever produces a good architectural summary.
- tiktoken vs character-approximation for pre-send estimate — **character approximation chosen** per UI-SPEC Registry Safety (no tiktoken WASM bundle in frontend).

### Deferred Ideas (OUT OF SCOPE)
- Document ingestion (Phase 4)
- Terraform download (Phase 5)
- Conversation persistence across container restarts (deferred to v2)
- Streaming (SSE) chat responses (v2)

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHAT-01 | User can send a message and receive an architecture plan response (end-to-end, non-stub) | advisor.py refactor to async + structured output; routes.py wiring |
| CHAT-02 | Conversation history tracked per `conversation_id` — follow-up messages refine the previous plan | In-memory dict pattern; LangChain message list construction |
| CHAT-03 | All LLM calls use async (`ainvoke`/`astream`) — no blocking sync `.invoke()` in async handlers | `await llm.ainvoke(messages)` pattern; async FastAPI handler |
| CHAT-04 | Recommendation ID is a real UUID (not `"mock-uuid"`) | `str(uuid.uuid4())` already present in routes.py — carry through to structured response |
| CHAT-05 | LLM output parsed with structured output (Pydantic) — no brittle regex/string-split parsing | `llm.with_structured_output(ArchitecturePlan)` + retry-on-failure |
| CHAT-06 | Plan response includes: architecture diagram (Mermaid), service breakdown, IaC snippet preview, cost estimate | `ArchitecturePlan` Pydantic model fields; structured prompt |

</phase_requirements>

---

## Summary

Phase 3 wires multi-turn conversation history into the existing single-turn advisor pipeline. The
existing `ArchitectureAdvisor.get_recommendation()` becomes an async method that accepts a
`List[BaseMessage]` history, appends the current user turn, calls `await llm.with_structured_output(ArchitecturePlan).ainvoke(messages)`, and returns a typed Pydantic object. The FastAPI `POST /chat` handler gains an in-memory `dict[str, List[BaseMessage]]` keyed by `conversation_id` (UUID4). The frontend adds `conversation_id` tracking via localStorage, context-fill estimation via character approximation, diff badges comparing consecutive `services` lists, warning banners, and Compact/Clear sidebar controls.

The key technical complexity points are: (1) `with_structured_output()` compatibility with OpenRouter's non-OpenAI endpoint — requires using `method="json_mode"` or `method="function_calling"` depending on model support; (2) serializing `AIMessage` content when it contains a structured Pydantic object rather than a plain string; (3) FastAPI async thread-safety with the in-memory dict (fine — single-threaded asyncio event loop, no locks needed); (4) the retry-on-parse-failure pattern for structured output.

**Primary recommendation:** Use `llm.with_structured_output(ArchitecturePlan, method="json_mode")` with `include_raw=True` to expose parse errors; implement a single retry with a corrective user message; serialize AIMessage content as `json.dumps(plan.model_dump())` so history round-trips cleanly.

---

## Standard Stack

### Core (already in requirements.txt — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `langchain` | 1.2.x (latest 1.2.18) | Message types, chain helpers | Already used; BaseMessage, HumanMessage, AIMessage, SystemMessage live here |
| `langchain-openai` | 1.2.x (latest 1.2.1) | `ChatOpenAI` + `with_structured_output()` | Already used; wraps OpenAI-compatible endpoints |
| `langchain-core` | pulled by above | `BaseMessage` ABC | Transitive dep, always present |
| `pydantic` | ≥2.x (via fastapi) | `ArchitecturePlan` model definition | Already used for request/response models |
| `uuid` | stdlib | `uuid.uuid4()` for conversation IDs | Zero-dep, already imported in routes.py |

### Frontend (no new npm packages — UI-SPEC Registry Safety confirmed)

| Library | Version | Purpose |
|---------|---------|---------|
| `@chakra-ui/react` | ^2.10.9 | Alert, Tag, Progress, Toast — all used for new Phase 3 components |
| `react-icons` | ^5.6.0 | `MdCompress`, `MdClear`, `MdWarning` — already in package |

**No new backend or frontend packages required for Phase 3.**

### Version verification

Latest `langchain-openai` from PyPI index: **1.2.1** (confirmed via `pip3 index versions`)
Latest `langchain` from PyPI index: **1.2.18** (confirmed via `pip3 index versions`)

The project's `requirements.txt` pins no versions — installs will pull latest. Recommend pinning to `langchain>=1.2,<2` and `langchain-openai>=1.2,<2` in requirements.txt to avoid breaking changes.

---

## Architecture Patterns

### Recommended Project Structure Changes

```
backend/src/
├── core/
│   ├── advisor.py          # REFACTOR: get_recommendation → async get_recommendation(history, requirements)
│   ├── models.py           # NEW: ArchitecturePlan, ServiceDetail, CostBreakdown Pydantic models
│   └── prompts.py          # UPDATE: ADVISOR_PROMPT becomes SystemMessage content (no template formatting)
├── api/
│   └── routes.py           # UPDATE: conversation_id + history dict + new ChatRequest/Response models
│
frontend/src/
├── components/Chat/
│   └── ChatBox.tsx         # UPDATE: fillPercent state, warningBanner, diffBadges, error bubble, localStorage
├── App.tsx                 # UPDATE: real session list, Compact/Clear sidebar controls
└── hooks/
    └── useConversation.ts  # OPTIONAL: extract conversation_id + localStorage logic if preferred
```

### Pattern 1: LangChain Message List for Multi-Turn

**What:** Build the message list from scratch each call — `[SystemMessage(...), HumanMessage(...), AIMessage(...), ...]`. The system message is the advisor prompt with graph/vector context injected; it is rebuilt on every turn so context stays fresh.

**When to use:** Every time `get_recommendation()` is called. The caller provides the previous `List[BaseMessage]` history; the advisor appends the new user message before calling the LLM.

```python
# Source: LangChain docs — langchain-core BaseMessage types
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

async def get_recommendation(
    self,
    requirements: Dict[str, Any],
    history: List[BaseMessage],
) -> ArchitecturePlan:
    # Rebuild system message with fresh context each turn
    system_content = ADVISOR_SYSTEM_PROMPT.format(
        context=combined_context,
        requirements=json.dumps(requirements),
    )
    messages = [SystemMessage(content=system_content)]
    # Append prior history (human/AI turns from previous rounds)
    messages.extend(history)
    # Append current user turn
    messages.append(HumanMessage(content=json.dumps(requirements)))

    structured_llm = self.llm.with_structured_output(
        ArchitecturePlan, method="json_mode", include_raw=True
    )
    result = await structured_llm.ainvoke(messages)
    # result = {"raw": AIMessage, "parsed": ArchitecturePlan | None, "parsing_error": str | None}
    if result["parsing_error"]:
        # retry once
        ...
    return result["parsed"]
```

### Pattern 2: `with_structured_output()` with OpenRouter

**What:** `ChatOpenAI.with_structured_output(schema, method, include_raw)` wraps the LLM with a parser. OpenRouter proxies OpenAI-compatible endpoints. The `method` parameter controls how the schema is communicated to the model.

**Critical:** OpenRouter with `openai/gpt-4o` supports both `function_calling` (tool_use) and `json_mode`. **Use `method="json_mode"`** — it instructs the LLM to return raw JSON matching the schema, which is more reliable for complex nested Pydantic models and avoids OpenRouter function-call stripping issues.

**`include_raw=True`** is essential for the retry-on-failure pattern: it returns `{"raw": AIMessage, "parsed": Model | None, "parsing_error": str | None}` instead of raising immediately.

```python
# Source: LangChain docs — with_structured_output
structured_llm = self.llm.with_structured_output(
    ArchitecturePlan,
    method="json_mode",   # "json_mode" or "function_calling"
    include_raw=True,     # don't raise on parse failure
)
result = await structured_llm.ainvoke(messages)

if result["parsing_error"] is not None:
    # Retry once with corrective prompt
    messages.append(AIMessage(content=result["raw"].content))
    messages.append(HumanMessage(
        content=(
            "Your previous response was not valid JSON matching the schema. "
            "Please respond with ONLY a valid JSON object matching this schema:\n"
            + json.dumps(ArchitecturePlan.model_json_schema(), indent=2)
        )
    ))
    result = await structured_llm.ainvoke(messages)
    if result["parsing_error"] is not None:
        raise StructuredOutputError("Failed after retry")
return result["parsed"]
```

### Pattern 3: In-Memory Session Dict (FastAPI)

**What:** Module-level `dict` in `routes.py`, keyed by `conversation_id` → `List[BaseMessage]`.

**Thread safety:** FastAPI async handlers share a single asyncio event loop — no threads, no race conditions, no locks needed. The dict is accessed only within `async def chat()` which never yields between read and write.

**Caveat:** This dict is lost on process restart. That is accepted per D-13.

```python
# Source: FastAPI docs — module-level state
from typing import Dict, List
from langchain_core.messages import BaseMessage

# Module level — persistent for the lifetime of the process
_conversation_history: Dict[str, List[BaseMessage]] = {}

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    conv_id = request.conversation_id or str(uuid.uuid4())

    # Restore from client-sent history if backend has lost state (restart case)
    if conv_id not in _conversation_history:
        if request.history:
            _conversation_history[conv_id] = deserialize_history(request.history)
        else:
            _conversation_history[conv_id] = []

    history = _conversation_history[conv_id]

    # ... call advisor ...

    # Append this turn to history
    history.append(HumanMessage(content=json.dumps(requirements)))
    history.append(AIMessage(content=plan.model_dump_json()))  # serialize as JSON string
    _conversation_history[conv_id] = history

    return ChatResponse(conversation_id=conv_id, ...)
```

### Pattern 4: AIMessage Content Serialization for History Round-Trip

**What:** When the LLM returns a structured Pydantic object, the `AIMessage.content` in history should be the JSON string of the plan so it round-trips correctly through localStorage.

**Why:** If `AIMessage.content` is a raw `ArchitecturePlan` object (not a string), LangChain will serialize it to a string representation that may not be valid JSON for deserialization. Use `plan.model_dump_json()` or `json.dumps(plan.model_dump())`.

```python
# Store AI response as JSON string in history
ai_content = plan.model_dump_json()
history.append(HumanMessage(content=user_turn_json))
history.append(AIMessage(content=ai_content))
```

### Pattern 5: History Serialization for localStorage (Frontend)

**What:** `localStorage` can only store strings. The history must be serialized to JSON and deserialized back.

**Format:** Store an array of `{role: "human"|"ai"|"system", content: string}` objects. On reload, send this array in `request.history`. Backend deserializes using LangChain message constructors.

```typescript
// Frontend serialization
const serializeHistory = (messages: Message[]): StoredMessage[] =>
  messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      role: m.role === 'user' ? 'human' : 'ai',
      content: m.content,
    }))

// Backend deserialization
def deserialize_history(raw: list[dict]) -> list[BaseMessage]:
    result = []
    for item in raw:
        if item["role"] == "human":
            result.append(HumanMessage(content=item["content"]))
        elif item["role"] == "ai":
            result.append(AIMessage(content=item["content"]))
    return result
```

### Pattern 6: Compact Call

**What:** A separate `POST /api/v1/chat/compact` endpoint (or `POST /api/v1/chat/{conversation_id}/compact`) that sends the full conversation history to the LLM with a summarization instruction and returns a new condensed SystemMessage, replacing the history list.

```python
COMPACT_PROMPT = """
You are summarizing an architecture advisory conversation.
Produce a single concise summary of:
1. The architecture decisions made so far
2. Services selected and why
3. Key constraints and trade-offs identified

This summary will become the system context for the next conversation turn.
Keep it under 500 words. Preserve all specific AWS service names and decisions.
"""

async def compact_conversation(conv_id: str) -> str:
    history = _conversation_history.get(conv_id, [])
    summary_messages = [
        SystemMessage(content=COMPACT_PROMPT),
        *history,
        HumanMessage(content="Summarize the conversation above.")
    ]
    result = await self.llm.ainvoke(summary_messages)
    # Replace history with a single AIMessage carrying the summary
    _conversation_history[conv_id] = [
        SystemMessage(content=f"Previous conversation summary:\n{result.content}")
    ]
    return result.content
```

### Pattern 7: Diff Badge Computation (Frontend)

**What:** Compare `currentMsg.services.map(s => s.name)` vs `previousAssistantMsg.services.map(s => s.name)`. Set difference gives added/removed.

```typescript
function computeDiff(
  prev: ServiceDetail[] | undefined,
  curr: ServiceDetail[]
): { added: string[]; removed: string[] } {
  if (!prev) return { added: [], removed: [] }
  const prevNames = new Set(prev.map(s => s.name))
  const currNames = new Set(curr.map(s => s.name))
  return {
    added: curr.map(s => s.name).filter(n => !prevNames.has(n)),
    removed: prev.map(s => s.name).filter(n => !currNames.has(n)),
  }
}
```

### Pattern 8: Context Fill Estimation (Frontend)

**What:** Character-based token approximation. gpt-4o max context = 128,000 tokens.

```typescript
// Per UI-SPEC: Math.ceil(totalHistoryChars / 4)
const MODEL_MAX_TOKENS = 128_000
const WARN_THRESHOLD = 0.75

function estimateFillPercent(messages: Message[], currentInput: string): number {
  const allText = messages.map(m => m.content).join('') + currentInput
  const estimatedTokens = Math.ceil(allText.length / 4)
  return Math.min(Math.round((estimatedTokens / MODEL_MAX_TOKENS) * 100), 100)
}
```

After each response, update with actual token count from API:
```typescript
// response.usage?.prompt_tokens from API response
if (data.usage?.prompt_tokens) {
  const actual = Math.round((data.usage.prompt_tokens / MODEL_MAX_TOKENS) * 100)
  setFillPercent(Math.min(actual, 100))
}
```

### Anti-Patterns to Avoid

- **Blocking LLM call in async handler:** `result = self.llm.invoke(messages)` — MUST be `await llm.ainvoke(messages)`. Blocks the event loop, fails CHAT-03.
- **Storing raw Pydantic object in AIMessage:** `AIMessage(content=plan)` — LangChain expects `content: str`. Always `json.dumps(plan.model_dump())`.
- **Reconstructing history from frontend only:** If the backend has no history and the client sends none, every turn is treated as turn 1. Always pass `conversation_id` + `history` on every request.
- **Missing `include_raw=True`:** Without it, `with_structured_output()` raises `OutputParserException` immediately on parse failure instead of allowing retry.
- **Using `method="function_calling"` with OpenRouter proxied models:** Some OpenRouter-proxied models strip tool_call results. `json_mode` is safer and more portable.
- **tiktoken in frontend:** Adding tiktoken WASM to the React bundle adds ~1 MB and async initialization complexity. Character approximation (÷4) is accurate enough for a fill indicator. **Do not add tiktoken to frontend.**
- **Module-level `ArchitectureAdvisor` instantiation with sync init:** The `_retriever` lazy init in `advisor.py` is sync but deferred to first call — this is fine. Don't move it to async startup.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured LLM output parsing | Custom regex/JSON extraction from LLM text | `llm.with_structured_output(ArchitecturePlan)` | Handles function_calling / json_mode negotiation, schema injection, parse error handling |
| LLM message threading | Custom string concatenation with delimiters | `List[BaseMessage]` (SystemMessage/HumanMessage/AIMessage) | Standard format; LangChain handles token counting, serialization, model compatibility |
| UUID generation | Custom random string | `str(uuid.uuid4())` stdlib | Already used in routes.py; cryptographically random, URL-safe |
| Set difference for diff badges | Nested loops | `Set` operations in TypeScript | O(n) vs O(n²), handles duplicates |
| Context fill UI | Custom progress component | Chakra UI `Box` with width % + `transition` | Already in dependency; zero additional install |

**Key insight:** The structured output + retry pattern is the most error-prone custom code that already has battle-tested tooling in LangChain. Never implement your own JSON extraction from LLM text.

---

## Common Pitfalls

### Pitfall 1: `with_structured_output` + OpenRouter = Silent Failure

**What goes wrong:** OpenRouter proxies OpenAI's API but may not support all function-calling features for every model. With `method="function_calling"` (default), the tool call schema may be ignored or returned as plain text by some models.

**Why it happens:** OpenRouter translates tool_use calls to the upstream model but may strip or alter the response format depending on model/proxy version.

**How to avoid:** Use `method="json_mode"` explicitly. Add `response_format={"type": "json_object"}` to the LLM init if needed. Test with a simple schema first before the full `ArchitecturePlan`.

**Warning signs:** `result["parsed"]` is `None` on every call even for well-formed prompts; `result["raw"].content` contains plain text instead of JSON.

### Pitfall 2: `ainvoke` on a Wrapped Structured LLM

**What goes wrong:** `structured_llm = llm.with_structured_output(...)` returns a `Runnable`. `await structured_llm.ainvoke(messages)` works correctly. Calling `.invoke()` instead blocks the event loop.

**Why it happens:** Confusion about whether the wrapper is still awaitable. It is — `Runnable.ainvoke()` is always available.

**How to avoid:** Always `await structured_llm.ainvoke(messages)` — never `.invoke()` inside async FastAPI handlers.

**Warning signs:** `RuntimeWarning: coroutine was never awaited`; event loop blocks on slow LLM calls; concurrent requests queue.

### Pitfall 3: History Not Restored After Container Restart

**What goes wrong:** Backend process restarts → `_conversation_history` dict is empty → client sends `conversation_id` with no `history` field → backend creates new empty history → next turn has no prior context.

**Why it happens:** Client was not sending `history` field on every request (only on first after refresh).

**How to avoid:** Client sends full `history` array (serialized HumanMessage/AIMessage pairs) on **every** request, not just after refresh. Backend always checks: if `conv_id` not in dict, populate from `request.history`.

**Warning signs:** Second turn in a session produces a plan with no reference to first turn; no history in FastAPI logs.

### Pitfall 4: Incorrect `ChatRequest` Breaking Existing Clients

**What goes wrong:** Adding required `conversation_id` field to `ChatRequest` breaks the existing frontend (which doesn't send it yet) while backend is updated.

**Why it happens:** `Optional[str] = None` vs `str` in Pydantic model.

**How to avoid:** `conversation_id: Optional[str] = None` and `history: Optional[List[dict]] = None` — both optional. Backend assigns UUID when absent.

### Pitfall 5: `ADVISOR_PROMPT` is a `PromptTemplate`, Not a String

**What goes wrong:** Current `ADVISOR_PROMPT` is `PromptTemplate(input_variables=["context", "requirements"], template=...)`. Passing it directly as `SystemMessage(content=ADVISOR_PROMPT)` will store the `PromptTemplate` object, not a string.

**Why it happens:** Forgot to call `.format(context=..., requirements=...)` before wrapping in `SystemMessage`.

**How to avoid:** Always call `ADVISOR_PROMPT.format(context=combined_context, requirements=requirements_text)` to get a plain string before constructing `SystemMessage(content=...)`.

### Pitfall 6: `AIMessage.content` Type Check at Serialization

**What goes wrong:** In newer LangChain versions, `AIMessage.content` can be `str | list[str | dict]` (for multi-modal models). The `json.dumps()` call fails if content is a list.

**Why it happens:** LangChain 1.x with tool_use models may return `content` as a list of content blocks.

**How to avoid:** Always store structured plan content as `AIMessage(content=plan.model_dump_json())` — an explicit JSON string — not relying on LangChain to extract it from `result["raw"]`.

### Pitfall 7: localStorage `history` Grows Unbounded

**What goes wrong:** localStorage has a 5 MB limit. With unlimited turns and large plan JSON, the serialized history can exceed this.

**Why it happens:** D-01 allows unlimited turns. Structured plan responses can be 2–5 KB each.

**How to avoid:** On localStorage write, check estimated size before saving. If near limit (4 MB), trim the oldest HumanMessage/AIMessage pairs from the cached history (keep the most recent N turns for restoration). The backend still has the full history while the process is running.

---

## Code Examples

### ArchitecturePlan Pydantic Model

```python
# backend/src/core/models.py — NEW FILE
from pydantic import BaseModel, Field
from typing import List

class ServiceDetail(BaseModel):
    name: str = Field(description="AWS service name, e.g. 'ECS Fargate'")
    description: str = Field(description="What this service does in the architecture")
    rationale: str = Field(description="Why this service was chosen")

class CostBreakdown(BaseModel):
    per_service: List[dict] = Field(
        description="List of {service, monthly_cost_usd} estimates",
        default_factory=list
    )
    total_monthly_usd: float = Field(description="Total estimated monthly cost in USD")
    disclaimer: str = Field(
        default="Estimates are approximate. Actual costs depend on usage.",
        description="Cost disclaimer"
    )

class ArchitecturePlan(BaseModel):
    diagram: str = Field(description="Mermaid.js diagram definition string")
    services: List[ServiceDetail] = Field(description="Selected AWS services with reasoning")
    iac_snippet: str = Field(description="Terraform HCL preview for core resources")
    cost_estimate: CostBreakdown = Field(description="Estimated monthly cost breakdown")
    summary: str = Field(description="2-3 sentence architecture overview")
```

### Updated ChatRequest / ChatResponse

```python
# backend/src/api/routes.py — updated models
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage

class StoredMessage(BaseModel):
    role: str   # "human" or "ai"
    content: str

class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    history: Optional[List[StoredMessage]] = None  # client sends on restore

class ServiceDetailResponse(BaseModel):
    name: str
    description: str
    rationale: str

class CostBreakdownResponse(BaseModel):
    per_service: List[dict]
    total_monthly_usd: float
    disclaimer: str

class ChatResponse(BaseModel):
    recommendation_id: str
    conversation_id: str
    diagram: str
    services: List[ServiceDetailResponse]
    iac_snippet: str
    cost_estimate: CostBreakdownResponse
    summary: str
    usage: Optional[dict] = None  # {"prompt_tokens": N} for frontend fill bar
```

### Complete async `get_recommendation`

```python
# backend/src/core/advisor.py — refactored method
import json
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, BaseMessage
from src.core.models import ArchitecturePlan

class StructuredOutputError(Exception):
    pass

class ArchitectureAdvisor:
    def __init__(self):
        self.llm = ChatOpenAI(
            model="openai/gpt-4o",
            openai_api_key=os.getenv("LLM_API_KEY"),
            openai_api_base="https://openrouter.ai/api/v1",
            model_kwargs={"response_format": {"type": "json_object"}},  # json_mode hint
        )
        # ... neo4j graph init ...

    async def get_recommendation(
        self,
        requirements: dict,
        history: list[BaseMessage],
    ) -> ArchitecturePlan:
        # 1. Build context
        graph_context = self.graph.query(CONTEXT_QUERY)
        requirements_text = json.dumps(requirements)
        vector_context = _get_vector_context(requirements_text)
        combined_context = str(graph_context)
        if vector_context:
            combined_context += f"\n\n--- Uploaded document excerpts ---\n{vector_context}"

        # 2. Build message list
        system_content = ADVISOR_PROMPT.format(
            context=combined_context,
            requirements=requirements_text,
        )
        messages: list[BaseMessage] = [SystemMessage(content=system_content)]
        messages.extend(history)   # prior HumanMessage/AIMessage pairs
        messages.append(HumanMessage(content=requirements_text))

        # 3. Invoke with structured output
        structured_llm = self.llm.with_structured_output(
            ArchitecturePlan,
            method="json_mode",
            include_raw=True,
        )
        result = await structured_llm.ainvoke(messages)

        # 4. Retry once on parse failure
        if result["parsing_error"] is not None:
            messages.append(AIMessage(content=str(result["raw"].content)))
            messages.append(HumanMessage(
                content=(
                    "Your previous response could not be parsed as JSON. "
                    "Respond ONLY with a valid JSON object matching this schema:\n"
                    + json.dumps(ArchitecturePlan.model_json_schema(), indent=2)
                )
            ))
            result = await structured_llm.ainvoke(messages)
            if result["parsing_error"] is not None:
                raise StructuredOutputError(str(result["parsing_error"]))

        return result["parsed"]
```

### Frontend: Message Interface Extension

```typescript
// frontend/src/components/Chat/ChatBox.tsx — updated interfaces

interface ServiceDetail {
  name: string
  description: string
  rationale: string
}

interface CostBreakdown {
  per_service: Array<{ service: string; monthly_cost_usd: number }>
  total_monthly_usd: number
  disclaimer: string
}

interface Message {
  role: 'user' | 'assistant' | 'error'
  content: string
  diagram?: string
  services?: ServiceDetail[]       // NEW — for diff badge computation
  iac_snippet?: string             // NEW — single string from structured output
  cost_estimate?: CostBreakdown    // NEW — typed
  conversationId?: string          // NEW — track which conv this belongs to
}

interface ConversationSession {
  id: string
  title: string           // first user message, max 32 chars
  turnCount: number
  updatedAt: Date
}
```

### Frontend: localStorage Helpers

```typescript
// Per UI-SPEC: key = "aws-advisor-conversation-id"
// History key: "aws-advisor-history-{conversation_id}"

const CONV_ID_KEY = 'aws-advisor-conversation-id'

function getStoredConversationId(): string | null {
  return localStorage.getItem(CONV_ID_KEY)
}

function saveConversationId(id: string): void {
  localStorage.setItem(CONV_ID_KEY, id)
}

function saveHistory(conversationId: string, messages: Message[]): void {
  const stored = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role === 'user' ? 'human' : 'ai', content: m.content }))
  try {
    localStorage.setItem(`aws-advisor-history-${conversationId}`, JSON.stringify(stored))
  } catch {
    // localStorage quota exceeded — silently ignore (backend still has history)
  }
}

function loadHistory(conversationId: string): Array<{role: string, content: string}> {
  const raw = localStorage.getItem(`aws-advisor-history-${conversationId}`)
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `llm.invoke(prompt_string)` | `await llm.ainvoke(List[BaseMessage])` | LangChain 0.2+ | Enables multi-turn history, async, structured output |
| Custom JSON parsing from LLM text | `llm.with_structured_output(PydanticModel)` | LangChain 0.2+ | Eliminates brittle parsing; automatic schema injection |
| `PromptTemplate.format()` → string | `SystemMessage(content=formatted_string)` | LangChain 0.1+ | Part of standard multi-turn pattern |
| Sync `advisor.get_recommendation()` | `async def get_recommendation()` | Phase 3 | Required for CHAT-03; enables concurrent requests |

**Deprecated / outdated patterns to avoid:**
- `LLMChain(llm, prompt)` → replaced by `llm.ainvoke(messages)` directly
- `ConversationBufferMemory` → replaced by explicit `List[BaseMessage]` passed to `ainvoke`
- `OutputParser` + `PydanticOutputParser` → replaced by `with_structured_output()`

---

## Open Questions

1. **Does OpenRouter return `usage.prompt_tokens` in responses?**
   - What we know: OpenAI API spec includes `usage` object with `prompt_tokens`, `completion_tokens`, `total_tokens` on chat completions.
   - What's unclear: OpenRouter may or may not forward this field depending on the upstream model and pricing tier.
   - Recommendation: Test in the first wave. If absent, fall back to character approximation post-send as well. Frontend should handle `data.usage?.prompt_tokens` as optional.

2. **`method="json_mode"` vs `method="function_calling"` for OpenRouter + gpt-4o**
   - What we know: Both are supported by `langchain-openai`. OpenRouter says it supports JSON mode for gpt-4o.
   - What's unclear: Whether `response_format: {"type": "json_object"}` in the model_kwargs conflicts with LangChain's internal schema injection when using `with_structured_output`.
   - Recommendation: Use `method="json_mode"` on the `with_structured_output()` call and **omit** the `model_kwargs` `response_format` override (let LangChain set it). If parse failures occur, switch to `method="function_calling"`.

3. **`_get_vector_context()` is sync inside an async method**
   - What we know: `_get_vector_context()` calls `retriever.search()` which is a blocking network call.
   - What's unclear: Whether `neo4j-graphrag`'s `VectorCypherRetriever.search()` has an async version.
   - Recommendation: Wrap in `asyncio.get_event_loop().run_in_executor(None, _get_vector_context, query)` to prevent blocking the event loop, OR accept the blocking call (low latency risk for a demo tool).

4. **Compaction endpoint: separate route or flag on `/chat`?**
   - What we know: UI-SPEC specifies `POST /api/v1/chat/compact` as a separate endpoint.
   - Recommendation: Use a separate `POST /api/v1/chat/{conversation_id}/compact` endpoint — cleaner separation of concerns, matches UI-SPEC.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.11+ | Backend | ✓ | macOS system / Docker | — |
| `langchain` | History + chain | ✓ (latest 1.2.18 on PyPI) | to be pinned | — |
| `langchain-openai` | `ChatOpenAI`, `with_structured_output` | ✓ (1.2.1 on PyPI) | to be pinned | — |
| `langchain-core` | `BaseMessage` types | ✓ (transitive dep) | auto | — |
| OpenRouter API | LLM calls | ✓ (env `LLM_API_KEY`) | — | — |
| `tiktoken` (backend) | Token count for `usage` fallback | not in requirements.txt | — | Use response `usage.prompt_tokens` from API; character approximation in frontend |
| `react-icons` `MdCompress` | Compact button | ✓ (^5.6.0 installed) | 5.6.0 | — |

**No blocking missing dependencies.** `tiktoken` is not needed — `usage.prompt_tokens` from API response is sufficient for post-send accuracy; character approximation is confirmed for pre-send.

---

## Project Constraints (from copilot-instructions.md / CLAUDE.md)

CLAUDE.md specifies the **code-review-graph MCP tools** are available and should be used BEFORE grep/glob/read for codebase exploration. This is relevant for the planner but does not constrain the implementation stack.

- Use `semantic_search_nodes`, `query_graph`, `get_impact_radius` to trace callers/callees before modifying files.
- `detect_changes` + `get_review_context` for code review tasks.

No technology restrictions or forbidden patterns are specified in CLAUDE.md beyond the MCP tool preference.

---

## Sources

### Primary (HIGH confidence)
- LangChain source code / PyPI 1.2.x — `with_structured_output`, `ainvoke`, `BaseMessage` types
- `pip3 index versions langchain` — confirmed 1.2.18 latest; `langchain-openai` 1.2.1
- Existing codebase: `advisor.py`, `routes.py`, `prompts.py` — direct inspection of current sync pattern
- `package.json` — confirmed all required Chakra/react-icons/mermaid deps present, no new installs needed
- `03-UI-SPEC.md` — authoritative design contract; character approximation confirmed; no tiktoken

### Secondary (MEDIUM confidence)
- OpenRouter API compatibility with `json_mode` — known to support OpenAI-compatible `response_format`; not independently verified against langchain-openai 1.2.x in this specific env
- `asyncio` thread-safety of module-level dict in FastAPI — standard Python asyncio single-loop model; no locks required

### Tertiary (LOW confidence)
- OpenRouter `usage.prompt_tokens` field availability — presumed based on OpenAI spec compatibility; must verify at runtime

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified via PyPI index; no new installs required
- Architecture patterns: HIGH — based on direct code inspection + LangChain 1.2.x API (current)
- Pitfalls: HIGH — based on direct code inspection of current sync patterns + known OpenRouter compatibility issues
- Frontend patterns: HIGH — based on direct ChatBox.tsx / App.tsx / UI-SPEC inspection

**Research date:** 2026-05-10
**Valid until:** 2026-06-10 (LangChain moves fast; re-verify if >30 days)

# Phase 3: Multi-Turn Chat — Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire conversation history and structured LLM output so users can hold iterative
conversations that refine their architecture plan in context. This is the core UX value
loop: user sends a follow-up ("use ECS instead of EKS") → advisor returns a contextually
grounded refinement, not a fresh generic plan.

**In scope:** history storage, LLM async wiring, structured Pydantic output, context fill
tracking, compaction/clear controls, diff badges, error handling.

**Out of scope:** document ingestion (Phase 4), Terraform download (Phase 5), conversation
persistence across container restarts (deferred to v2).

</domain>

<decisions>
## Implementation Decisions

### Conversation History Window
- **D-01:** History is **unlimited** — every turn is kept in memory for the session.
- **D-02:** No hard turn-count limit. Instead, track **context fill** (% of model's context
  window used) and surface it in the UI.
- **D-03:** Warning threshold is **model-aware** — derive max context tokens from the model
  being used (gpt-4o = 128k) and warn when fill exceeds ~75%.

### Context Fill Display
- **D-04:** Show a **live pre-send estimate** (tiktoken or character approximation) before
  each message is sent.
- **D-05:** Update with **actual usage** (from `usage.prompt_tokens` in the LLM API
  response) after each turn.
- **D-06:** Display as a **progress bar + % label** in the chat interface (e.g., in the
  input area footer or sidebar stats panel).

### Compaction & Clear Controls
- **D-07:** Both controls are always visible in the UI (persistent buttons in sidebar/header).
- **D-08:** A **dismissible warning banner** appears in the chat when context fill exceeds
  the model-aware threshold.
- **D-09:** **Compact** — calls the LLM to summarize the conversation into a shorter
  system-message block, replaces raw history with the summary. Architectural context is
  preserved.
- **D-10:** **Clear** — wipes history entirely; conversation starts fresh. `conversation_id`
  is retained (same session, fresh context).

### History Injection Strategy
- **D-11:** Conversation history is passed to the LLM as a **LangChain message list**
  (`[SystemMessage, HumanMessage, AIMessage, ...]`) via `llm.ainvoke(messages)`.
- **D-12:** The existing `ADVISOR_PROMPT` string becomes the `SystemMessage` content.
  Graph context and vector context are injected into the system message. Each user turn is
  a `HumanMessage`; each advisor response is an `AIMessage`.

### History Storage
- **D-13:** **Backend is source of truth** — in-memory `dict[conversation_id, List[BaseMessage]]`
  on the FastAPI server. History is lost on container restart (v2 persistence is deferred).
- **D-14:** **Client caches history in `localStorage`** keyed by `conversation_id`. On page
  refresh within a session, the client re-sends cached history to the backend to restore state.
  Backend accepts an optional `history` field in the request body for this purpose.
- **D-15:** Server assigns a new `conversation_id` (UUID4) if the request provides none.

### Async LLM Calls
- **D-16:** All LLM calls use `await llm.ainvoke(messages)` — no blocking `.invoke()` in
  async FastAPI handlers. (Implements CHAT-03.)

### Structured Output (Pydantic)
- **D-17:** Use `llm.with_structured_output(ArchitecturePlan)` where `ArchitecturePlan` is
  a Pydantic model with fields:
  - `diagram: str` — Mermaid diagram string
  - `services: List[ServiceDetail]` — name, description, rationale per service
  - `iac_snippet: str` — Terraform HCL preview
  - `cost_estimate: CostBreakdown` — per-service + total estimate
- **D-18:** `recommendation_id` is a real `uuid.uuid4()` string. (Implements CHAT-04.)

### Structured Output Fallback
- **D-19:** On parse failure, **retry once** with a corrective prompt (e.g., "Please
  respond with valid JSON matching the schema…").
- **D-20:** If the retry also fails: return HTTP 200 with an error payload; frontend shows
  **both** a dismissible error toast AND an error bubble in the conversation thread (so the
  user sees when/where the failure occurred in history).

### Refinement UX (Frontend)
- **D-21:** Each refined plan appears as a **new chat bubble** below the previous one —
  responses stack in the scrollable thread. Consistent with Phase 02.1 mock UX.
- **D-22:** Each response bubble shows a **diff badge** indicating what changed from the
  previous plan (e.g., "+ECS −EKS"). The badge is derived by comparing the `services` list
  of the current response to the previous one (added/removed service names).

### the Agent's Discretion
- Exact diff-badge visual design (color, placement, format) — keep consistent with the
  AWS Console aesthetic established in Phase 02.1.
- Compaction prompt wording — use whatever produces a good architectural summary.
- tiktoken vs character-approximation for pre-send estimate — agent chooses based on what's
  already available in the frontend dependencies.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `REQUIREMENTS.md` §CHAT — CHAT-01 through CHAT-06 (full requirement list for this phase)
- `.planning/ROADMAP.md` §Phase 3 — success criteria and dependency chain

### Prior Phase Context
- `.planning/phases/02-graph-seeding-document-ingestion/02-CONTEXT.md` — embeddings model
  (sentence-transformers all-MiniLM-L6-v2, 384-dim), seeding decisions, vector retriever setup
- `.planning/phases/02.1-ui-polish-visual-design/02.1-CONTEXT.md` — AWS Console UI style,
  Geist font, component decisions; Phase 3 conversation history is mocked here and needs real wiring

### Existing Code (must read before planning)
- `backend/src/core/advisor.py` — current sync `get_recommendation()` — must become async,
  accept history, use `with_structured_output()`
- `backend/src/api/routes.py` — current `POST /chat` handler — must accept `conversation_id`
  and optional `history`, store/retrieve from in-memory dict
- `backend/src/core/prompts.py` — `ADVISOR_PROMPT` template — becomes `SystemMessage` content

### No External Specs
No ADRs or external docs referenced — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ArchitectureAdvisor.get_recommendation()`: existing graph + vector retrieval logic is reusable — only the LLM call and output parsing need to change
- `_get_retriever()` / `_get_vector_context()`: vector retrieval helpers are already async-safe (no blocking IO)
- `ADVISOR_PROMPT`: becomes `SystemMessage` content; graph context injection pattern stays the same
- Phase 02.1 chat bubbles: UI components already render Mermaid, IaC snippets, cost tables — just need real data from structured output

### Established Patterns
- Async FastAPI handlers: `async def chat(request: ChatRequest)` — handler is already async, LLM call inside is not yet async
- Pydantic response models: `ChatResponse` exists but fields are loosely typed — needs updating to match `ArchitecturePlan` structure
- UUID generation: `str(uuid.uuid4())` already used in routes.py — confirmed correct pattern for CHAT-04

### Integration Points
- `POST /chat` in `routes.py` is the entry point — history dict and `conversation_id` wiring goes here
- `ArchitectureAdvisor` instantiated at module level in `routes.py` — in-memory history dict lives at the same scope
- Frontend `ChatPage` / message state — `localStorage` caching of `conversation_id` + history connects here

</code_context>

<specifics>
## Specific Ideas

- Context fill stats panel: user described wanting live context fill visible in the interface — make it a visible element (progress bar + numbers), not just a hidden warning trigger
- Compaction: user wants this to preserve architectural context — the compaction prompt should emphasize "summarize the architecture decisions made so far"
- Warning banner: should include "Compact" and "Clear" CTAs inline, not just inform

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-multi-turn-chat*
*Context gathered: 2026-05-10*

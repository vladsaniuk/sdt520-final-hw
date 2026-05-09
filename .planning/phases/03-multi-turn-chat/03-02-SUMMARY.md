---
phase: 03-multi-turn-chat
plan: "02"
subsystem: backend-api
tags:
  - conversation-history
  - multi-turn-chat
  - fastapi
  - langchain
dependency_graph:
  requires:
    - "03-01 (ArchitecturePlan, StructuredOutputError, async advisor)"
  provides:
    - "POST /api/v1/chat — async handler with conversation history + StructuredOutputError handling"
    - "POST /api/v1/chat/{conversation_id}/compact — LLM summarization + history replacement"
    - "POST /api/v1/chat/{conversation_id}/clear — history deletion"
    - "_conversation_history module-level dict"
  affects:
    - "frontend — ChatResponse now includes conversation_id, services, error fields"
tech_stack:
  added: []
  patterns:
    - "In-memory history: Dict[str, List[BaseMessage]] at module level"
    - "AIMessage stores plan as JSON string (model_dump_json) — not raw Pydantic"
    - "Client history deserialization: [{role, content}] -> List[BaseMessage]"
    - "StructuredOutputError caught -> HTTP 200 with error field (D-20)"
    - "asyncio.to_thread for sync extractor.extract call"
key_files:
  modified:
    - "backend/src/api/routes.py"
decisions:
  - "History stored in module-level dict (in-memory, lost on restart) — persistence deferred to v2 (D-13)"
  - "Client sends history list for state restoration after container restart (D-14)"
  - "AIMessage content = plan.model_dump_json() — JSON string, not Pydantic object (D-12)"
  - "StructuredOutputError returns HTTP 200 with error field, not 4xx/5xx (D-20)"
  - "compact endpoint replaces history with single SystemMessage (D-09)"
  - "clear endpoint deletes history entry entirely (D-10)"
metrics:
  duration: "~2 minutes"
  completed: "2026-05-09"
  tasks_completed: 2
  files_modified: 1
---

# Phase 03 Plan 02: Conversation History + Chat Endpoint Wiring Summary

**One-liner:** In-memory conversation history dict wired into async POST /chat handler with UUID4 conversation_id lifecycle, compact (LLM summarization → SystemMessage) and clear (history deletion) endpoints.

## What Was Built

Complete rewrite of `backend/src/api/routes.py` to implement Phase 3 backend API surface:

### Module-Level State
- `_conversation_history: Dict[str, List[BaseMessage]] = {}` — in-memory store keyed by conversation_id
- Removed dead module-level instances: `DiagramGenerator`, `TerraformGenerator`, `CloudFormationGenerator`, `CostAnalyzer`

### Helper Function
- `_deserialize_history(raw: List[dict]) -> List[BaseMessage]` — converts client `[{role, content}]` list into LangChain `HumanMessage`/`AIMessage` objects

### New/Updated Pydantic Models
- `StoredMessage(role, content)` — for client-serialized history wire format
- `ChatRequest` — extended with `conversation_id: Optional[str]` and `history: Optional[List[StoredMessage]]`
- `ChatResponse` — extended with `conversation_id`, `services`, `usage`, `error` fields
- `ServiceDetailResponse(name, description, rationale)` — for diff badge computation in frontend
- `CompactResponse(conversation_id, summary, message)` — compact endpoint response
- `ClearResponse(conversation_id, message)` — clear endpoint response

### Endpoints

**`POST /chat`** (rewritten):
1. Assigns `conv_id = request.conversation_id or str(uuid.uuid4())` (D-15)
2. Restores history from client cache if backend lost state (container restart)
3. Wraps sync `extractor.extract()` in `asyncio.to_thread()`
4. Calls `await advisor.get_recommendation(requirements, history)`
5. Catches `StructuredOutputError` → returns HTTP 200 with `error` field (D-20)
6. Appends `HumanMessage(content=request.message)` + `AIMessage(content=plan.model_dump_json())` to history
7. Returns full `ChatResponse` with `conversation_id`, `services`, `diagram`, `iac`, `costs`

**`POST /chat/{conversation_id}/compact`** (new):
- Fetches history, raises 404 if empty/missing
- Calls `await advisor.compact_conversation(history)`
- Replaces history with `[SystemMessage(content=f"Previous conversation summary:\n{summary}")]`
- Returns `CompactResponse` with summary string

**`POST /chat/{conversation_id}/clear`** (new):
- Deletes `_conversation_history[conversation_id]` if exists (safe if not found)
- Returns `ClearResponse`

## Verification

```
Syntax check: PASSED
Routes found: ['/chat', '/chat/{conversation_id}/compact', '/chat/{conversation_id}/clear']
Dead imports check: OK (DiagramGenerator, TerraformGenerator, CloudFormationGenerator, CostAnalyzer removed)
Async handler: async def chat — CONFIRMED
History append: history.append(AIMessage(content=plan.model_dump_json())) — CONFIRMED
Imports at top-level only: lines [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] — CONFIRMED
```

## Deviations from Plan

None — plan executed exactly as written. Tasks 1 and 2 were implemented in a single atomic rewrite of routes.py as the plan specified (Task 2 explicitly said "append endpoints, don't rewrite" but since Task 1 was already a complete rewrite, both were combined in one operation with all content included).

## Known Stubs

None — all endpoints wire to real advisor implementation from Plan 03-01.

## Self-Check: PASSED

- [x] `backend/src/api/routes.py` exists and has syntax-valid Python
- [x] Commit `48ec943` exists in git log
- [x] All 3 routes present: `/chat`, `/chat/{conversation_id}/compact`, `/chat/{conversation_id}/clear`
- [x] Dead imports removed
- [x] `_conversation_history` dict at module level
- [x] `AIMessage(content=plan.model_dump_json())` pattern confirmed

---
phase: "03"
plan: "01"
subsystem: backend
tags: [langchain, structured-output, pydantic, advisor, async]
dependency_graph:
  requires: []
  provides: [ArchitecturePlan, StructuredOutputError, async-advisor]
  affects: [backend/src/api/routes.py, frontend chat response shape]
tech_stack:
  added: []
  patterns: [with_structured_output(json_mode), include_raw=True retry, LangChain message list]
key_files:
  created:
    - backend/src/core/models.py
  modified:
    - backend/src/core/prompts.py
    - backend/src/core/advisor.py
decisions:
  - "Use method='json_mode' with include_raw=True for OpenRouter compatibility — allows retry on parse failure"
  - "ADVISOR_PROMPT.format() called before SystemMessage wrapping — never pass PromptTemplate directly"
  - "compact_conversation() added to ArchitectureAdvisor for future context window compression"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-09"
  tasks: 2
  files: 3
---

# Phase 03 Plan 01: Async Structured Advisor — Summary

**One-liner:** Async `get_recommendation(requirements, history)` with `with_structured_output(ArchitecturePlan, method="json_mode", include_raw=True)` + single retry on parse failure, returning typed `ArchitecturePlan` Pydantic object.

## What Was Built

### Task 1: Create models.py + update prompts.py

Created `backend/src/core/models.py` with five Pydantic exports:
- `ServiceDetail` — AWS service with name, description, rationale
- `ServiceCost` — per-service cost with `is_calculated: bool` (matches frontend CostTable)
- `CostEstimate` — total + breakdown list
- `ArchitecturePlan` — unified response: summary, diagram (Mermaid), services, iac_snippet, cost_estimate
- `StructuredOutputError` — raised on double parse failure

Updated `backend/src/core/prompts.py`:
- `ADVISOR_PROMPT` template body replaced to guide LLM toward `ArchitecturePlan` JSON schema (retains `PromptTemplate` with `input_variables=["context", "requirements"]`)
- Added `COMPACT_PROMPT` plain string constant for conversation history compression

### Task 2: Refactor advisor.py — async + structured output + retry

Refactored `ArchitectureAdvisor.get_recommendation()`:
- Signature changed to `async def get_recommendation(self, requirements, history: List[BaseMessage]) -> ArchitecturePlan`
- Uses `self.llm.with_structured_output(ArchitecturePlan, method="json_mode", include_raw=True)`
- Awaits `structured_llm.ainvoke(messages)` — no blocking `.invoke()` calls
- On `parsing_error` → single retry with corrective prompt + schema
- On double failure → raises `StructuredOutputError`
- `ADVISOR_PROMPT.format(context=..., requirements=...)` called before `SystemMessage(content=...)`
- Message list: `[SystemMessage] + history + [HumanMessage(current)]`

Added `compact_conversation(self, history) -> str` async method using `COMPACT_PROMPT` for future context compression endpoint.

## Verification Results

All checks passed via Docker exec:
```
1. models OK — all 5 exports importable
2. advisor async OK — inspect.iscoroutinefunction confirmed
3. prompts OK — ADVISOR_PROMPT has context+requirements vars; COMPACT_PROMPT is str
No sync .invoke() found in advisor.py
```

## Commits

| Task | Hash | Message |
|------|------|---------|
| Task 1 | 782f10d | feat(03-01): add ArchitecturePlan Pydantic models and update ADVISOR_PROMPT for JSON output |
| Task 2 | 6e57b98 | feat(03-01): refactor advisor.py to async with structured output and retry |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None introduced. `routes.py` still calls the old sync `advisor.get_recommendation(requirements)` without `history` — this is expected to be wired up in Plan 03-02 (routes refactor).

## Self-Check: PASSED

- ✅ `backend/src/core/models.py` — exists
- ✅ `backend/src/core/prompts.py` — exists
- ✅ `backend/src/core/advisor.py` — exists
- ✅ `.planning/phases/03-multi-turn-chat/03-01-SUMMARY.md` — exists
- ✅ Commit `782f10d` — found in git log
- ✅ Commit `6e57b98` — found in git log

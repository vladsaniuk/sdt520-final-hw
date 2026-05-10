# Coding Conventions

**Analysis Date:** 2025-07-17

---

## Overview

Full-stack project: **Python/FastAPI backend** (`backend/`) + **TypeScript/React frontend** (`frontend/`). Each has its own toolchain. Backend is Python 3.13, frontend is TypeScript 6 / React 19 / Vite 8.

---

## Python

### Naming

| Item | Convention | Example |
|---|---|---|
| Files / modules | `snake_case` | `routes.py`, `knowledge_base.py`, `cost_analyzer.py` |
| Classes | `PascalCase` | `ArchitectureAdvisor`, `ServiceCost`, `KnowledgeBaseService` |
| Public functions / methods | `snake_case` | `get_recommendation()`, `build_advisor_messages()` |
| Private helpers | `_snake_case` (leading underscore) | `_log_event()`, `_make_llm()`, `_get_retriever()` |
| Module-level private state | `_name` | `_embedder`, `_retriever`, `_terraform_cache` |
| Compiled regex patterns | `UPPER_SNAKE_RE` | `READY_SIGNAL_RE` |
| Prompt constants | `UPPER_SNAKE` | `GATHER_PROMPT`, `ADVISOR_PROMPT`, `COMPACT_PROMPT` |
| Pydantic request/response models | `PascalCase` with role suffix | `ChatRequest`, `ChatResponse`, `ApproveResponse`, `IaCSnippetResponse` |

### Imports

All imports go at the **top of the file** — no inline or deferred imports. All local imports use the full `src.` prefix:

```python
# backend/src/api/routes.py — correct import order
import uuid
import json
import os
import re
import logging
import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from src.core.extractor import RequirementExtractor
from src.core.advisor import ArchitectureAdvisor
from src.core.models import ArchitecturePlan, StructuredOutputError
```

Import aliases use `_` prefix to signal module-private re-export: `import re as _re`. **Do not replicate** the `import re as _re` that appears mid-file in `backend/src/core/advisor.py` — that is an acknowledged deviation.

### Async Patterns

- All FastAPI route handlers are `async def`.
- Sync blocking operations (SQLite DB calls, CPU-bound sentence-transformers inference) are wrapped with `asyncio.to_thread()` — **never** called directly from an async handler:

```python
# backend/src/api/routes.py
history = await asyncio.to_thread(db.get_history, conv_id)
await asyncio.to_thread(db.save_message, conv_id, "human", request.message)
```

- Subprocess execution uses `asyncio.create_subprocess_exec()` with `asyncio.wait_for()` for timeouts:

```python
init_proc = await asyncio.create_subprocess_exec(
    "terraform", "init", "-backend=false", "-input=false",
    cwd=tmpdir,
    stdout=asyncio.subprocess.DEVNULL,
    stderr=asyncio.subprocess.DEVNULL,
)
await asyncio.wait_for(init_proc.wait(), timeout=60.0)
```

- Module-level expensive singletons are lazy-initialized on first call:

```python
# backend/src/core/advisor.py
_embedder: SentenceTransformerEmbeddings | None = None
_retriever: VectorCypherRetriever | None = None

def _get_retriever() -> VectorCypherRetriever:
    global _embedder, _retriever
    if _retriever is None:
        _embedder = SentenceTransformerEmbeddings(model="all-MiniLM-L6-v2")
        ...
    return _retriever
```

- App lifespan uses `@asynccontextmanager` — startup before `yield`, cleanup after:

```python
# backend/src/main.py
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    kb_service = KnowledgeBaseService()
    try:
        kb_service.initialize_schema()
    except Exception as e:
        print(f"[Main] Error initializing KB schema: {e}")
    yield
    kb_service.close()
```

### Pydantic v2 Models

- All models inherit `BaseModel` with `Field(description=...)` on every field — required for `with_structured_output()` JSON schema generation.
- `@model_validator(mode="before")` + `@classmethod` for LLM output coercion. `mode="before"` handles raw dict normalization; always put both decorators in this order:

```python
# backend/src/core/models.py — canonical validator pattern
class ServiceCost(BaseModel):
    service: str = Field(description="AWS service name")
    cost: float = Field(description="Estimated monthly cost in USD")
    is_calculated: bool = Field(description="True if from AWS Pricing API, False if LLM estimate")

    @model_validator(mode="before")
    @classmethod
    def _coerce_cost(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        raw = data.get("cost")
        if isinstance(raw, str):
            numeric = _re.sub(r"[^\d.]", "", raw.split()[0] if raw.strip() else "0")
            try:
                data["cost"] = float(numeric) if numeric else 0.0
            except ValueError:
                data["cost"] = 0.0
        return data
```

- `CostEstimate` also normalizes alternative key names the LLM returns (`estimated_monthly_cost`, `monthly_cost`, `cost` → `total`) and handles `breakdown` as a plain dict.
- **Never** split LLM output strings to extract structured data. Always use:
  - `llm.with_structured_output(Model, method="json_mode", include_raw=True)` for non-streaming
  - `Model.model_validate_json(accumulated_text)` for post-stream parse (`/generate/*` endpoints)
- Use `model_dump_json()` for persistence to SQLite; `model_validate_json()` for deserialization. Do not use `json.dumps(model.dict())`.

### Structured LLM Output — Retry Pattern

```python
# backend/src/core/advisor.py
structured_llm = self.llm.with_structured_output(
    ArchitecturePlan, method="json_mode", include_raw=True
)
result = await structured_llm.ainvoke(messages)
# result = {"raw": AIMessage, "parsed": ArchitecturePlan | None, "parsing_error": str | None}

if result["parsing_error"] is not None:
    retry_messages = list(messages)
    retry_messages.append(AIMessage(content=result["raw"].content or ""))
    retry_messages.append(HumanMessage(
        content="Your previous response was not valid JSON. Schema:\n"
                + json.dumps(ArchitecturePlan.model_json_schema(), indent=2)
    ))
    result = await structured_llm.ainvoke(retry_messages)
    if result["parsing_error"] is not None:
        raise StructuredOutputError(f"Parse failed after retry: {result['parsing_error']}")

return result["parsed"]
```

### SSE Event Emission

All SSE events go through `_log_event()` in `backend/src/api/routes.py`. **Never** `yield` raw JSON strings directly:

```python
def _log_event(payload: dict) -> str:
    """Serialize payload to SSE data string and log it as a JSON line."""
    payload["_ts"] = datetime.now(timezone.utc).isoformat()
    line = json.dumps(payload)
    _debug_log.debug(line)   # writes to /logs/debug.jsonl
    payload.pop("_ts")       # strip before wire
    return f"data: {json.dumps(payload)}\n\n"

# Usage in a generator:
yield _log_event({'type': 'token', 'content': token})
yield _log_event({'type': 'done', 'payload': payload, 'ready_for': ['costs']})
```

SSE event `type` values:

| `type` | Meaning |
|--------|---------|
| `token` | LLM streaming token — `{"type":"token","content":"…"}` |
| `status` | Human-readable progress update |
| `debug` | Internal pipeline event (`event` sub-key) |
| `rag` | RAG retrieval result (`hits`, `query`, `sources`) |
| `done` | Final payload — `{"type":"done","payload":{…},"ready_for":[…]}` |
| `error` | Fatal error — `{"type":"error","message":"…"}` |

SSE endpoints return `StreamingResponse` with these headers:

```python
return StreamingResponse(
    stream(),
    media_type="text/event-stream",
    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
)
```

### Error Handling

- Generators wrap their entire body in `try/except Exception` — log with `print(f"[Component] ...")` and emit an `error` SSE event. Never let a generator raise uncaught.
- REST endpoints use `raise HTTPException(status_code=..., detail=...)`.
- `StructuredOutputError` (defined in `backend/src/core/models.py`) is the domain exception for LLM parse failure — raised in `advisor.py`, caught in route handlers.
- Graceful fallbacks use `None`-typed fields (e.g., `valid: bool | None` on `ApproveResponse`) when optional infrastructure (Terraform CLI) is absent.

### Formatting / Linting (Backend)

Config: `backend/pyproject.toml`

- **Formatter:** `black`, line-length 88, target Python 3.13
- **Linter:** `ruff` with rules `E, F, I, N, W, C90, B`
- Run: `black backend/src && ruff check backend/src`

### Comments

- Numbered inline comments for sequential steps:
  ```python
  # 1. Graph context
  # 2. Vector context
  # 3. Build message list
  ```
- Log prefix with component name: `print(f"[Advisor] Vector retrieval failed: {e}")`
- Docstrings on all public methods of service classes. Route handler docstrings describe SSE contract.

---

## TypeScript / React

### Naming

| Item | Convention | Example |
|---|---|---|
| Component files | `PascalCase.tsx` | `ChatBox.tsx`, `DebugTab.tsx`, `MermaidViewer.tsx` |
| Page files | `PascalCase.tsx` | `KnowledgeBase.tsx` |
| Style files | `lowercase.css` | `mermaid.css`, `index.css` |
| Interfaces / Types | `PascalCase` | `DebugEvent`, `DebugInfo`, `ChatBoxHandle`, `Session` |
| Components | `export const Name: React.FC<Props>` | `export const DebugTab: React.FC<DebugTabProps>` |
| Handlers / helpers | `camelCase` | `handleSend`, `handleUnlock`, `streamGenerateSSE` |
| Page union types | string literal union | `type Page = 'chat' \| 'knowledge'` |
| Boolean state / props | `boolean` (never `bool`) | `drawerOpen: boolean`, `is_calculated: boolean` |

### Component Patterns

- All components are function components with explicit `React.FC<Props>` typing.
- Only `App` (entry point) uses `export default`. All other components use named exports.
- Components that expose imperative methods use `forwardRef` + `useImperativeHandle`:

```tsx
// frontend/src/components/Chat/ChatBox.tsx
export interface ChatBoxHandle {
  compact: () => Promise<void>
  clear: () => Promise<void>
  hasMessages: () => boolean
}

export const ChatBox = forwardRef<ChatBoxHandle, ChatBoxProps>(
  ({ conversationId, onSessionUpdate, onUnlock, onStale, onDebugEvent }, ref) => {
    useImperativeHandle(ref, () => ({ compact, clear, hasMessages }))
    // ...
  }
)
```

- `useCallback` wraps all handlers passed as props or stored in refs.
- State initialized from `localStorage` uses a lazy initializer: `useState(() => localStorage.getItem('key') ?? default)`.
- Prop callbacks use optional chaining: `onDebugEvent?.({...})` — never assume all callbacks are provided.

### SSE Handling

**Always use `fetch` + `ReadableStream`. Never use `EventSource`** — `EventSource` cannot POST or send custom headers.

Canonical pattern (from `frontend/src/App.tsx`):

```typescript
const response = await fetch(`/api/v1/generate/${type}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ conversation_id: convId }),
})
if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)

const reader = response.body.getReader()
const decoder = new TextDecoder()
let buffer = ''

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  buffer += decoder.decode(value, { stream: true })

  const parts = buffer.split('\n\n')
  buffer = parts.pop() ?? ''   // retain incomplete trailing chunk

  for (const part of parts) {
    const line = part.trim()
    if (!line.startsWith('data: ')) continue
    const jsonStr = line.slice(6)
    let event: Record<string, unknown>
    try { event = JSON.parse(jsonStr) } catch { continue }

    if (event.type === 'token') { /* accumulate */ }
    else if (event.type === 'done') { /* final payload */ }
    else if (event.type === 'error') { /* show error */ }
  }
}
```

Key rules:
- Keep `buffer` between read iterations — partial SSE lines arrive split across TCP chunks.
- Guard `!response.body` before calling `.getReader()`.
- Catch per-event JSON parse errors with `continue` — one malformed event must not break the stream.

### Mermaid

Use `mermaid.render(id, definition)` — **not** `mermaid.run()`, `mermaid.contentLoaded()`, or `mermaid.init()`. `render()` returns a Promise and rejects on parse errors, enabling graceful fallback:

```tsx
// frontend/src/components/Diagram/MermaidViewer.tsx
mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' })

mermaid.render(`mermaid-diagram-${Date.now()}`, sanitized)
  .then(({ svg }) => { el.innerHTML = svg })
  .catch((err: unknown) => {
    console.error('[MermaidViewer] render failed:', err)
    el.textContent = '⚠ Could not render diagram — invalid Mermaid syntax'
  })
```

Always run `sanitizeMermaid()` on LLM output before rendering — LLMs emit `[ECS Fargate (Containers)]` which breaks the parser because `(` starts a shape definition in Mermaid syntax.

### State Management

- No external state library. State is co-located in the owning component; lifted to `App.tsx` for cross-component sharing.
- `ChatBox` owns: `messages`, `conversationId`, `loading`, `fillPercent`.
- `App.tsx` owns: `sessions`, `activeConvId`, `unlockedButtons`, `staleButtons`, `artifacts`, `debugEvents`, `debugInfo`.
- `localStorage` is the persistence cache (keyed `aws_advisor_*`); the backend SQLite DB is authoritative. On mount, try `localStorage` first and fall back to a backend fetch.

### Import Organization

```tsx
// 1. React core
import React, { useEffect, useRef, useState } from 'react'

// 2. Third-party libraries
import { Box, VStack, Text, Badge } from '@chakra-ui/react'
import { MdSend } from 'react-icons/md'

// 3. Internal components / pages
import { ChatBox } from './components/Chat/ChatBox'

// 4. Type-only imports (use `import type`)
import type { ChatBoxHandle } from './components/Chat/ChatBox'
import type { DebugEvent, DebugInfo } from './components/Drawer/DebugTab'
```

No path aliases — all local imports use relative paths.

### Linting (Frontend)

Config: `frontend/eslint.config.js` (flat config)

- `typescript-eslint` recommended + `react-hooks` + `react-refresh`
- `@typescript-eslint/no-explicit-any` active — use specific types or `unknown`; `as any` is a known gap to eliminate
- Run: `npm run lint` from `frontend/`

---

## API Design

### URL Structure

```
/api/v1/
  health                              GET  — liveness probe
  conversations                       GET  — list all conversations
  conversations/{conv_id}             DELETE
  conversations/{conv_id}/messages    GET
  conversations/{conv_id}/context     GET  — state + all artifacts
  chat                                POST — non-streaming (legacy)
  chat/stream                         POST — SSE streaming (gather / follow-up)
  chat/{conv_id}/compact              POST
  chat/{conv_id}/clear                POST
  chat/{conv_id}/approve              POST
  generate/architecture               POST — SSE streaming
  generate/costs                      POST — SSE streaming
  generate/terraform                  POST — SSE streaming
  knowledge/*                         knowledge base routes
  debug/info                          GET
```

### Response Shape

- REST endpoints return typed Pydantic response models (`response_model=ChatResponse`).
- SSE endpoints return `StreamingResponse(media_type="text/event-stream")`.
- All SSE `done` events carry a `payload` key with the structured result.
- SSE `done` events may also carry `ready_for: string[]` to signal frontend button unlocks.
- Errors inside SSE generators emit `{"type":"error","message":"..."}` — never raise HTTP exceptions from inside a streaming generator.

### Conversation State Machine

States stored in SQLite per conversation, controlled by `backend/src/db/database.py`:

```
gathering → architecture_ready → presenting → costs_ready → terraform_ready → complete
```

The `READY_SIGNAL_RE` regex in `backend/src/api/routes.py` detects `{"ready_for":["architecture"]}` embedded in LLM gather responses and triggers transition. The signal is stripped before storing the AI message.

---

## Critical Rules

These **must** be followed to avoid breakage:

1. **No string-splitting of LLM output for structured data.** Use `llm.with_structured_output(Model, method="json_mode", include_raw=True)` for non-streaming or `Model.model_validate_json(text)` after accumulating SSE tokens. String splitting breaks when LLM format drifts.

2. **All Python imports at the top of the file.** No inline imports. The mid-file `import re as _re` in `backend/src/core/advisor.py` is a known exception — do not replicate.

3. **`@model_validator(mode="before")` for LLM output coercion.** LLMs return `"$150/month"` for cost fields and non-standard key names. The validators in `ServiceCost` and `CostEstimate` normalize these. New structured output models need the same defensive validators.

4. **SSE via `fetch` + `ReadableStream`, never `EventSource`.** `EventSource` cannot POST or set `Content-Type` headers.

5. **`mermaid.render()` not `mermaid.run()` / `mermaid.contentLoaded()`.** Only `render()` provides a rejectable Promise for graceful error display.

6. **All SSE events through `_log_event()`.** Never `yield f"data: {json.dumps(...)}\n\n"` directly — the helper handles timestamps and file logging.

7. **Sync DB/CPU calls wrapped in `asyncio.to_thread()`.** Never call `db.*` functions or CPU-bound operations directly from an async handler.

8. **`boolean` not `bool` in TypeScript.** `bool` is not a TypeScript type.

9. **Always `sanitizeMermaid()` before `mermaid.render()`.** LLM-generated Mermaid with `(` inside `[...]` labels will throw a parse error.

10. **`model_dump_json()` / `model_validate_json()` for Pydantic persistence.** Do not use `json.dumps(model.dict())` or `json.loads` + dict unpacking — these bypass v2 validators.

---

*Convention analysis: 2025-07-17*

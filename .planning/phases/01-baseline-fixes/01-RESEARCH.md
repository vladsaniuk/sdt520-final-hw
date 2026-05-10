# Phase 1: Baseline Fixes — Research

**Researched:** 2025-07-11
**Domain:** FastAPI startup, Docker Compose healthchecks, TypeScript types, Mermaid v10+, LangChain Neo4j migration, dead code removal
**Confidence:** HIGH — every finding is grounded in direct source-file inspection at exact line numbers

---

## Summary

Phase 1 fixes seven concrete, already-identified bugs in the brownfield scaffold. The codebase compiles and starts (mostly), but has multiple issues preventing a clean startup and a real LLM call from working end-to-end. Four bugs are single-line text substitutions (BUG-03, BUG-04, BUG-05, BUG-06). Two require minor structural changes (BUG-01 adds a `healthcheck` block; BUG-02 replaces deprecated `@app.on_event` with `lifespan`). One is a removal sweep (BUG-07 strips dead PostgreSQL code and migrates one import). There is also one **implicit fix** required by success criterion #3 (mock-uuid → real UUID in `routes.py`) that is not named in BUG-01–07 but is unambiguously mandated by the phase gate.

No new libraries need to be introduced beyond `langchain-neo4j` (which replaces `langchain-community` for the Neo4j graph integration). Fix order matters for exactly two pairs: BUG-03 and BUG-07 must complete before the advisor can successfully make any LLM call; BUG-01 (healthcheck) and BUG-02 (lifespan) are independent of each other but both must land before `docker compose up` is clean.

**Primary recommendation:** Fix in this order: BUG-03 → BUG-07 → BUG-02 → BUG-01 → BUG-04 → BUG-05 → BUG-06 → mock-uuid implicit fix. Each step is independently testable.

---

## Project Constraints (from copilot-instructions.md)

- All FastAPI endpoint handlers MUST be `async` — use `await llm.ainvoke()`, never `.invoke()`
- Use `lifespan` context manager (NOT deprecated `@app.on_event("startup")`)
- Use `langchain-neo4j` (NOT `langchain-community` Neo4j imports)
- Parse LLM output with `with_structured_output()` + Pydantic — no string splitting or regex (Phase 1 scope: fix the `import json` placement; the parsing strategy migration is Phase 3)
- `import` statements belong at the **top** of every file — never mid-file
- No SQLAlchemy, psycopg2-binary, or PostgreSQL — Neo4j is the sole store
- TypeScript: use `boolean`, never `bool`
- Mermaid: use `mermaid.run()` — `mermaid.contentLoaded()` removed in v10+
- Backend MUST declare `depends_on: neo4j: condition: service_healthy`
- **No APOC/GDS plugins** in the Neo4j service — they're unused and slow cold starts
- Neo4j driver pinned to 5.x — do NOT upgrade to 6.x
- `initialize_schema()` MUST be called on startup (vector index + constraints)
- All secrets via `.env` file — never hardcoded

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BUG-01 | Backend starts before Neo4j is ready — Docker Compose `depends_on` must use healthcheck | Neo4j 5.x HTTP probe + `service_healthy` condition pattern documented below |
| BUG-02 | `initialize_schema()` never called on startup (deprecated `@app.on_event`) | `lifespan` async generator pattern documented below; `initialize_schema()` IS wired but must survive module-level instantiation race |
| BUG-03 | `import json` placed at bottom of `advisor.py` and `cost_analyzer.py` — causes runtime crash | Exact lines confirmed: advisor.py:52, cost_analyzer.py:68 |
| BUG-04 | TypeScript `is_calculated: bool` must be `boolean` in `CostTable.tsx` | Exact line confirmed: CostTable.tsx:6 |
| BUG-05 | `mermaid.contentLoaded()` removed in v10+ — replace with `mermaid.run()` | Exact pattern + `innerHTML` pre-set documented; Mermaid 11.14.0 confirmed in package.json |
| BUG-06 | CORS wildcard `allow_origins=["*"]` must be configurable via env var | FastAPI CORSMiddleware env-var pattern documented |
| BUG-07 | Dead code removed — SQLAlchemy models, psycopg2-binary, unused langchain-community Neo4j imports | Complete file/line inventory below |
</phase_requirements>

---

## BUG-01: Docker Compose depends_on healthcheck

### Current State (docker-compose.yml)

```yaml
services:
  neo4j:
    image: neo4j:5.26.0
    environment:
      - NEO4J_AUTH=neo4j/${NEO4J_PASSWORD:-password}
      - NEO4J_PLUGINS=["apoc", "gds"]    # ← ALSO MUST BE REMOVED (copilot-instructions)
    # NO healthcheck block

  backend:
    depends_on:
      - neo4j    # ← bare depends_on, no condition
```

### Exact Fix

**Neo4j service** — add `healthcheck` block and remove `NEO4J_PLUGINS`:

```yaml
neo4j:
  image: neo4j:5.26.0
  container_name: neo4j
  ports:
    - "7474:7474"
    - "7687:7687"
  environment:
    - NEO4J_AUTH=neo4j/${NEO4J_PASSWORD:-password}
    # NEO4J_PLUGINS removed — unused, slow cold starts (copilot-instructions)
  healthcheck:
    test: ["CMD-SHELL", "wget -q --spider http://localhost:7474 || exit 1"]
    interval: 10s
    timeout: 5s
    retries: 10
    start_period: 30s
  volumes:
    - ./data/neo4j:/data
    - ./data/neo4j/logs:/logs
    - ./data/neo4j/import:/var/lib/neo4j/import
    - ./data/neo4j/plugins:/plugins
```

**Backend service** — change `depends_on`:

```yaml
backend:
  depends_on:
    neo4j:
      condition: service_healthy
```

### Why `wget` not `cypher-shell`?

- `wget` probing `http://localhost:7474` is reliable for Neo4j 5.x — port 7474 is the HTTP/browser interface that becomes available once Neo4j is ready to accept connections
- `cypher-shell` is not available in the `neo4j:5.26.0` image without extra installation
- `curl` is also not in the slim Neo4j image by default; `wget` is
- `start_period: 30s` + `retries: 10` × `interval: 10s` = up to 130s total wait — sufficient for APOC/GDS free cold start; even faster now that APOC/GDS is removed

### APOC/GDS Plugin Removal Impact

Removing `NEO4J_PLUGINS=["apoc", "gds"]` eliminates the plugin download on cold start (requires outbound internet) and significantly speeds up Neo4j initialization. No code in `backend/src/` uses any APOC/GDS procedures — confirmed by grep.

### Risk

- LOW: Adding healthcheck is additive; removing APOC/GDS has no code-side effect since nothing uses those procedures

---

## BUG-02: initialize_schema() startup wiring

### Current State (backend/src/main.py)

```python
# Module-level instantiation — runs at IMPORT TIME before Neo4j is ready
kb_service = KnowledgeBaseService()    # line 20 — connects to Neo4j at __init__

@app.on_event("startup")              # line 22 — DEPRECATED in FastAPI
async def startup_event():
    try:
        kb_service.initialize_schema()
    except Exception as e:
        print(f"[Main] Error initializing KB schema: {e}")
```

**Two problems:**
1. `KnowledgeBaseService()` is instantiated at module level (line 20). Its `__init__` calls `GraphDatabase.driver(uri, auth=...)`, which tries to establish the Bolt connection at import time — before Docker's healthcheck has confirmed Neo4j is ready. This can succeed (drivers are lazy) but `initialize_schema()` will fail if Neo4j isn't accepting queries yet.
2. `@app.on_event("startup")` is deprecated in FastAPI — copilot-instructions mandate `lifespan`.

### Exact Fix — lifespan Context Manager

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.api.routes import router as chat_router
from src.api.knowledge import router as knowledge_router
from src.services.knowledge_base import KnowledgeBaseService
import os

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: initialize Neo4j schema. Shutdown: close driver."""
    kb_service = KnowledgeBaseService()
    try:
        kb_service.initialize_schema()
    except Exception as e:
        print(f"[Main] Error initializing KB schema: {e}")
    yield
    kb_service.close()

app = FastAPI(title="AWS Architecture Advisor API", lifespan=lifespan)
```

Key changes:
- `KnowledgeBaseService()` instantiated **inside** `lifespan`, not at module level — guarantees connection attempt happens only after Docker's healthcheck passes
- `lifespan` yields control to the application after startup; cleanup (driver close) runs after yield
- `kb_service.close()` is already implemented in `KnowledgeBaseService` (line 12–13 of knowledge_base.py) — just needs to be called

### Risk

- LOW: Pure refactor — same `initialize_schema()` call, same error handling. Only structural change is removal of module-level instantiation and migration from deprecated decorator.

---

## BUG-03: Misplaced `import json`

### Confirmed Files and Lines

| File | Line | Current | Issue |
|------|------|---------|-------|
| `backend/src/core/advisor.py` | 52 (last line) | `import json # Ensure json is available` | Import placed AFTER class definition — used at line 39 (`json.dumps(requirements)`) |
| `backend/src/core/cost_analyzer.py` | 68 (last line) | `import json` | Import placed AFTER class definition — used at line 33 (`json.loads(content.strip())`) |

**Runtime crash risk:** In Python, placing `import json` at the bottom of a module is NOT a `SyntaxError` — the module loads fine. BUT if the class method is called before the interpreter reaches line 52/68 at first import, it will raise `NameError: name 'json' is not defined`. In practice Python executes the whole module top-to-bottom at import time, so the `import json` at the bottom DOES execute before any method call. **However:** this is still broken if the `import json` line is never reached due to an earlier exception, and it causes linter failures and violates the copilot-instructions rule "import statements belong at the top."

### Confirmed No Other Misplaced Imports

Checked all backend Python files — `extractor.py` has `import json` at line 1 (correct). No other files have end-of-file imports.

### Exact Fix — advisor.py

Remove line 52 (`import json # Ensure json is available`) and add `import json` to the top-of-file import block:

```python
import os
import json                                    # ← move here
from langchain_openai import ChatOpenAI
from langchain_neo4j import Neo4jGraph         # ← also updated per BUG-07
from src.core.prompts import ADVISOR_PROMPT
from src.services.knowledge_base import KnowledgeBaseService
from typing import Dict, Any
```

### Exact Fix — cost_analyzer.py

Remove line 68 (`import json`) and add to top-of-file:

```python
import os
import json                                    # ← move here
from langchain_openai import ChatOpenAI
from src.services.pricing import PricingService
from typing import Dict, Any, List
```

### Risk

- NONE: Pure import relocation. No logic changes.

---

## BUG-04: TypeScript `bool` → `boolean`

### Confirmed File and Line

**File:** `frontend/src/components/Cost/CostTable.tsx`
**Line 6:** `is_calculated: bool`

```typescript
// CURRENT (line 3–7):
interface BreakdownItem {
  service: string
  cost: number
  is_calculated: bool    // ← Python syntax, TypeScript compile error
}
```

### Exact Fix

```typescript
interface BreakdownItem {
  service: string
  cost: number
  is_calculated: boolean    // ← correct TypeScript type
}
```

### Scan for Other TypeScript Errors

Ran grep across frontend — `bool` keyword appears **only** in `CostTable.tsx:6`. No other Python-style types found. The rest of the frontend TypeScript is well-typed.

### Risk

- NONE: Type-only change, no runtime logic.

---

## BUG-05: `mermaid.contentLoaded()` → `mermaid.run()`

### Confirmed File and Current State

**File:** `frontend/src/components/Diagram/MermaidViewer.tsx`

```typescript
// CURRENT — BROKEN (two separate bugs):
export const MermaidViewer: React.FC<MermaidViewerProps> = ({ definition }) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current && definition) {
      containerRef.current.removeAttribute('data-processed')
      mermaid.contentLoaded()                          // BUG A: removed in v10+
    }
  }, [definition])

  return (
    <div className="mermaid bg-white p-4 rounded border shadow-inner" ref={containerRef}>
      {definition}                                     // BUG B: JSX children ≠ innerHTML
    </div>
  )
}
```

**Installed version:** `mermaid: ^11.14.0` (from `package.json`) — confirmed v10+ where `contentLoaded()` is gone.

**Two bugs in this component:**
1. `mermaid.contentLoaded()` — removed in Mermaid v10+; throws `TypeError: mermaid.contentLoaded is not a function`
2. `{definition}` as JSX children — React renders this as a text node, but before `mermaid.run()` scans the element, `innerHTML` must contain the raw Mermaid syntax. React's virtual DOM may not have committed the `textContent` to the real DOM by the time the effect fires. The safe pattern is to explicitly set `innerHTML`.

### Exact Fix

```typescript
import React, { useEffect, useRef } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,    // ← change to false; we control rendering manually
  theme: 'default',
  securityLevel: 'loose',
})

interface MermaidViewerProps {
  definition: string
}

export const MermaidViewer: React.FC<MermaidViewerProps> = ({ definition }) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current && definition) {
      containerRef.current.removeAttribute('data-processed')
      containerRef.current.innerHTML = definition      // ← set raw Mermaid syntax in DOM
      mermaid.run({ nodes: [containerRef.current] })   // ← Mermaid v10+ API
    }
  }, [definition])

  return (
    <div
      className="mermaid bg-white p-4 rounded border shadow-inner"
      ref={containerRef}
    />                                                 // ← self-closing; innerHTML set in effect
  )
}
```

Key changes:
- `startOnLoad: false` — prevents Mermaid from trying to auto-process on initial page load (we control it via `mermaid.run()`)
- `containerRef.current.innerHTML = definition` — sets raw Mermaid syntax before calling `run()`
- `mermaid.run({ nodes: [containerRef.current] })` — Mermaid 10+ API; processes specific DOM nodes
- Self-closing `<div />` — content is controlled via `innerHTML` in the effect, not JSX

### Risk

- LOW: Isolated component change. `mermaid.run()` with `{ nodes: [] }` is the documented Mermaid v10+ pattern.

---

## BUG-06: CORS Wildcard

### Confirmed File and Line

**File:** `backend/src/main.py`
**Line 13:** `allow_origins=["*"]`

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For demo, restrict in prod
    ...
)
```

### Exact Fix

```python
import os

# At top of file or inside the app setup block:
_raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
allowed_origins = [o.strip() for o in _raw_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**`.env.example` addition:**

```bash
# CORS — comma-separated origins, or * for all (demo only)
ALLOWED_ORIGINS=*
```

**For development/demo:** `ALLOWED_ORIGINS=*` is fine (default fallback if not set). **For production:** set to `ALLOWED_ORIGINS=https://your-frontend.example.com`.

### Risk

- NONE: Behavior is identical to current when `ALLOWED_ORIGINS` is not set (defaults to `"*"`). Only change is configurability.

---

## BUG-07: Dead Code Removal

### Complete Inventory of Files/Imports to Remove

#### 1. Delete file: `backend/src/models/workload.py`

The entire file is dead code — SQLAlchemy ORM models (`Workload`, `Recommendation`, `IaCSnippet`, `CostProfile`) with no database engine, no session, no PostgreSQL service. Zero references to this file anywhere in `backend/src/api/` or `backend/src/core/`.

**Confirmed by grep:** No file in `backend/src/` imports from `src.models.workload`.

#### 2. Edit: `backend/requirements.txt`

Remove these lines:
```
sqlalchemy
psycopg2-binary
langchain-community
```

Add this line:
```
langchain-neo4j
```

Full updated requirements.txt:
```
fastapi
uvicorn
langchain
langchain-openai
langchain-neo4j          # ← replaces langchain-community
neo4j
neo4j-graphrag
boto3
pydantic
pydantic-settings
python-multipart
python-dotenv
deepeval
pytest
ruff
black
```

#### 3. Edit: `backend/src/core/advisor.py` — change import

```python
# REMOVE:
from langchain_community.graphs import Neo4jGraph

# ADD:
from langchain_neo4j import Neo4jGraph
```

**API surface unchanged:** `langchain-neo4j 0.9.0` exposes `Neo4jGraph` with the same `.query()` interface. The constructor signature (`url`, `username`, `password`) is identical. No other code changes needed in `advisor.py` for this migration.

#### 4. Edit: `backend/Dockerfile` — remove `libpq-dev`

`libpq-dev` is only needed to compile `psycopg2`. Once `psycopg2-binary` is removed from requirements, this build dependency is dead:

```dockerfile
# REMOVE this line from the apt-get install block:
    libpq-dev \
```

Updated RUN block:
```dockerfile
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*
```

### Implicit Fix Required by Phase 1 Success Criterion #3

**Not in BUG-01–07 by name, but mandated by phase gate:**

> "A chat message reaches the LLM and returns a real architecture response — `recommendation_id` is a UUID, not `"mock-uuid"`"

**File:** `backend/src/api/routes.py`
**Line 54:** `"recommendation_id": "mock-uuid",`

**Fix:**
```python
import uuid                           # add to top-of-file imports

# In the chat() handler, replace:
"recommendation_id": "mock-uuid",

# With:
"recommendation_id": str(uuid.uuid4()),
```

### Risk Summary for BUG-07

- **File deletion** — no cascade effects (confirmed: no imports of workload.py)
- **requirements.txt** — `langchain-neo4j` is a drop-in replacement for `langchain-community` Neo4j integration; same API
- **Import swap** — `from langchain_neo4j import Neo4jGraph` is identical in API surface to `from langchain_community.graphs import Neo4jGraph`
- **Dockerfile** — removing unused build dep, no functional change
- **MEDIUM risk on requirements rebuild:** Docker image rebuild required; first startup after this change will reinstall all dependencies. This is expected and intentional.

---

## Fix Order

Dependencies between fixes:

```
BUG-03 (import json) ──────────────────► must fix before any LLM test
BUG-07 (remove dead code + swap import) ► must fix before BUG-02 lifespan test
BUG-02 (lifespan) ─────────────────────► must fix before docker compose up test
BUG-01 (docker healthcheck) ───────────► must fix before docker compose up test

BUG-04 (TypeScript bool) ──────────────► independent, fix anytime
BUG-05 (mermaid.run) ──────────────────► independent, fix anytime
BUG-06 (CORS) ─────────────────────────► independent, fix anytime
mock-uuid (implicit) ──────────────────► independent, fix anytime
```

**Recommended execution order (one pass, no backtracking):**

1. **BUG-03** — Move `import json` to top in advisor.py + cost_analyzer.py (2 edits, 30 seconds)
2. **BUG-07** — Delete workload.py, update requirements.txt, swap langchain_community import, remove libpq-dev from Dockerfile (4 edits)
3. **BUG-02** — Replace `@app.on_event("startup")` with `lifespan` in main.py (1 edit)
4. **BUG-01** — Add `healthcheck` to neo4j service, change `depends_on` syntax, remove APOC/GDS plugin env var in docker-compose.yml (1 edit)
5. **BUG-04** — `bool` → `boolean` in CostTable.tsx (1 edit)
6. **BUG-05** — Rewrite MermaidViewer.tsx useEffect (1 edit)
7. **BUG-06** — Env-var CORS in main.py + .env.example (2 edits)
8. **mock-uuid** — Add `import uuid`, replace `"mock-uuid"` in routes.py (1 edit)

All 8 fixes are in **different files** — no edit conflicts, can be applied atomically.

---

## Validation Architecture

> `nyquist_validation` is set to `false` — formal test section omitted. Manual validation steps below.

### How to Verify All 7 Bugs Are Fixed

#### BUG-01: Docker healthcheck

```bash
# Verify healthcheck is present and neo4j starts healthy
docker compose up neo4j -d
docker inspect neo4j --format='{{.State.Health.Status}}'
# Must return: healthy (after ~40s)

# Verify backend respects healthcheck
docker compose up -d
docker compose ps
# backend Status must show "Up" not "Restarting"

# Verify APOC/GDS removed
grep -n "NEO4J_PLUGINS" docker-compose.yml
# Must return no output
```

#### BUG-02: lifespan / initialize_schema

```bash
# Check startup logs for schema initialization
docker compose logs backend | grep "\[KnowledgeBase\]"
# Must contain: [KnowledgeBase] Schema and Vector Index initialized.

# Verify no @app.on_event
grep -n "on_event" backend/src/main.py
# Must return no output

# Verify lifespan present
grep -n "lifespan" backend/src/main.py
# Must show asynccontextmanager usage
```

#### BUG-03: Misplaced imports

```bash
grep -n "^import json" backend/src/core/advisor.py
# Must return: 2:import json  (or similar small line number at top)

grep -n "^import json" backend/src/core/cost_analyzer.py
# Must return: 2:import json  (or similar small line number at top)

# Confirm no end-of-file imports
tail -3 backend/src/core/advisor.py
tail -3 backend/src/core/cost_analyzer.py
# Must NOT contain "import json"
```

#### BUG-04: TypeScript bool → boolean

```bash
grep -n "bool" frontend/src/components/Cost/CostTable.tsx
# Must return no output (or only "boolean" matches)

# Full TypeScript compilation check
cd frontend && npx tsc --noEmit
# Must exit 0 with no errors
```

#### BUG-05: Mermaid API

```bash
grep -n "contentLoaded" frontend/src/components/Diagram/MermaidViewer.tsx
# Must return no output

grep -n "mermaid.run" frontend/src/components/Diagram/MermaidViewer.tsx
# Must return a match

grep -n "innerHTML" frontend/src/components/Diagram/MermaidViewer.tsx
# Must return a match (innerHTML = definition before run())
```

#### BUG-06: CORS

```bash
grep -n 'allow_origins=\["\*"\]' backend/src/main.py
# Must return no output

grep -n "ALLOWED_ORIGINS" backend/src/main.py
# Must return a match

grep -n "ALLOWED_ORIGINS" .env.example
# Must return a match
```

#### BUG-07: Dead code removal

```bash
# File deleted
ls backend/src/models/workload.py 2>/dev/null && echo "STILL EXISTS" || echo "OK - deleted"

# Dependencies removed
grep -E "sqlalchemy|psycopg2|langchain-community" backend/requirements.txt
# Must return no output

# langchain-neo4j present
grep "langchain-neo4j" backend/requirements.txt
# Must return a match

# Import migrated
grep -n "langchain_community" backend/src/core/advisor.py
# Must return no output

grep -n "langchain_neo4j" backend/src/core/advisor.py
# Must return a match

# Dockerfile cleaned
grep "libpq-dev" backend/Dockerfile
# Must return no output
```

#### Implicit: recommendation_id

```bash
grep -n "mock-uuid" backend/src/api/routes.py
# Must return no output

grep -n "uuid.uuid4" backend/src/api/routes.py
# Must return a match
```

#### Full Phase 1 Gate: End-to-End

```bash
# 1. Start stack
docker compose up --build -d

# 2. Wait for healthy
sleep 60
docker compose ps
# All three services: neo4j, backend, frontend — Status: Up

# 3. Health check
curl -s http://localhost:8000/health
# Must return: {"status":"ok"}

# 4. Real LLM call
curl -s -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "I need a high-availability web app for 10000 users"}' \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print('UUID:', r['recommendation_id']); assert r['recommendation_id'] != 'mock-uuid'"
# Must print a real UUID (not "mock-uuid")

# 5. Frontend TypeScript compilation
docker compose logs frontend | grep -i "error"
# Must return no output (or only non-TypeScript errors)
```

---

## Sources

### Primary (HIGH confidence — direct source inspection)

- `backend/src/main.py` — startup hook, CORS middleware (lines 11–27)
- `backend/src/core/advisor.py` — misplaced import (line 52), langchain_community import (line 3)
- `backend/src/core/cost_analyzer.py` — misplaced import (line 68)
- `backend/src/api/routes.py` — mock-uuid (line 54)
- `backend/src/services/knowledge_base.py` — `initialize_schema()` implementation confirmed
- `backend/src/models/workload.py` — SQLAlchemy dead code confirmed (no references in codebase)
- `backend/requirements.txt` — dead deps confirmed: sqlalchemy, psycopg2-binary, langchain-community
- `backend/Dockerfile` — libpq-dev confirmed as psycopg2-only dep
- `docker-compose.yml` — bare `depends_on`, no healthcheck, APOC/GDS plugins present
- `frontend/src/components/Cost/CostTable.tsx` — `bool` type at line 6
- `frontend/src/components/Diagram/MermaidViewer.tsx` — `contentLoaded()` at line 20, JSX children bug
- `frontend/package.json` — Mermaid `^11.14.0` confirmed (v11 = v10+ era, `contentLoaded` removed)
- `.github/copilot-instructions.md` — mandatory patterns (lifespan, langchain-neo4j, no APOC/GDS)
- `.planning/codebase/CONCERNS.md` — confirmed all bugs with exact file/line references
- `.planning/research/SUMMARY.md` — prior research synthesis cross-referenced

### Secondary (MEDIUM confidence)

- Mermaid v10 changelog (from CONCERNS.md + SUMMARY.md): `contentLoaded()` removed, `run({ nodes })` is the replacement
- FastAPI lifespan docs: `@asynccontextmanager` + `yield` pattern; `@app.on_event` deprecated in 0.95+
- `langchain-neo4j` 0.9.0: `Neo4jGraph` is drop-in replacement for `langchain-community.graphs.Neo4jGraph`

---

## Metadata

**Confidence breakdown:**
- BUG identification: HIGH — every bug confirmed at exact file:line from source inspection
- Fix correctness: HIGH — all fixes are either deletions, type corrections, or well-documented API migrations
- Fix ordering: HIGH — dependency analysis is mechanical (import before use)
- Risk assessment: HIGH — no bug fix changes business logic; all are structural/import/type corrections

**Research date:** 2025-07-11
**Valid until:** 2025-08-11 (stable APIs, no fast-moving dependencies in scope)

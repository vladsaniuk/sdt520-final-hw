# Phase 5: Docker Polish — Research

**Researched:** 2025-07-11
**Domain:** Docker Compose, FastAPI startup, environment configuration
**Confidence:** HIGH — all findings based on direct source inspection

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOCKER-01 | `docker compose up` brings up a fully functional demo with no manual setup steps | Auto-seed gap identified — must call `seed_graph()` in lifespan; all other services start automatically |
| DOCKER-02 | All environment variables documented in `.env.example` with descriptions | 4 undocumented env vars found via grep; full inventory below |
| DOCKER-03 | Backend exposes a `/health` endpoint; Compose healthchecks use it | Endpoint at `/api/v1/health` exists, docker-compose healthcheck is wired correctly — already works |
</phase_requirements>

---

## Summary

Phase 5 is a polish/hardening phase. The Docker Compose setup is largely functional — healthchecks are wired, the service dependency chain is correct (neo4j → backend → frontend), and both health endpoints exist. There are three concrete gaps to close:

1. **Auto-seed is missing (DOCKER-01 blocker):** `seed_graph()` is an idempotent function that populates the Neo4j knowledge graph, but it is NOT called on startup. It exists only as a manual `POST /api/v1/seed` endpoint. A fresh `docker compose up` produces a working UI with an empty graph — the advisor will hallucinate without grounded AWS data. Calling `seed_graph()` in the FastAPI `lifespan()` function (alongside the existing `initialize_schema()`) fixes this with zero user interaction.

2. **`.env.example` is incomplete (DOCKER-02):** The file documents only `LLM_API_KEY` and `NEO4J_PASSWORD`. Four additional env vars are read by the backend — `ALLOWED_ORIGINS`, `LLM_MODEL`, `NEO4J_USER`, and `NEO4J_URI` — and are absent from `.env.example`. Most have safe defaults but should be documented with descriptions so evaluators know what they can configure.

3. **`data/` and `logs/` directories are gitignored:** On a fresh clone, these host-side directories don't exist. Docker will auto-create them on bind mount, but `data/neo4j/logs`, `data/neo4j/import`, and `data/neo4j/plugins` are separate mounts that also need to exist. Adding `.gitkeep` files under `data/neo4j/{logs,import,plugins}` and `logs/` ensures fresh clones work without a setup step.

**Primary recommendation:** Call `seed_graph()` inside the `lifespan()` context manager (it's already idempotent), update `.env.example` with all vars and descriptions, and add `.gitkeep` placeholders for gitignored directories.

---

## Current State Audit

### Health Endpoint (DOCKER-03) — ✅ ALREADY DONE

Two health endpoints exist:
- `GET /health` — defined in `backend/src/main.py` line 40, returns `{"status": "ok"}`
- `GET /api/v1/health` — defined in `backend/src/api/routes.py` line 48, returns `{"status": "ok"}`

`docker-compose.yml` healthcheck: `curl -sf http://localhost:8000/api/v1/health` — **correct and working**.
Frontend Dockerfile CMD polls the same URL — **correct**.

DOCKER-03 is already satisfied. No changes needed to the health endpoint.

### Service Dependency Chain — ✅ CORRECT

```
neo4j (healthcheck: wget http://localhost:7474, retries=10, start_period=30s)
  └─► backend (depends_on: neo4j: condition: service_healthy)
        └─► frontend (depends_on: backend: condition: service_healthy)
```

Chain is correctly configured. Backend waits for Neo4j bolt port via HTTP healthcheck before starting.

### Auto-Seed Gap (DOCKER-01 Blocker) — ❌ MISSING

**Current `lifespan()` in `backend/src/main.py`:**
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()                        # ✅ SQLite tables created
    kb_service = KnowledgeBaseService()
    try:
        kb_service.initialize_schema()  # ✅ Neo4j vector index + constraints
    except Exception as e:
        print(f"[Main] Error initializing KB schema: {e}")
    yield
    kb_service.close()
```

`seed_graph()` from `backend/src/services/seed.py` is **not called**. On first startup, the graph has 0 AWS nodes. The advisor produces hallucinated recommendations with no grounding.

**Fix:** Add `seed_graph()` call in the lifespan, after `initialize_schema()` (which must run first to create the constraints that MERGE uses).

```python
from src.services.seed import seed_graph

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    kb_service = KnowledgeBaseService()
    try:
        kb_service.initialize_schema()
        seed_graph()                     # ← ADD THIS (idempotent MERGE-based)
    except Exception as e:
        print(f"[Main] Error on startup: {e}")
    yield
    kb_service.close()
```

`seed_graph()` uses `MERGE` throughout — calling it on every startup is safe.

### Environment Variable Inventory (DOCKER-02)

All `os.getenv()` calls in the backend, found by grep:

| Env Var | Where Used | Default | In .env.example | In docker-compose.yml |
|---------|-----------|---------|----------------|----------------------|
| `LLM_API_KEY` | advisor, extractor, routes, iac | None (required!) | ✅ documented | ✅ `${LLM_API_KEY}` |
| `NEO4J_PASSWORD` | docker-compose auth | "password" | ✅ documented | ✅ `${NEO4J_PASSWORD:-password}` |
| `NEO4J_URI` | advisor, knowledge_base, routes | "bolt://localhost:7687" | ✅ documented (wrong value) | ✅ hardcoded bolt://neo4j:7687 |
| `ALLOWED_ORIGINS` | main.py CORS | "*" | ❌ missing | ✅ `${ALLOWED_ORIGINS:-*}` |
| `LLM_MODEL` | routes debug endpoint only | "openai/gpt-4o" | ❌ missing | ❌ not set |
| `NEO4J_USER` | advisor, knowledge_base | "neo4j" | ❌ missing | ❌ not set |

**Notes:**
- `NEO4J_URI` in `.env.example` shows `bolt://neo4j:7687` (Docker internal hostname). This is correct for Compose but wrong for local dev. Should note it's the Docker value.
- `NEO4J_USER` always defaults to "neo4j" — matches Neo4j container auth `neo4j/${NEO4J_PASSWORD}`. No bug, just undocumented.
- `LLM_MODEL` is only used in the debug info endpoint (not in actual LLM calls — those hardcode `"openai/gpt-4o"`). Low priority but should be documented.
- `ALLOWED_ORIGINS` matters for CORS — if the frontend is served from a non-localhost domain, the default `*` may need changing.

**Updated `.env.example` content:**
```bash
# ── LLM ──────────────────────────────────────────────────────────────────────
# Required. Get from https://openrouter.ai/keys
LLM_API_KEY=your_openrouter_api_key_here

# Optional. LLM model name via OpenRouter. Default: openai/gpt-4o
# LLM_MODEL=openai/gpt-4o

# ── Neo4j ────────────────────────────────────────────────────────────────────
# Password for the Neo4j container. Must match NEO4J_AUTH in docker-compose.yml
NEO4J_PASSWORD=password

# Internal Docker hostname — do not change unless running Neo4j outside Compose
NEO4J_URI=bolt://neo4j:7687

# Neo4j username. Default: neo4j (matches container default)
# NEO4J_USER=neo4j

# ── CORS ─────────────────────────────────────────────────────────────────────
# Allowed origins for the FastAPI CORS middleware. Default: * (allow all)
# Set to comma-separated list for production: http://localhost:3000,https://yourdomain.com
# ALLOWED_ORIGINS=*
```

### Directory Structure — ⚠️ FRESH CLONE ISSUE

`data/` and `logs/` are gitignored (line 45-46 in `.gitignore`). On a fresh clone these directories don't exist. Docker will auto-create bind mount targets as directories, but subdirectory mounts (`./data/neo4j/logs`, etc.) may fail silently or create root-owned dirs on Linux.

```yaml
# docker-compose.yml volumes for neo4j:
- ./data/neo4j:/data
- ./data/neo4j/logs:/logs
- ./data/neo4j/import:/var/lib/neo4j/import
- ./data/neo4j/plugins:/plugins
```

**Fix:** Add `.gitkeep` files so directories exist in the repo:
```
data/neo4j/logs/.gitkeep
data/neo4j/import/.gitkeep
data/neo4j/plugins/.gitkeep
logs/.gitkeep
```

This is a common Docker + gitignore pattern.

### Volume Mount: `./backend:/app` + `sqlite_data:/app/data`

The backend bind-mount covers `/app`, and the named volume `sqlite_data` is mounted at `/app/data`. Docker resolves overlapping mounts by specificity — the named volume at `/app/data` correctly takes precedence and holds the SQLite database. `database.py` calls `DB_PATH.parent.mkdir(parents=True, exist_ok=True)` which is safe. **No issue here.**

### Frontend Dockerfile — Minor Inefficiency (Non-blocking)

```dockerfile
CMD ["sh", "-c", "... npm install && npm run dev -- --host"]
```

`npm install` runs at build time (via `RUN npm install`) and again at runtime in the CMD. This doubles install time but does not cause failures. It does ensure fresh installs after image builds without node_modules volume mismatch. Low priority — leave as-is.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Waiting for Neo4j on startup | Custom polling loop in Python | Docker `depends_on: condition: service_healthy` | Already implemented — trust the healthcheck |
| Idempotent seeding | Custom "already seeded" flag | `MERGE` in `seed_graph()` | Already MERGE-based — just call it |
| Directory creation | Startup script | `.gitkeep` files | Simpler, git-native |

---

## Common Pitfalls

### Pitfall 1: Seed Not Idempotent (False Fear)
**What goes wrong:** Developer hesitates to call `seed_graph()` on every startup fearing duplicate data.
**Why it happens:** Assumes INSERT semantics.
**How to avoid:** The seed uses `MERGE` throughout — verified in `backend/src/services/seed.py`. Safe to call on every boot.

### Pitfall 2: `.env.example` with Docker-Internal Values
**What goes wrong:** `NEO4J_URI=bolt://neo4j:7687` in `.env.example` confuses local-dev users who try to run the backend outside Docker.
**How to avoid:** Add a comment: "This is the Docker Compose hostname — change to `bolt://localhost:7687` for local dev."

### Pitfall 3: gitignored Dirs Not Created on Fresh Clone
**What goes wrong:** `docker compose up` on a fresh Linux checkout creates `./data/neo4j` as a root-owned directory (Docker daemon runs as root on Linux). Neo4j fails to write its database.
**How to avoid:** Add `.gitkeep` files so directories are pre-created by git with correct ownership.

### Pitfall 4: Health endpoint path confusion
**What goes wrong:** Two health endpoints exist (`/health` in main.py, `/api/v1/health` in routes.py). A change to one might not apply to the other.
**Warning signs:** docker-compose healthcheck passes but API calls fail at the `/api/v1/` path.
**How to avoid:** Consolidate to one health endpoint and reference it consistently.

---

## Architecture Patterns

### Startup Sequence Pattern
```
lifespan() {
  1. init_db()           → SQLite tables created (fast, local)
  2. initialize_schema() → Neo4j vector index + constraints (requires Neo4j healthy)
  3. seed_graph()        → AWS knowledge graph MERGE (idempotent, safe)
  yield                  → app serves requests
  4. kb_service.close()  → Neo4j driver closed
}
```

### Healthcheck Chain
```
neo4j: wget http://localhost:7474     (HTTP API, not bolt)
  ↓ healthy
backend: curl http://localhost:8000/api/v1/health
  ↓ healthy
frontend: starts Vite dev server
```

---

## Implementation Plan (Recommended Tasks)

**Single wave — all tasks are small and independent:**

| Task | File(s) | Change |
|------|---------|--------|
| Add `seed_graph()` to lifespan | `backend/src/main.py` | Import + one function call |
| Update `.env.example` | `.env.example` | Rewrite with all vars + descriptions |
| Add `.gitkeep` files | `data/neo4j/{logs,import,plugins}/.gitkeep`, `logs/.gitkeep` | New empty files |

All three tasks touch different files with no dependencies — can be delivered as a single plan.

---

## Environment Availability

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| Docker Compose | Phase goal | ✓ (assumed) | Project already uses it |
| curl in backend container | Healthcheck `CMD` | ✓ | Installed in Dockerfile line 10 |
| curl in frontend container | Backend poll in CMD | ✓ | Installed in frontend/Dockerfile line 5 |
| wget in neo4j container | Neo4j healthcheck | ✓ | Included in neo4j:5.26.0 image |
| Terraform CLI | terraform validate | ✓ | Installed in backend Dockerfile |

---

## Validation Architecture

> `nyquist_validation` is `false` in `.planning/config.json` — this section is skipped per configuration.

---

## Project Constraints (from copilot-instructions.md)

- All FastAPI handlers MUST be `async` — use `await`, no blocking `.invoke()`
- Use `lifespan` context manager (not deprecated `@app.on_event("startup")`)
- All secrets via `.env` file — never hardcoded; document every var in `.env.example`
- Backend MUST expose `/health` endpoint used by Compose healthcheck ✅ already done
- No APOC/GDS plugins in Neo4j service
- `depends_on: neo4j: condition: service_healthy` ✅ already done

---

## Sources

### Primary (HIGH confidence)
- Direct file inspection: `backend/src/main.py`, `backend/src/api/routes.py`, `backend/src/services/seed.py`, `backend/src/db/database.py` — verified all env var reads, health endpoints, startup sequence
- `docker-compose.yml` — verified healthcheck URLs, volume mounts, env var injection
- `backend/Dockerfile`, `frontend/Dockerfile` — verified curl availability, build steps
- `.env.example`, `.env` — verified what is/isn't documented
- `.gitignore` — confirmed `data/` and `logs/` are excluded from git

### Secondary (MEDIUM confidence)
- Docker documentation: bind mounts with overlapping paths — named volume wins at more specific path (standard Docker behavior)

---

## Metadata

**Confidence breakdown:**
- Env var inventory: HIGH — direct grep of all source files
- Health endpoint status: HIGH — verified in both main.py and routes.py
- Auto-seed gap: HIGH — confirmed no call to seed_graph() in lifespan
- Directory gitignore issue: HIGH — confirmed in .gitignore
- Volume mount ordering: MEDIUM — documented Docker behavior, not tested fresh

**Research date:** 2025-07-11
**Valid until:** 2025-08-11 (stable stack, unlikely to change)

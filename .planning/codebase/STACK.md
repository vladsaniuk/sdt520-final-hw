# Tech Stack

**Analysis Date:** 2025-07-15

## Backend

**Language:** Python 3.13 (`python:3.13-slim` in `backend/Dockerfile`)

**Framework:** FastAPI (unpinned) — ASGI app defined in `backend/src/main.py`, served by `uvicorn`

**Key libraries** (from `backend/requirements.txt`):

| Package | Version | Purpose |
|---|---|---|
| `fastapi` | unpinned | REST API + SSE streaming |
| `uvicorn` | unpinned | ASGI server (`--reload` in dev) |
| `langchain` | unpinned | LLM orchestration base |
| `langchain-openai` | unpinned | `ChatOpenAI` client (OpenRouter-compatible) |
| `langchain-neo4j` | unpinned (0.9.0 per spec) | `Neo4jGraph` integration for GraphRAG |
| `langchain-text-splitters` | unpinned | Document chunking for ingestion |
| `neo4j` | unpinned (**must stay 5.x, NOT 6.x**) | Official Neo4j Python driver |
| `neo4j-graphrag` | unpinned | `VectorCypherRetriever`, `SentenceTransformerEmbeddings` |
| `sentence-transformers` | unpinned | Local embeddings (`all-MiniLM-L6-v2`, 384-dim) |
| `boto3` | unpinned | AWS SDK — used in `backend/src/services/pricing.py` |
| `pydantic` | unpinned | Request/response models (`backend/src/core/models.py`) |
| `pydantic-settings` | unpinned | Settings management |
| `pypdf` | unpinned | PDF parsing for knowledge base ingestion |
| `python-multipart` | unpinned | File upload support in FastAPI |
| `python-dotenv` | unpinned | `.env` file loading |
| `websockets` | >=12.0 | WebSocket support (only pinned dep) |
| `deepeval` | unpinned | LLM/RAG evaluation tests |
| `pytest` | unpinned | Test runner |
| `ruff` | unpinned | Python linter |
| `black` | unpinned | Python formatter |

**Terraform CLI:** 1.9.5 — installed into the backend Docker image (`backend/Dockerfile` ARG `TERRAFORM_VERSION=1.9.5`). Used by `_validate_terraform()` in `backend/src/api/routes.py` to run `terraform init` + `terraform validate -json` on generated HCL.

## Frontend

**Language:** TypeScript ~6.0.2

**Framework:** React 19.2.5 — SPA, entry at `frontend/src/main.tsx`

**Build tool:** Vite 8.0.10 (`frontend/vite.config.ts`)

**Key dependencies** (from `frontend/package.json`):

| Package | Version | Purpose |
|---|---|---|
| `react` / `react-dom` | ^19.2.5 | UI framework |
| `@chakra-ui/react` | ^2.10.9 | Component library |
| `@emotion/react` / `@emotion/styled` | ^11.14.x | Chakra UI CSS-in-JS runtime |
| `framer-motion` | ^12.38.0 | Animations (required by Chakra UI) |
| `mermaid` | ^11.14.0 | Renders architecture diagrams from LLM output |
| `react-syntax-highlighter` | ^16.1.1 | Terraform HCL / JSON code display |
| `react-icons` | ^5.6.0 | Icon library |
| `tailwindcss` | ^4.3.0 | Utility CSS (alongside Chakra) |
| `@fontsource/geist` / `@fontsource/geist-mono` | ^5.2.x | Typography |
| `@vitejs/plugin-react` | ^6.0.1 | Vite React transform |
| `typescript-eslint` | ^8.58.2 | TypeScript linting |

**Dev server proxy** (`frontend/vite.config.ts`):
- `/api/v1/knowledge/progress` → `ws://backend:8000` (WebSocket, must match before `/api` rule)
- `/api` → `http://backend:8000` (HTTP, keepAlive disabled to avoid 502 after restart)

## Infrastructure

**Graph Database:** Neo4j 5.26.0
- Docker image: `neo4j:5.26.0` (pinned — see Key Dependencies)
- Ports: `7474` (HTTP browser), `7687` (Bolt protocol)
- Data volume: `./data/neo4j`
- Auth: `neo4j/${NEO4J_PASSWORD}`

**Relational / Conversation Store:** SQLite
- File: `/app/data/advisor.db` (inside backend container, on `sqlite_data` Docker volume)
- Schema: `conversations`, `messages`, `artifacts` tables
- Implementation: `backend/src/db/database.py` — raw `sqlite3` module, no ORM

**Container Runtime:** Docker Compose (`docker-compose.yml`)
- Three services: `neo4j`, `backend`, `frontend`
- `backend` depends on `neo4j` healthcheck; `frontend` depends on `backend` healthcheck

**Debug Log:** JSON-lines file at `/logs/debug.jsonl` (mounted from host `./logs/`)
- Written by `_log_event()` helper in `backend/src/api/routes.py`
- Every SSE event is mirrored here with a `_ts` UTC timestamp added

## Key Dependencies

| Dependency | Constraint | Reason |
|---|---|---|
| `neo4j` Python driver | **Stay on 5.x, NOT 6.x** | Breaking API changes in 6.x; `langchain-neo4j` 0.9.0 targets 5.x |
| Neo4j Docker image | Pinned to `5.26.0` | Driver/server version parity required |
| `websockets` | `>=12.0` | Only explicitly pinned dep in `requirements.txt`; older versions have incompatible API |
| `all-MiniLM-L6-v2` embeddings | 384 dimensions | Vector index `aws_document_chunks` created at 384-dim cosine. Changing model breaks existing index — must DROP and recreate (see `backend/src/services/knowledge_base.py` L19-30) |
| Terraform CLI | 1.9.5 | Pinned in `backend/Dockerfile` ARG; used for HCL validation |

## Build & Run

**Local development (Docker Compose):**
```bash
# Copy and fill env vars
cp .env.example .env   # set LLM_API_KEY, NEO4J_PASSWORD, ALLOWED_ORIGINS

# Start all services
docker compose up --build

# Backend available at:  http://localhost:8000
# Frontend available at: http://localhost:3000
# Neo4j browser at:      http://localhost:7474
```

**Service startup order (enforced by healthchecks):**
1. `neo4j` — waits until HTTP 7474 responds
2. `backend` — waits until `GET /api/v1/health` returns 200
3. `frontend` — Vite dev server, polls backend health before starting

**Backend entry point:** `uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload`
**Frontend entry point:** `npm run dev -- --host` (Vite, port 5173 inside container → 3000 on host)

**Backend tests:**
```bash
cd backend
pytest tests/
```

**Backend linting/formatting:**
```bash
ruff check src/
black src/
```

---

*Stack analysis: 2025-07-15*

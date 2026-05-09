# Technology Stack

**Analysis Date:** 2025-01-24

## Languages

**Primary:**
- Python 3.13.13 - Backend API, LLM orchestration, GraphRAG logic
- TypeScript ~6.0.2 - Frontend UI (React)

**Secondary:**
- CSS / Tailwind - Frontend styling

## Runtime

**Environment:**
- Python 3.13.13 (backend, via `.tool-versions`)
- Node.js 22.13.1 (frontend, via `.tool-versions`)

**Package Manager:**
- `pip` (Python) — `requirements.txt` (no lockfile pinned)
- `npm` (Node.js) — `package-lock.json` present

## Frameworks

**Core:**
- FastAPI (latest) - Backend REST API (`backend/src/main.py`)
- React 19.2.5 - Frontend SPA (`frontend/src/main.tsx`)
- LangChain (`langchain`, `langchain-openai`, `langchain-community`) - LLM orchestration and GraphRAG

**Testing:**
- pytest - Backend unit tests (`backend/tests/unit/`)
- deepeval - LLM/RAG evaluation tests (`backend/tests/evals/`)

**Build/Dev:**
- Vite 8.0.10 - Frontend bundler and dev server
- uvicorn - Backend ASGI server
- ruff - Python linter
- black - Python formatter (target: py313)
- ESLint 10.2.1 - TypeScript/React linter
- Prettier - Frontend formatter (`.prettierrc` in `frontend/`)

## Key Dependencies

**Critical:**
- `langchain-openai` - LLM client (OpenRouter-compatible ChatOpenAI)
- `langchain-community` - `Neo4jGraph` integration for GraphRAG
- `neo4j` - Official Neo4j Python driver (`backend/src/services/knowledge_base.py`)
- `neo4j-graphrag` - Graph-based retrieval-augmented generation
- `boto3` - AWS SDK for pricing API calls (`backend/src/services/pricing.py`)
- `pydantic` + `pydantic-settings` - Request/response validation, settings management
- `sqlalchemy` + `psycopg2-binary` - PostgreSQL ORM models (`backend/src/models/workload.py`)
- `mermaid` ^11.14.0 - Diagram rendering in frontend (`frontend/package.json`)
- `react-syntax-highlighter` ^16.1.1 - Code/IaC snippet rendering

**Infrastructure:**
- `python-multipart` - File upload support in FastAPI
- `python-dotenv` - `.env` file loading

## Configuration

**Environment:**
- Configured via `.env` file (see `.env.example` at project root)
- Key vars: `LLM_API_KEY`, `NEO4J_PASSWORD`, `NEO4J_URI`
- Backend reads env vars via `os.getenv()` and `pydantic-settings`

**Build:**
- `frontend/tsconfig.json`, `frontend/tsconfig.app.json`, `frontend/tsconfig.node.json` - TypeScript config
- `frontend/vite.config.ts` - Vite build config
- `frontend/tailwind.config.js` + `frontend/postcss.config.js` - CSS build pipeline
- `backend/pyproject.toml` - ruff and black tool config (Python 3.13 target)

## Platform Requirements

**Development:**
- Docker + Docker Compose (`docker-compose.yml`) for Neo4j, backend, and frontend
- Python 3.13 (`backend/Dockerfile` uses `python:3.13-slim`)
- Node 22.13 (`frontend/Dockerfile` uses `node:22.13-slim`)
- libpq-dev (installed in backend Dockerfile for psycopg2)

**Production:**
- Containerized deployment via Docker Compose (3-service stack: `neo4j`, `backend`, `frontend`)
- Backend port 8000, frontend port 3000 (mapped from Vite's 5173), Neo4j ports 7474/7687

---

*Stack analysis: 2025-01-24*

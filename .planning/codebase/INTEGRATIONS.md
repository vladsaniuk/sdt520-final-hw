# External Integrations

**Analysis Date:** 2025-07-15

## APIs & Services

### LLM Provider — OpenRouter
- **Service:** OpenRouter (`https://openrouter.ai/api/v1`)
- **Purpose:** Routes chat completions to OpenAI GPT-4o. Acts as OpenAI-compatible proxy.
- **Model:** `openai/gpt-4o` (hardcoded in `backend/src/core/advisor.py` L105 and `backend/src/api/routes.py` L75)
- **SDK/Client:** `langchain-openai` — `ChatOpenAI(openai_api_base="https://openrouter.ai/api/v1")`
- **Auth env var:** `LLM_API_KEY` → passed as `openai_api_key` parameter
- **Used in:**
  - `backend/src/core/advisor.py` — `ArchitectureAdvisor` class (GraphRAG + structured output)
  - `backend/src/api/routes.py` — `_make_llm()`, `_generate_full_terraform()`, streaming chat
- **Call patterns:**
  - `llm.astream(messages)` — SSE token streaming (`/chat/stream` endpoint)
  - `llm.ainvoke(messages)` — non-streaming (`/compact`, Terraform generation)
  - `llm.with_structured_output(ArchitecturePlan, method="json_mode")` — structured JSON (`/chat`)

### AWS Pricing API
- **Service:** AWS Pricing API (`us-east-1` region)
- **Purpose:** On-demand cost data for AWS services
- **SDK/Client:** `boto3` — `backend/src/services/pricing.py`
- **Auth:** Standard AWS credential chain (env vars / instance profile — no explicit key in code)
- **Note:** Results are file-cached under `data/cache/pricing/` to avoid repeated API calls

## Data Storage

### Neo4j 5.26.0 — Knowledge Graph
- **Role:** Primary knowledge store for GraphRAG. Contains AWS service relationships, Well-Architected pillars, document chunks from uploaded PDFs, and architecture patterns.
- **Connection env var:** `NEO4J_URI` (default: `bolt://localhost:7687`)
- **Auth env vars:** `NEO4J_USER` (default: `neo4j`), `NEO4J_PASSWORD`
- **Clients:**
  - `neo4j.GraphDatabase.driver()` — direct driver in `backend/src/services/knowledge_base.py` and `backend/src/core/advisor.py` (for `VectorCypherRetriever`)
  - `langchain_neo4j.Neo4jGraph` — in `ArchitectureAdvisor.__init__()` for Cypher queries
  - `neo4j_graphrag.retrievers.VectorCypherRetriever` — vector similarity search
- **Node types:** `AWS_Service`, `WellArchitected_Pillar`, `Document_Chunk`, `KnowledgeDocument`, `Architecture_Pattern`
- **Relationships:** `(:AWS_Service)-[:ALIGNS_WITH]->(:WellArchitected_Pillar)`, `(:Document_Chunk)-[:PART_OF]->(:KnowledgeDocument)`
- **Vector index:** `aws_document_chunks` — 384-dim cosine similarity, on `Document_Chunk.embedding`
- **Schema init:** `backend/src/services/knowledge_base.py` `initialize_schema()` — drops and recreates index, creates uniqueness constraints
- **Docker volume:** `./data/neo4j:/data`
- **⚠️ Driver version:** Must use `neo4j` Python driver 5.x. Do NOT upgrade to 6.x.

### SQLite — Conversation Persistence
- **Role:** Stores conversation state, message history, and generated artifacts between requests.
- **File path:** `/app/data/advisor.db` (inside backend container on `sqlite_data` Docker volume)
- **Implementation:** `backend/src/db/database.py` — raw `sqlite3` module, no ORM
- **Tables:**
  - `conversations(id, state, created_at, updated_at)` — state machine: `gathering` → `architecture_ready` → `complete`
  - `messages(id, conversation_id, role, content, created_at)` — roles: `human`, `ai`, `system`
  - `artifacts(id, conversation_id, artifact_type, content, created_at)` — types: `architecture`, `costs`, `terraform`
- **Access pattern:** All DB calls are sync; wrapped in `asyncio.to_thread()` in route handlers to avoid blocking the event loop

### Local Filesystem — Embeddings & Logs
- **Sentence-transformer model cache:** Downloaded by `sentence-transformers` on first use (Hugging Face cache, inside container)
- **Pricing cache:** `data/cache/pricing/` (JSON files, host-mounted)
- **Debug log:** `/logs/debug.jsonl` (host `./logs/` mounted into backend container)
- **Neo4j import dir:** `./data/neo4j/import` (for bulk CSV ingestion)

## Embedding Pipeline

- **Model:** `all-MiniLM-L6-v2` (sentence-transformers, runs locally — no external API call)
- **Dimensions:** 384 (cosine similarity)
- **Client:** `neo4j_graphrag.embeddings.SentenceTransformerEmbeddings`
- **Singleton:** Module-level `_embedder` / `_retriever` in `backend/src/core/advisor.py` — lazy-initialized on first RAG call, reused thereafter
- **Ingestion path:** `backend/src/services/ingestion.py` — PDF → chunks → embeddings → Neo4j `Document_Chunk` nodes
- **Retrieval query:**
  ```cypher
  MATCH (node)-[:PART_OF]->(doc:KnowledgeDocument)
  RETURN node.text AS text, doc.filename AS source, score
  ```

## Terraform Validation (Local CLI)

- **Tool:** Terraform CLI 1.9.5 — installed in `backend/Dockerfile`
- **Purpose:** Validate LLM-generated HCL before returning it to the user
- **Flow:** `terraform init -backend=false` (60s timeout) → `terraform validate -json` (30s timeout)
- **Implementation:** `_validate_terraform()` in `backend/src/api/routes.py`
- **Graceful fallback:** If `terraform` binary not found (`shutil.which`), returns `valid=None` — does not error
- **Temp dir:** `tempfile.mkdtemp(prefix="tf_{rec_id[:8]}_")` — cleaned up in `finally` block

## Data Flow

```
User Message (HTTP POST /api/v1/chat/stream)
    │
    ▼
[State Machine Check] ──── db.get_state(conv_id) via SQLite
    │
    ├── state="gathering"
    │       │
    │       ▼
    │   GATHER_PROMPT + history → OpenRouter (streaming)
    │   Detect {"ready_for":["architecture"]} signal
    │   → db.save_message() → db.set_state("architecture_ready")
    │   → SSE: token events + done event
    │
    └── state="architecture_ready" / "complete"
            │
            ▼
        FOLLOWUP_PROMPT + history → OpenRouter (streaming)
        → SSE: token events + done event

POST /api/v1/generate/architecture
    │
    ▼
[GraphRAG Context Assembly]
    ├── Neo4j Cypher: AWS_Service → WellArchitected_Pillar (top 20)
    └── VectorCypherRetriever: embed query → cosine search → top-5 Document_Chunks
            (sentence-transformers local, all-MiniLM-L6-v2)
    │
    ▼
ADVISOR_PROMPT.format(context, requirements)
    + conversation history (from SQLite)
    → OpenRouter (streaming JSON)
    → parse ArchitecturePlan (Pydantic, json_mode)
    → retry once on parse failure
    → SSE: token events + done(ArchitecturePlan payload)

POST /api/v1/chat/{id}/approve
    │
    ▼
_generate_full_terraform(history) → OpenRouter
    → strip code fences
    → _validate_terraform() via Terraform CLI
    → ApproveResponse{hcl, valid, validation_errors}

Every SSE event also:
    → _log_event() → /logs/debug.jsonl (appended, one JSON line per event + _ts timestamp)
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLM_API_KEY` | **Yes** | — | OpenRouter API key. Passed as `openai_api_key` to `ChatOpenAI`. |
| `NEO4J_PASSWORD` | **Yes** | `password` | Neo4j database password. Set in both `neo4j` and `backend` services. |
| `NEO4J_URI` | No | `bolt://localhost:7687` | Neo4j Bolt connection URI. Inside Docker: `bolt://neo4j:7687` |
| `NEO4J_USER` | No | `neo4j` | Neo4j username. Defaulted in code via `os.getenv("NEO4J_USER", "neo4j")` |
| `ALLOWED_ORIGINS` | No | `*` | CORS allowed origins for FastAPI. Docker Compose default is `*`. |

**Secrets location:** `.env` file at project root (git-ignored). Set before running `docker compose up`.

**Docker Compose injects:**
- `LLM_API_KEY=${LLM_API_KEY}` → backend
- `NEO4J_URI=bolt://neo4j:7687` → backend (hardcoded service name, not from host .env)
- `NEO4J_PASSWORD=${NEO4J_PASSWORD:-password}` → both neo4j and backend
- `ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-*}` → backend

## SSE Event Protocol

All streaming endpoints return `text/event-stream` with JSON-encoded data lines:

```
data: {"type":"token","content":"..."}      # LLM output chunk
data: {"type":"status","content":"..."}     # Progress update
data: {"type":"debug","event":"..."}        # Internal debug (also written to /logs/debug.jsonl)
data: {"type":"done","payload":{...}}       # Final structured result
data: {"type":"error","message":"..."}      # Error condition
```

Headers set: `Cache-Control: no-cache`, `X-Accel-Buffering: no`

## WebSocket Endpoints

- `GET /api/v1/knowledge/progress` — WebSocket for knowledge base ingestion progress
- Proxied by Vite dev server: `/api/v1/knowledge/progress` → `ws://backend:8000` (must be configured BEFORE the generic `/api` HTTP proxy rule in `frontend/vite.config.ts`)

---

*Integration audit: 2025-07-15*

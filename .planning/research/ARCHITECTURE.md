# Architecture Research

**Project:** AWS Architecture Advisor (GraphRAG Chat Application)
**Researched:** 2025-01-14
**Confidence:** HIGH — based on direct codebase analysis

---

## Component Map

### Existing Components (verified in codebase)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Browser                                                             │
│  ┌─────────────────────┐     ┌──────────────────────────────────┐  │
│  │ ChatBox (React)     │     │ KnowledgeBase (React)            │  │
│  │ - useState messages │     │ - file upload form               │  │
│  │ - fetch /api/v1/chat│     │ - POST /api/v1/knowledge/upload  │  │
│  │ - NO conversation_id│     │ - GET  /api/v1/knowledge/status  │  │
│  └──────────┬──────────┘     └─────────────────┬────────────────┘  │
└─────────────┼───────────────────────────────────┼───────────────────┘
              │ HTTP (no proxy configured)         │ HTTP
              ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FastAPI Backend (:8000)                                             │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ API Layer (src/api/)                                           │ │
│  │  routes.py: POST /api/v1/chat          ← single-turn, mock-id │ │
│  │  knowledge.py: POST /upload, GET /status ← stub indexing      │ │
│  └────────────────────────┬───────────────────────────────────────┘ │
│                           │                                         │
│  ┌────────────────────────▼───────────────────────────────────────┐ │
│  │ Core / Orchestration Layer (src/core/)                         │ │
│  │  RequirementExtractor  — LLM: NL → structured JSON            │ │
│  │  ArchitectureAdvisor   — Cypher + LLM → advice text           │ │
│  │    └── vector retrieval: TODO (code has stub comment)         │ │
│  │  DiagramGenerator      — regex parse Mermaid from LLM text    │ │
│  │  TerraformGenerator    — LLM → HCL snippet (no file persist)  │ │
│  │  CloudFormationGenerator — LLM → YAML snippet (out-of-scope)  │ │
│  │  CostAnalyzer          — LLM + AWS Pricing API → cost dict    │ │
│  │  TradeoffAnalyzer      — standalone LLM call (unused in route)│ │
│  └────────────────────────┬───────────────────────────────────────┘ │
│                           │                                         │
│  ┌────────────────────────▼───────────────────────────────────────┐ │
│  │ Services Layer (src/services/)                                 │ │
│  │  KnowledgeBaseService — Neo4j driver, schema init, CRUD       │ │
│  │  PricingService       — boto3 AWS Pricing API + file cache    │ │
│  └────────────────────────┬───────────────────────────────────────┘ │
│                           │                                         │
│  DEAD CODE:               │                                         │
│  src/models/workload.py   │  SQLAlchemy ORM — no DB connected       │
│  (Workload, Recommendation, IaCSnippet, CostProfile)               │
└───────────────────────────┼─────────────────────────────────────────┘
                            │
              ┌─────────────┼────────────────────┐
              ▼             ▼                    ▼
    ┌──────────────┐  ┌───────────────┐  ┌─────────────────┐
    │ Neo4j :7687  │  │ OpenRouter    │  │ AWS Pricing API │
    │ (Bolt)       │  │ (HTTPS LLM)   │  │ (boto3, HTTPS)  │
    │ Nodes:       │  │ gpt-4o via    │  │ file cache:     │
    │ AWS_Service  │  │ OpenAI compat │  │ data/cache/     │
    │ WA_Pillar    │  └───────────────┘  └─────────────────┘
    │ Document_Chunk│
    │ (vector idx) │
    └──────────────┘
```

### Target Components (gaps to close)

```
MISSING — need to build:

ConversationMemory
  Purpose: Map conversation_id → LangChain ChatMessageHistory
  Location: backend/src/core/memory.py (new)
  Type: In-memory dict (no external store needed for demo/no-auth)
  Used by: routes.py (load/save per request), RequirementExtractor, ArchitectureAdvisor

DocumentParser
  Purpose: Raw file bytes → List[str] text chunks
  Location: backend/src/core/ingestion/parser.py (new)
  Used by: index_document() background task in knowledge.py

EmbeddingService
  Purpose: List[str] → List[float vectors] → Neo4j Document_Chunk nodes
  Location: backend/src/core/ingestion/embedder.py (new)
  Dependency: OpenAI Embeddings API (NOT OpenRouter — OpenRouter is chat-only)
  Critical note: Existing vector index is 1536-dim (ada-002 compatible).
                 OpenRouter does NOT proxy embedding endpoints.
                 Requires OPENAI_API_KEY env var OR switch to local embeddings.

TerraformFileStore
  Purpose: Persist generated .tf content keyed by recommendation_id
  Location: data/generated/{recommendation_id}.tf (filesystem)
  Used by: routes.py (write on generation), download endpoint (read)

TerraformDownloadRouter
  Purpose: Serve .tf file as download
  Location: backend/src/api/routes.py (new endpoint)
  Endpoint: GET /api/v1/terraform/{recommendation_id}

IngestionStatusTracker
  Purpose: Track document_id → status (queued/parsing/embedding/indexed/error)
  Location: backend/src/api/knowledge.py (in-memory dict, module-level)
  Used by: GET /api/v1/knowledge/status/{document_id}
```

### Component Boundaries

| Component | Owns | Does NOT Own | Interface |
|-----------|------|--------------|-----------|
| `routes.py` | Request validation, pipeline orchestration, response assembly | LLM calls, Neo4j calls | FastAPI route handlers |
| `RequirementExtractor` | NL→JSON parsing via LLM | Conversation history management | `.extract(message, history?)→dict` |
| `ArchitectureAdvisor` | Cypher query, vector search, LLM invocation | Chat memory, response formatting | `.get_recommendation(reqs, history?)→dict` |
| `TerraformGenerator` | HCL generation via LLM | File persistence, download | `.generate(architecture)→str` |
| `KnowledgeBaseService` | Neo4j schema, node CRUD, vector index | Document parsing, chunking, embedding | `.add_chunk(text, embedding, doc_id)` |
| `ConversationMemory` | In-memory history per conversation_id | Persistence (lost on restart — OK for demo) | `.get(conv_id)→history`, `.append(conv_id, role, content)` |
| `DocumentParser` | File→chunks | Embedding, Neo4j | `.parse(file_path, mime)→List[str]` |
| `EmbeddingService` | Text→vectors, Neo4j write | Parsing, status tracking | `.embed_and_store(chunks, doc_id)→int` |

---

## Data Flow

### Flow 1: Architecture Advisory (Current — Single Turn)

```
1. User types message → ChatBox.handleSend()
2. POST /api/v1/chat { message: str }         [no conversation_id sent]
3. RequirementExtractor.extract(message)       → 1 LLM call → JSON dict
4. ArchitectureAdvisor.get_recommendation(req) → Cypher query (generic: all services)
                                               → 1 LLM call → advice_text
5. DiagramGenerator.extract_mermaid(text)      → regex, no LLM
6. TerraformGenerator.generate(text)           → 1 LLM call → HCL string (not persisted)
7. CloudFormationGenerator.generate(text)      → 1 LLM call → YAML string (out-of-scope)
8. CostAnalyzer.estimate_costs(text)           → 1 LLM call + Pricing API
9. Return ChatResponse JSON                    → frontend renders all at once
   { recommendation_id: "mock-uuid", text, diagram, iac, costs }
```

**Problems:** 4+ serial LLM calls (~20-40s), no history context, mock ID, no file download

### Flow 2: Architecture Advisory (Target — Multi-Turn + Streaming)

```
1. User types message → ChatBox.handleSend()
2. Retrieve/generate conversation_id from localStorage
3. POST /api/v1/chat { message: str, conversation_id: str }
4. Load history = ConversationMemory.get(conversation_id)
5. RequirementExtractor.extract(message, history) → LLM (context-aware)
6. ArchitectureAdvisor.get_recommendation(reqs, history):
   a. Cypher: MATCH services ↔ pillars (graph context)
   b. Vector search: Document_Chunk similarity → top-K chunks (if docs indexed)
   c. Combine graph_context + vector_context + history + reqs → prompt
   d. LLM streaming call → yield tokens
7. DiagramGenerator.extract_mermaid(accumulated_text) → regex
8. TerraformGenerator.generate(accumulated_text) → HCL
9. Persist HCL to data/generated/{recommendation_id}.tf
10. CostAnalyzer.estimate_costs(accumulated_text) → costs
11. ConversationMemory.append(conversation_id, user_msg, assistant_msg)
12. Stream SSE events to frontend:
    - token events during LLM streaming
    - metadata event at end: { recommendation_id, diagram, iac_preview, costs }
13. Frontend renders tokens progressively, shows diagram/costs on metadata event
```

### Flow 3: Document Ingestion (Target — Real Pipeline)

```
1. User selects file → KnowledgeBase.tsx upload form
2. POST /api/v1/knowledge/upload (multipart/form-data)
3. Save file → data/uploads/{doc_id}_{filename}
4. Set status[doc_id] = "queued"
5. BackgroundTask: index_document(doc_id, file_path, mime_type)
   a. status[doc_id] = "parsing"
      DocumentParser.parse(file_path, mime):
        - PDF → PyMuPDF (fitz.open) → page text
        - .md/.txt → direct read
      → List[str] raw_chunks
   b. TextSplitter (RecursiveCharacterTextSplitter, chunk=512, overlap=50)
      → List[str] chunks
   c. status[doc_id] = "embedding"
      EmbeddingService:
        - OpenAI text-embedding-3-small (1536-dim) via api.openai.com
        - Batch embed chunks (max 100/request)
        - For each chunk: Neo4j MERGE Document_Chunk { text, embedding, doc_id, chunk_index }
        - Neo4j MERGE KnowledgeDocument { id: doc_id, filename, timestamp }
        - MERGE (chunk)-[:PART_OF]->(doc)
   d. status[doc_id] = "indexed"
6. GET /api/v1/knowledge/status/{doc_id} → { status, chunk_count }
```

### Flow 4: Terraform File Download (Target)

```
1. User reviews plan in chat, clicks "Approve & Download Terraform"
2. GET /api/v1/terraform/{recommendation_id}
3. Backend: check data/generated/{recommendation_id}.tf exists
4. Return FileResponse(path, media_type="text/plain",
                        headers={"Content-Disposition": "attachment; filename=main.tf"})
5. Browser triggers file download
```

### Data Flow Direction Summary

```
Frontend ──────────────────────────────────────────► Backend API
  ChatBox sends: message + conversation_id
  KnowledgeBase sends: file upload

Backend API ────────────────────────────────────────► OpenRouter LLM
  Extractor, Advisor, TerraformGenerator, CostAnalyzer send prompts

Backend API ────────────────────────────────────────► Neo4j
  Advisor: read Cypher queries (graph context)
  Advisor: read vector queries (semantic chunks)
  EmbeddingService: write Document_Chunk nodes (on ingestion)
  KnowledgeBaseService: write schema on startup

Backend API ────────────────────────────────────────► OpenAI Embeddings
  EmbeddingService: text → 1536-dim vectors
  (NOT through OpenRouter — separate API endpoint needed)

Backend API ────────────────────────────────────────► AWS Pricing API
  CostAnalyzer: GetProducts → EC2 pricing

Backend API ────────────────────────────────────────► Filesystem
  Write: data/uploads/ (raw user files)
  Write: data/generated/ (Terraform .tf files)
  Read:  data/cache/pricing/ (pricing cache)

Backend API ◄──────────────────────────────────────── All above
  Assembles ChatResponse JSON or SSE stream for frontend
```

---

## Build Order

Dependencies flow from foundation to features. Each phase must be complete before the next.

### Phase 0: Baseline Repair (unblock all phases)

**Must-fix before anything else — currently broken:**

1. `backend/src/core/advisor.py` — `import json` is at bottom of file (runtime error on first advice call)
2. `frontend/src/components/Diagram/MermaidViewer.tsx` — `mermaid.contentLoaded()` deprecated; use `mermaid.run()`
3. TypeScript `bool` → `boolean` type errors (frontend won't compile clean)
4. `backend/src/models/workload.py` — SQLAlchemy models import fails if SQLAlchemy not installed or DB not set; remove or stub
5. Vite proxy config (`vite.config.ts`) — frontend calls `/api/v1/chat` but no proxy to backend; works in Docker via network but fails in local dev
6. `docker-compose.yml` — no healthcheck on neo4j; backend starts before Neo4j is ready (race condition)
7. `recommendation_id: "mock-uuid"` → replace with `str(uuid.uuid4())`

**Outputs:** Docker Compose starts cleanly, single-turn chat returns real data (may fail on empty graph, but pipeline runs)

### Phase 1: Graph Seeding (unblocks Advisor quality)

**Dependency:** Phase 0

The Cypher query in `ArchitectureAdvisor` returns empty results on a fresh Neo4j (no data). Pipeline runs but LLM gets empty context.

1. Create `backend/src/data/seed_graph.py` — MERGE AWS_Service and WellArchitected_Pillar nodes with key relationships
2. Add seed script to Docker entrypoint or as a startup task in `main.py` (idempotent via MERGE)
3. Validate: Cypher query in advisor returns ≥5 services

**Outputs:** GraphRAG pipeline uses real context; advice quality improves

### Phase 2: Multi-Turn Conversation (core feature)

**Dependency:** Phase 0

1. `backend/src/core/memory.py` — `ConversationMemory` class (dict of LangChain `InMemoryChatMessageHistory`)
2. Update `ChatRequest` model: `conversation_id: str` (generate server-side if missing)
3. Update `ArchitectureAdvisor.get_recommendation()` to accept and pass `chat_history`
4. Update `RequirementExtractor.extract()` to include history context in prompt
5. `routes.py`: instantiate ConversationMemory, load/save per request, return conversation_id in response
6. Update `ChatResponse` model: add `conversation_id: str`
7. Frontend `ChatBox.tsx`: store conversation_id in `localStorage`, send with every request

**Outputs:** User can say "make it cheaper" and system understands context

### Phase 3: Document Ingestion Pipeline (RAG quality)

**Dependency:** Phase 0, Phase 1 (Neo4j schema in place)

**Critical pre-check:** Embedding API endpoint — decide before building:
- Option A: Add `OPENAI_API_KEY` env var, use `langchain_openai.OpenAIEmbeddings` against `api.openai.com`
- Option B: `langchain_huggingface` + `sentence-transformers/all-MiniLM-L6-v2` (384-dim) — requires changing Neo4j vector index from 1536→384

Recommendation: **Option A** if user has OpenAI key (most likely), else **Option B** with index rebuild.

Build order within phase:
1. `backend/src/core/ingestion/__init__.py`
2. `backend/src/core/ingestion/parser.py` — PyMuPDF for PDF, plaintext for txt/md
3. `backend/src/core/ingestion/embedder.py` — chunk, embed, write to Neo4j
4. Wire `index_document()` in `knowledge.py` to real pipeline
5. Add in-memory `status_store: dict[str, dict]` to `knowledge.py`
6. Update `GET /status/{doc_id}` to read from `status_store`
7. Wire vector retrieval in `ArchitectureAdvisor` (the `TODO` comment on line 32)
8. Add `pymupdf` (or `pypdf`) and `langchain-openai` embeddings to `requirements.txt`

**Outputs:** Uploaded PDFs become searchable; Advisor uses user's own docs as context

### Phase 4: Terraform File Generation + Download (deliverable feature)

**Dependency:** Phase 2 (real recommendation_id from conversation flow)

1. Add `data/generated/` to `docker-compose.yml` volumes
2. `routes.py`: after `TerraformGenerator.generate()`, write to `data/generated/{recommendation_id}.tf`
3. Add endpoint `GET /api/v1/terraform/{recommendation_id}` → `FileResponse`
4. Remove `CloudFormationGenerator` call from the main pipeline (out-of-scope per PROJECT.md)
5. Frontend `ChatBox.tsx`: after receiving response with `recommendation_id`, show "Download Terraform" button
6. Button calls `window.location.href = /api/v1/terraform/{recommendation_id}`

**Outputs:** User can download ready-to-use `.tf` file

### Phase 5: Streaming Responses (UX quality)

**Dependency:** Phase 2 (conversation works), Phase 4 (response assembled correctly)

1. Backend: Change `POST /api/v1/chat` to `StreamingResponse` (SSE)
   - Stream LLM tokens as `data: {"type":"token","content":"..."}` events
   - Emit final metadata as `data: {"type":"done","recommendation_id":"...","diagram":"...","costs":{}}` event
2. Frontend: Replace `fetch().json()` with EventSource or `fetch()` + `ReadableStream` reader
3. Update ChatBox to append tokens to message content progressively
4. Handle metadata event to update diagram and cost components

**Outputs:** Response appears word-by-word (~30s wait → immediate feedback)

### Phase 6: End-to-End Docker Polish

**Dependency:** All prior phases

1. Neo4j healthcheck in `docker-compose.yml` (`test: ["CMD", "neo4j", "status"]`)
2. Backend wait-for-neo4j logic (retry loop in startup event)
3. `.env.example` with all required vars (`LLM_API_KEY`, `NEO4J_PASSWORD`, `OPENAI_API_KEY`)
4. Verify `docker compose up` cold-start works without manual intervention
5. README quickstart update

---

## Integration Points

### Current Integrations

| Integration | Protocol | Direction | Status | Risk |
|-------------|----------|-----------|--------|------|
| Frontend → Backend | HTTP REST | bidirectional | Working (Docker network) | Vite proxy missing for local dev |
| Backend → OpenRouter LLM | HTTPS REST (OpenAI compat) | outbound | Working | Rate limits, latency |
| Backend → Neo4j | Bolt (neo4j driver + LangChain Neo4jGraph) | bidirectional | Working (schema init) | Neo4j startup race condition |
| Backend → AWS Pricing API | HTTPS (boto3) | outbound | Working | No AWS creds = silent fail |
| CostAnalyzer → file cache | Filesystem read/write | local | Working | None |

### Missing Integrations (must build)

| Integration | Protocol | Direction | Phase | Risk |
|-------------|----------|-----------|-------|------|
| Frontend → Backend (SSE stream) | HTTP SSE | inbound | Phase 5 | CORS headers, buffering |
| Backend → OpenAI Embeddings API | HTTPS REST | outbound | Phase 3 | **Critical: OpenRouter ≠ OpenAI embeddings endpoint** |
| Backend → Document_Chunk (vector search) | Bolt + Cypher vector | read | Phase 3 | Index must exist and be populated |
| Backend → data/generated/ (write .tf) | Filesystem | write | Phase 4 | Directory must be in Docker volume |
| Frontend → /api/v1/terraform/{id} | HTTP GET file | inbound | Phase 4 | FileResponse Content-Disposition |
| index_document → EmbeddingService | Internal async | internal | Phase 3 | Long-running background task |

### Critical Integration Risk: Embeddings API

**Problem:** `LLM_API_KEY` routes through OpenRouter (`https://openrouter.ai/api/v1`) which supports **chat completions only**, not `/embeddings`. The Neo4j vector index is sized at 1536 dimensions (OpenAI ada-002 / text-embedding-3-small).

**Solutions ranked:**
1. **Add `OPENAI_API_KEY` env var** → `OpenAIEmbeddings(api_key=OPENAI_API_KEY)` pointing at `api.openai.com`. Low-friction if user has key. Update `.env.example` and `docker-compose.yml`.
2. **Local sentence-transformers** → `HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")` (384-dim). No extra API key. Requires changing Neo4j vector index from 1536 → 384 and adding `sentence-transformers` to requirements. Heavier Docker image.

**Recommendation:** Option 1 (separate OPENAI_API_KEY) — minimal change, keeps vector index as-is. Document clearly in README.

### Conversation Memory Boundary

**Scope decision:** In-memory `dict[conversation_id, ChatMessageHistory]` in `routes.py` module scope.
- **Pro:** Zero complexity, no external dependency, works for demo (no auth, no persistence needed)
- **Con:** Memory lost on backend restart; no cross-request state if load-balanced
- **OK because:** PROJECT.md explicitly scopes out auth and PostgreSQL. Demo tool.

Do NOT persist conversation history to Neo4j — adds graph complexity without demo value.

### Streaming Boundary Decision

Use **Server-Sent Events (SSE)** not WebSockets:
- SSE is unidirectional (server→client) — correct for LLM streaming
- FastAPI `StreamingResponse` natively supports SSE
- Frontend `EventSource` API is simpler than WebSocket client
- No need for bidirectional real-time (user sends message via POST, then listens for stream)

```
POST /api/v1/chat → starts pipeline, returns streaming SSE body
  event: token\ndata: {"content":"word"}\n\n  (repeated)
  event: done\ndata: {"recommendation_id":"...","diagram":"...","costs":{}}\n\n
```

---

## Architecture Invariants

These must NOT change across phases (locked by PROJECT.md):

1. **Three Docker services**: `neo4j`, `backend`, `frontend` — no new services
2. **No PostgreSQL**: SQLAlchemy models must be removed or fully stubbed, not wired up
3. **Single data store**: Neo4j is the only persistence layer
4. **No auth**: No sessions, tokens, or user management
5. **OpenRouter for chat LLM**: `LLM_API_KEY` → `openrouter.ai/api/v1` for all LLM chat calls
6. **AWS Terraform only**: CloudFormation generator stays dormant; only Terraform in the download flow
7. **`docker compose up` must be the only required command** for a working demo

---

*Based on direct codebase analysis of: backend/src/api/routes.py, backend/src/api/knowledge.py, backend/src/core/advisor.py, backend/src/core/iac/terraform.py, backend/src/services/knowledge_base.py, backend/src/main.py, frontend/src/App.tsx, frontend/src/components/Chat/ChatBox.tsx, docker-compose.yml*

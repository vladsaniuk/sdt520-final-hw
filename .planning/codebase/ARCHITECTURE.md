# Architecture Overview

**Analysis Date:** 2025-01-31

---

## System Design

AWS Architecture Advisor is a multi-turn chatbot that guides users through describing their infrastructure requirements and then produces an AWS architecture plan, cost estimate, and deployable Terraform configuration.

The system is split into three Docker services: a **React SPA** (frontend), a **FastAPI async backend**, and **Neo4j** (graph + vector database). Conversation history is persisted in **SQLite** at `/app/data/advisor.db`. All SSE events are also logged to `/logs/debug.jsonl` for debugging.

The backend is fully async. Blocking operations (SQLite, sentence-transformer embeddings, Neo4j queries) are wrapped with `asyncio.to_thread()`. All generation endpoints return `StreamingResponse` with `text/event-stream` media type.

The LLM is **GPT-4o** accessed through **OpenRouter** (`https://openrouter.ai/api/v1`) using the LangChain `ChatOpenAI` adapter.

---

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (React SPA — port 3000)                                │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Sidebar    │  │   ChatBox    │  │   ArtifactDrawer     │  │
│  │ (sessions)  │  │ (SSE reader) │  │ Architecture/Costs/  │  │
│  └─────────────┘  └──────┬───────┘  │ Terraform/Debug tabs │  │
│                          │          └──────────────────────┘  │
│              ActionBar ──┘  (Generate Architecture/Costs/TF)   │
└──────────────────────────────────────────────────────────────────┘
                          │  HTTP / SSE
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  FastAPI Backend (port 8000)                                    │
│                                                                 │
│  POST /api/v1/chat/stream  ──►  GATHER_PROMPT / FOLLOWUP_PROMPT │
│  POST /api/v1/generate/architecture  ──►  ArchitectureAdvisor  │
│  POST /api/v1/generate/costs         ──►  inline LLM stream    │
│  POST /api/v1/generate/terraform     ──►  TERRAFORM_FULL_PROMPT │
│                                                                 │
│  ┌────────────────────────┐  ┌──────────────────────────────┐  │
│  │  ArchitectureAdvisor   │  │  SQLite DB (database.py)     │  │
│  │  - build_advisor_msgs  │  │  conversations / messages /  │  │
│  │  - get_recommendation  │  │  artifacts tables            │  │
│  │  - compact_conversation│  └──────────────────────────────┘  │
│  └────────────┬───────────┘                                    │
│               │  VectorCypherRetriever                         │
└───────────────┼─────────────────────────────────────────────────┘
                │  bolt://neo4j:7687
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Neo4j 5.26.0 (port 7687 / 7474)                               │
│                                                                 │
│  Nodes:  AWS_Service, WellArchitected_Pillar,                  │
│          Document_Chunk, KnowledgeDocument,                     │
│          Architecture_Pattern                                   │
│                                                                 │
│  Vector index: aws_document_chunks (384-dim cosine,            │
│                all-MiniLM-L6-v2 embeddings)                    │
│                                                                 │
│  Cypher: MATCH (node)-[:PART_OF]->(doc:KnowledgeDocument)      │
│          RETURN node.text, doc.filename, score                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Flows

### 1. Multi-turn Requirement Gathering → Architecture Unlock

1. User types message → browser POSTs to `POST /api/v1/chat/stream` (`ChatRequest: {message, conversation_id}`)
2. Backend loads conversation state (`db.get_state`) and history (`db.get_history`) from SQLite
3. If state is `'gathering'`: backend builds `[SystemMessage(GATHER_PROMPT), *history, HumanMessage(message)]` and streams tokens via `llm.astream()`
4. Each token emits SSE event: `data: {"type":"token","content":"..."}\n\n`
5. When LLM embeds `{"ready_for":["architecture"]}` in its response, backend strips signal, sets state → `architecture_ready`, and emits `done` event with `ready_for: ["architecture"]`
6. Frontend receives `done.ready_for`, calls `handleUnlock(["architecture"])` → ActionBar unlocks the **Generate Architecture** button

### 2. Architecture Generation (SSE)

1. User clicks **Generate Architecture** → `POST /api/v1/generate/architecture` (`{conversation_id}`)
2. `advisor.build_advisor_messages(history)` runs:
   a. Queries Neo4j graph (`AWS_Service -[:ALIGNS_WITH]-> WellArchitected_Pillar`, limit 20)
   b. Runs `VectorCypherRetriever.search()` (top-5, `all-MiniLM-L6-v2` embeddings) against `aws_document_chunks` index
   c. Emits SSE `rag` event with retrieval metadata (`hits`, `sources`)
   d. Builds `SystemMessage(ADVISOR_PROMPT.format(context=..., requirements=...))` + history
3. Backend streams raw JSON tokens from LLM (GPT-4o via OpenRouter)
4. On stream end, accumulated text is parsed: `ArchitecturePlan.model_validate_json(clean_text)`
5. Plan saved as artifact: `db.save_artifact(conv_id, "architecture", plan.model_dump_json())`
6. State → `architecture_ready`; SSE `done` emitted with `{summary, diagram, services, iac_snippet, cost_estimate}` and `ready_for: ["costs"]`
7. Frontend sets `artifacts.architecture`, unlocks **Generate Costs** button

### 3. Cost Estimation (SSE)

1. User clicks **Generate Costs** → `POST /api/v1/generate/costs`
2. Backend loads history + `architecture` artifact from SQLite
3. Builds messages: `SystemMessage(cost_system + arch_artifact)` + history + `HumanMessage("Generate detailed cost estimate")`
4. Streams Markdown tokens; on done saves to `db.save_artifact(conv_id, "costs", cost_text)`
5. State → `costs_ready`; SSE `done` with `ready_for: ["terraform"]`
6. Tokens stream live into the Costs tab as they arrive

### 4. Terraform Generation (SSE)

1. User clicks **Generate Terraform** → `POST /api/v1/generate/terraform`
2. Backend builds `[SystemMessage(TERRAFORM_FULL_PROMPT + arch_artifact), *history[-10:], HumanMessage("Generate config")]`
3. Streams HCL tokens; strips markdown fences via `_strip_json_fences()`
4. Saved to `db.save_artifact(conv_id, "terraform", clean_hcl)`
5. State → `terraform_ready`; SSE `done` with `{content, filename: "main.tf"}`
6. Frontend enables a download button for `main.tf`

### 5. Conversation Restore (Page Reload)

1. On mount, `App.tsx` reads `localStorage['aws_advisor_conv_id']` for last active conversation
2. Fetches `GET /api/v1/conversations` → populates sidebar with all sessions
3. Fetches `GET /api/v1/conversations/{id}/context` → restores `state` + all three artifacts
4. Button unlock state is recomputed from `state` value (e.g. `'terraform_ready'` → all three buttons unlocked)
5. Fetches `GET /api/v1/conversations/{id}/messages` → ChatBox rehydrates message history

---

## State Machine

The `conversations.state` column in SQLite drives the entire UI unlock flow:

| State | Meaning | Unlocked Buttons |
|---|---|---|
| `gathering` | Collecting requirements | None |
| `architecture_ready` | Ready signal received | Architecture |
| `presenting` | After architecture shown (legacy) | Architecture |
| `costs_ready` | Cost estimate generated | Architecture, Costs |
| `terraform_ready` | Terraform generated | Architecture, Costs, Terraform |
| `complete` | Plan approved via `/approve` | All |

State transitions happen in `backend/src/api/routes.py` via `db.set_state(conv_id, new_state)`.

---

## SSE Event Types

All SSE events are JSON serialized as `data: {...}\n\n`. Every event is additionally written to `/logs/debug.jsonl` with a `_ts` timestamp field (stripped before sending to client).

| Type | Shape | When |
|---|---|---|
| `token` | `{type, content}` | Each LLM output chunk |
| `debug` | `{type, event, ...}` | LLM call start/done, errors |
| `rag` | `{type, event, query, hits, sources}` | After vector retrieval |
| `done` | `{type, payload, ready_for?}` | Stream complete |
| `error` | `{type, message}` | Unhandled exceptions |
| `status` | `{type, content}` | Informational messages |

---

## State Management

| Layer | What | Where |
|---|---|---|
| SQLite | Conversation history, artifacts, state | `/app/data/advisor.db` via `backend/src/db/database.py` |
| Neo4j | AWS service graph, Well-Architected pillars, document chunks + embeddings | `bolt://neo4j:7687` |
| In-memory (backend) | `_terraform_cache: Dict[str,str]` keyed by `recommendation_id` | `backend/src/api/routes.py:53` |
| In-memory (backend) | `_retriever` singleton (VectorCypherRetriever) | `backend/src/core/advisor.py:18` |
| React state | `artifacts`, `unlockedButtons`, `staleButtons`, `sessions`, `activeConvId`, `debugEvents` | `frontend/src/App.tsx` |
| localStorage | `aws_advisor_conv_id` (last active session), `debugDrawerOpen` (drawer open state) | Browser |

---

## Error Handling

**Strategy:** Never crash the SSE stream. All `generate/*` generators and `chat/stream` wrap the entire body in `try/except Exception` and yield `{"type":"error","message":"..."}` before returning.

**Structured output failures:** `ArchitectureAdvisor.get_recommendation()` retries once with a corrective prompt. If parsing still fails it raises `StructuredOutputError`, which `routes.py` catches and returns a `ChatResponse` with `error` field set.

**Terraform validation:** `_validate_terraform()` returns `(None, [])` when Terraform CLI is absent — never raises, graceful fallback.

**Neo4j cold start:** `_get_vector_context()` catches all exceptions and returns `{"text": "", "meta": {..., "error": str(e)}}` — RAG silently degrades to graph-only context.

---

## Cross-Cutting Concerns

**Logging:** All SSE events logged as JSON-lines to `/logs/debug.jsonl` via Python `logging.FileHandler`. Controlled by `_log_event()` in `backend/src/api/routes.py:38`.

**CORS:** Configured in `backend/src/main.py` from `ALLOWED_ORIGINS` env var (default `"*"`).

**DB initialization:** `init_db()` and Neo4j schema setup run in FastAPI `lifespan()` context in `backend/src/main.py:13`.

**Conversation compaction:** `POST /api/v1/chat/{conv_id}/compact` summarizes history into a single `SystemMessage` via `COMPACT_PROMPT`, replacing all prior messages in SQLite. Prevents context-window overflow.

---

*Architecture analysis: 2025-01-31*

## Pattern Overview

**Overall:** GraphRAG-Augmented LLM Pipeline with REST API

The system is an AI-powered AWS Architecture Advisor. Users describe workloads in natural language; the backend orchestrates a multi-step LLM pipeline enriched with a Neo4j graph knowledge base (GraphRAG) to produce architecture recommendations, IaC snippets, and cost estimates.

**Key Characteristics:**
- LangChain-based LLM orchestration via OpenRouter (OpenAI-compatible endpoint)
- Neo4j graph database as the RAG knowledge store (nodes: AWS services, Well-Architected pillars, arch patterns)
- Sequential pipeline: extract requirements → graph query + vector retrieval → LLM advice → extract diagram/IaC/costs
- REST API (FastAPI) consumed by a React SPA; frontend proxies API calls via Vite dev server
- Three Docker services: `neo4j`, `backend`, `frontend`

## Layers

**API Layer:**
- Purpose: Accept HTTP requests, validate input, compose responses
- Location: `backend/src/api/`
- Contains: FastAPI routers (`routes.py` for chat, `knowledge.py` for KB management)
- Depends on: Core layer (orchestrator classes), Services layer
- Used by: Frontend SPA over HTTP

**Core / Orchestration Layer:**
- Purpose: Implement the multi-step advisory pipeline
- Location: `backend/src/core/`
- Contains:
  - `extractor.py` — LLM-based NL requirement extractor (`RequirementExtractor`)
  - `advisor.py` — GraphRAG + LLM recommendation engine (`ArchitectureAdvisor`)
  - `diagrammer.py` — Mermaid.js extraction from LLM output (`DiagramGenerator`)
  - `cost_analyzer.py` — Resource extraction + AWS Pricing API lookup (`CostAnalyzer`)
  - `tradeoff_analyzer.py` — Standalone trade-off LLM analysis (`TradeoffAnalyzer`)
  - `prompts.py` — All LangChain `PromptTemplate` definitions
  - `iac/terraform.py` — Terraform HCL generator (`TerraformGenerator`)
  - `iac/cloudformation.py` — CloudFormation YAML generator (`CloudFormationGenerator`)
- Depends on: Services layer, LLM (OpenRouter), Neo4j graph
- Used by: API layer

**Services Layer:**
- Purpose: External system adapters (Neo4j DB, AWS Pricing API)
- Location: `backend/src/services/`
- Contains:
  - `knowledge_base.py` — Neo4j schema initialization and CRUD (`KnowledgeBaseService`)
  - `pricing.py` — AWS Pricing API client with file-based cache (`PricingService`)
- Depends on: Neo4j driver, boto3 (AWS SDK)
- Used by: Core layer

**Models Layer:**
- Purpose: Data schema definitions (SQLAlchemy ORM, Pydantic)
- Location: `backend/src/models/`
- Contains: `workload.py` — SQLAlchemy models for `Workload`, `Recommendation`, `IaCSnippet`, `CostProfile`
- Note: SQLAlchemy models are defined but PostgreSQL is not wired in docker-compose; these serve as the intended persistence schema (currently not persisted to RDBMS in the running system)

**Frontend Layer:**
- Purpose: React SPA presenting the chat interface and knowledge base management
- Location: `frontend/src/`
- Contains: `App.tsx` (router), `components/` (display widgets), `pages/` (full page views)
- Depends on: Backend REST API (`/api/v1/...`)
- Used by: End user via browser

## Data Flow

**Primary: Architecture Advisory Request**

1. User sends plain-English workload description via `POST /api/v1/chat`
2. `routes.py` calls `RequirementExtractor.extract(message)` → LLM parses text into structured JSON (`traffic_pattern`, `data_residency`, `user_count`, `budget`, `high_availability`)
3. `ArchitectureAdvisor.get_recommendation(requirements)` executes a Cypher query against Neo4j to retrieve AWS services aligned with Well-Architected pillars (graph context)
4. Advisor formats context + requirements into `ADVISOR_PROMPT` and invokes LLM (GPT-4o via OpenRouter)
5. LLM response (natural language + embedded Mermaid block) returned as `advice`
6. `DiagramGenerator.extract_mermaid(advice_text)` parses the Mermaid diagram from the LLM response
7. `TerraformGenerator.generate(advice_text)` and `CloudFormationGenerator.generate(advice_text)` each call LLM with `IAC_PROMPT` to produce HCL/YAML snippets
8. `CostAnalyzer.estimate_costs(advice_text)` calls LLM to identify billable resources, then queries `PricingService` for EC2 On-Demand prices (cached to `data/cache/pricing/`)
9. All results are assembled into `ChatResponse` and returned as JSON

**Secondary: Knowledge Base Document Upload**

1. User selects file and calls `POST /api/v1/knowledge/upload`
2. `knowledge.py` saves file to `data/uploads/`
3. A `BackgroundTask` calls `index_document(doc_id, file_path)` — currently a stub (TODO: real PDF parsing + Neo4j vector indexing)
4. Status polling available via `GET /api/v1/knowledge/status/{document_id}` (currently returns mock "indexed")

**State Management (Frontend):**
- Local React `useState` in `ChatBox.tsx` — message history stored in-memory (no persistence)
- No global state library; single-page with two views toggled via `useState<'chat' | 'knowledge'>`

## Key Abstractions

**LangChain `PromptTemplate`:**
- Purpose: Centralized prompt definitions
- Location: `backend/src/core/prompts.py`
- Three prompts: `EXTRACTION_PROMPT`, `ADVISOR_PROMPT`, `IAC_PROMPT`
- Each LLM-calling class loads prompts from this module

**Neo4j GraphRAG Schema:**
- Purpose: Graph knowledge store for AWS services and Well-Architected relationships
- Nodes: `AWS_Service`, `WellArchitected_Pillar`, `Arch_Pattern`, `Document_Chunk`, `Feature`
- Relationships: `ALIGNS_WITH`, `HAS_FEATURE`, `USES_SERVICE`, `DESCRIBES`, `PART_OF`
- Vector index: `aws_document_chunks` (1536 dims, cosine similarity) for future RAG over ingested PDFs
- Schema initialized at startup via `KnowledgeBaseService.initialize_schema()`

**`ChatResponse` Pydantic Model:**
- Purpose: Contract between backend pipeline and frontend
- Fields: `recommendation_id`, `text`, `diagram`, `iac` (list of `{type, content}`), `costs` (`{total, breakdown}`)
- Defined in: `backend/src/api/routes.py`

## Entry Points

**Backend:**
- Location: `backend/src/main.py`
- Triggers: `uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload`
- Responsibilities: App creation, CORS middleware, router mounting (`/api/v1/chat`, `/api/v1/knowledge`), KB schema initialization on startup

**Frontend:**
- Location: `frontend/src/main.tsx` (Vite entry), `frontend/index.html`
- Triggers: `npm run dev -- --host` (Vite dev server, port 5173 mapped to host 3000)
- Root component: `frontend/src/App.tsx`

## API Design

All routes prefixed with `/api/v1`:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/chat` | Submit workload description, receive full recommendation |
| POST | `/api/v1/knowledge/upload` | Upload document for RAG indexing |
| GET | `/api/v1/knowledge/status/{doc_id}` | Poll indexing status |
| GET | `/health` | Liveness check |

The frontend calls `/api/v1/...` without a host prefix — relies on a reverse proxy or same-origin assumption (Vite proxy not configured; direct container networking assumed in Docker compose).

## Error Handling

**Strategy:** Try/except per class; fallback to safe defaults

**Patterns:**
- `RequirementExtractor.extract()` — returns default JSON object on any exception
- `ArchitectureAdvisor.get_recommendation()` — returns `"I encountered an error..."` string
- `CostAnalyzer.estimate_costs()` — returns `{"total": 0.0, "breakdown": []}` on failure
- `TerraformGenerator.generate()` / `CloudFormationGenerator.generate()` — return error comment string
- `TradeoffAnalyzer.analyze()` — returns `"Trade-off analysis unavailable."`
- No HTTP error responses beyond unhandled 500s; no structured error response model

## Cross-Cutting Concerns

**Logging:** `print()` statements with `[ClassName]` prefixes throughout (e.g., `[Advisor]`, `[CostAnalyzer]`). No structured logging framework.

**Validation:** Pydantic via FastAPI for request/response models. No input sanitization beyond JSON parsing.

**Authentication:** None. CORS set to `allow_origins=["*"]`. No API key protection on endpoints.

**Caching:** File-based pricing cache in `data/cache/pricing/` (keyed by service + filter hash). Neo4j query results are not cached.

**Persistence:** SQLAlchemy models defined (`backend/src/models/workload.py`) but not connected to any database at runtime — no PostgreSQL in docker-compose. Recommendations are not persisted; `recommendation_id` is hardcoded `"mock-uuid"`.

## Deployment Model

Three Docker containers defined in `docker-compose.yml`:

```
neo4j:7687 (Bolt) / :7474 (HTTP Browser)
    ↑ depends_on
backend:8000  ←── LLM_API_KEY, NEO4J_URI, NEO4J_PASSWORD
    ↑ depends_on
frontend:5173 (→ host:3000)
```

- Backend volume-mounts `./backend:/app` (live reload in dev)
- Frontend volume-mounts `./frontend:/app` (live reload in dev)
- Pricing cache and uploads stored under `./data/` (not in compose volumes)
- LLM calls go to OpenRouter (`https://openrouter.ai/api/v1`) with `LLM_API_KEY` env var

---

*Architecture analysis: 2025-01-14*

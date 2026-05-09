# Architecture

**Analysis Date:** 2025-01-14

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

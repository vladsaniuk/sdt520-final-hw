# Roadmap: AWS Architecture Advisor

## Overview

A five-phase brownfield completion. The scaffold (FastAPI + React + Neo4j + Docker Compose) exists but is hollow — chat returns mocked data, ingestion is a stub, and the frontend won't compile clean. Every phase is gated by the one before it: fix the broken foundation first, then seed the graph and wire the document ingestion pipeline (merged — both populate Neo4j before the chat advisor uses it), wire real conversation history, deliver the Terraform download, and polish the Docker experience until `docker compose up` produces a working demo.

## Phases

- [ ] **Phase 1: Baseline Fixes** - Repair broken foundation so the app starts, compiles, and makes a real LLM call
- [x] **Phase 2: Graph Seeding & Document Ingestion** - Seed Neo4j with structural AWS knowledge, wire the full document ingestion pipeline, and add the upload UI — so GraphRAG has real data before chat is wired
- [x] **Phase 3: Multi-Turn Chat** - Wire conversation history and structured output for real iterative architecture refinement (completed 2026-05-09)
- [ ] **Phase 4: Terraform Download** - Deliver the core artifact: a downloadable, valid Terraform config from an approved plan
- [ ] **Phase 5: Docker Polish** - End-to-end validation that `docker compose up` produces a working demo with zero manual steps

## Phase Details

### Phase 1: Baseline Fixes
**Goal**: The scaffolding is stable — app starts cleanly, compiles without errors, and makes a real (non-mocked) single-turn LLM call
**Depends on**: Nothing (first phase)
**Requirements**: BUG-01, BUG-02, BUG-03, BUG-04, BUG-05, BUG-06, BUG-07
**Success Criteria** (what must be TRUE):
  1. `docker compose up` starts all three containers cleanly with no crash-loop or unhandled errors
  2. Frontend compiles without TypeScript errors and Mermaid diagrams render correctly in the browser
  3. A chat message reaches the LLM and returns a real architecture response — `recommendation_id` is a UUID, not `"mock-uuid"`
  4. No SQLAlchemy models, psycopg2-binary, or dead PostgreSQL code remains in the codebase
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — Backend fixes: imports, lifespan, CORS, dead code, mock-uuid (BUG-02, BUG-03, BUG-06, BUG-07)
- [ ] 01-02-PLAN.md — Infra + frontend: Neo4j healthcheck, CostTable type, Mermaid v10+ (BUG-01, BUG-04, BUG-05)

### Phase 2: Graph Seeding & Document Ingestion
**Goal**: Neo4j is populated with structural AWS knowledge AND the document ingestion pipeline is wired — so GraphRAG has real data (both seeded and user-uploaded) before the chat advisor uses it
**Depends on**: Phase 1
**Requirements**: GRAPH-01, GRAPH-02, GRAPH-03, GRAPH-04, INGEST-01, INGEST-02, INGEST-03, INGEST-04, INGEST-05
**Success Criteria** (what must be TRUE):
  1. On fresh startup, Neo4j contains ≥12 AWS service nodes linked to Well-Architected pillar nodes
  2. Architecture patterns (microservices, serverless, event-driven, three-tier) exist as graph nodes with component relationships
  3. The advisor's Cypher query returns ≥5 grounded service recommendations — no empty result sets on cold start
  4. Schema (vector index + uniqueness constraints) is fully initialized before the seed runs
  5. User can upload PDF, markdown, and plain text files via the UI and receive accurate progress status (not a hardcoded stub)
  6. Uploaded documents are chunked, embedded, and stored as `Document_Chunk` nodes in Neo4j — retrievable via vector search
  7. Advisor recommendations visibly reference content from user-uploaded documents (GraphRAG is active, not hallucinated)
  8. Embeddings API decision is resolved and implemented — ingestion does not silently fall back or error on first run
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md — Schema fix (384-dim index + Architecture_Pattern constraint) + seed service + POST /api/v1/seed
- [x] 02-02-PLAN.md — Document ingestion pipeline (parse/chunk/embed/store) + WebSocket progress backend
- [x] 02-03-PLAN.md — Vite proxy + KnowledgeBase.tsx live progress bar + VectorCypherRetriever wired into advisor

### Phase 02.1: UI Polish & Visual Design (INSERTED)

**Goal:** Make the existing UI look professional and polished — AWS-branded components (MermaidViewer, CodeSnippet, CostTable), welcome screen with prompt chips, Geist font, and inline error handling
**Requirements**: UI-01, BUG-04 (already fixed), BUG-05 (already fixed)
**Depends on:** Phase 2
**Plans:** 3/3 plans complete

Plans:
- [x] 02.1-01-PLAN.md — Font integration: install @fontsource/geist + @fontsource/geist-mono, wire globally in main.tsx + index.css + mermaid.css (Wave 1)
- [x] 02.1-02-PLAN.md — MermaidViewer restyle (dark header) + CodeSnippet restyle (copy state, Geist Mono) (Wave 2, parallel)
- [x] 02.1-03-PLAN.md — CostTable restyle (striped rows, dark header) + ChatBox overhaul (welcome screen, error banner, panel cleanup) (Wave 2, parallel)

### Phase 3: Multi-Turn Chat
**Goal**: Users can hold iterative conversations where follow-up messages refine the architecture plan in context — this is the core UX value loop
**Depends on**: Phase 2
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, CHAT-06
**Success Criteria** (what must be TRUE):
  1. A follow-up message ("use ECS instead of EKS", "make it cheaper") produces a contextually grounded refinement, not a fresh generic plan
  2. Each plan response includes all four components: Mermaid architecture diagram, service breakdown, IaC snippet preview, and cost estimate
  3. LLM calls are non-blocking — multiple simultaneous requests do not stall the event loop or trigger Docker health restarts
  4. Conversation history persists across multiple turns within a session; the server assigns a `conversation_id` if none is provided
**Plans**: 4 plans

Plans:
- [x] 03-01-PLAN.md — Backend: Pydantic models (ArchitecturePlan) + async advisor with structured output + retry (Wave 1)
- [x] 03-02-PLAN.md — Backend: Routes — conversation history dict, updated chat handler, compact/clear endpoints (Wave 1)
- [x] 03-03-PLAN.md — Frontend: ChatBox — conversation wiring, localStorage, context fill bar, warning banner, diff badges, error bubble (Wave 2)
- [x] 03-04-PLAN.md — Frontend: App.tsx — real session list, sidebar Compact/Clear controls, ChatBox ref wiring (Wave 3)

### Phase 4: Terraform Download
**Goal**: Users can approve a plan and download a valid, deployment-ready Terraform HCL configuration — the core deliverable of the project
**Depends on**: Phase 3
**Requirements**: TERRAFORM-01, TERRAFORM-02, TERRAFORM-03, TERRAFORM-04
**Success Criteria** (what must be TRUE):
  1. User can trigger plan approval (via UI button) and the app generates a full Terraform HCL config for the recommended architecture
  2. The generated `.tf` file is downloadable directly from the chat UI
  3. The generated Terraform config passes structural validation — no syntax errors, valid provider blocks
  4. Each approved plan produces a unique persisted `.tf` file tied to its `recommendation_id`
**Plans**: 2 plans

Plans:
- [ ] 04-01-PLAN.md — Backend: TERRAFORM_FULL_PROMPT + approve endpoint + HCL generation + terraform validate + Dockerfile CLI install (TERRAFORM-02, TERRAFORM-04)
- [ ] 04-02-PLAN.md — Frontend: ChatBox approval state + Approve button + status bubble + Download .tf Blob handler (TERRAFORM-01, TERRAFORM-03)

### Phase 5: Docker Polish
**Goal**: The entire application runs from `docker compose up` with no manual setup steps — demo-ready for zero-configuration evaluation
**Depends on**: Phase 4
**Requirements**: DOCKER-01, DOCKER-02, DOCKER-03
**Success Criteria** (what must be TRUE):
  1. `docker compose up` + a populated `.env` file produces a fully working demo with zero additional steps
  2. All required environment variables are documented in `.env.example` with clear descriptions
  3. The backend `/health` endpoint responds correctly and Docker Compose healthchecks use it to gate service startup
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Baseline Fixes | 0/? | Not started | - |
| 2. Graph Seeding & Document Ingestion | 0/? | Not started | - |
| 3. Multi-Turn Chat | 4/4 | Complete   | 2026-05-09 |
| 4. Terraform Download | 0/? | Not started | - |
| 5. Docker Polish | 0/? | Not started | - |

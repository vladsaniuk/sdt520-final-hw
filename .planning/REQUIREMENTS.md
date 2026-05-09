# Requirements — AWS Architecture Advisor

## v1 Requirements

### BUG — Baseline Fixes
- [ ] **BUG-01**: Backend starts before Neo4j is ready — Docker Compose `depends_on` must use healthcheck
- [ ] **BUG-02**: `initialize_schema()` (vector index + constraints) is never called on startup
- [ ] **BUG-03**: `import json` placed at bottom of `advisor.py` and `cost_analyzer.py` — causes runtime crash
- [ ] **BUG-04**: TypeScript `is_calculated: bool` must be `boolean` in `CostTable.tsx`
- [ ] **BUG-05**: `mermaid.contentLoaded()` removed in v10+ — replace with `mermaid.run()`
- [ ] **BUG-06**: CORS wildcard `allow_origins=["*"]` must be configurable via env var
- [ ] **BUG-07**: Dead code removed — SQLAlchemy models, psycopg2-binary, unused langchain-community Neo4j imports

### GRAPH — Knowledge Graph Seeding
- [ ] **GRAPH-01**: Neo4j seeded with AWS core services (EC2, S3, RDS, Lambda, VPC, ELB, CloudFront, SQS, SNS, ECS, EKS, DynamoDB) as graph nodes with properties
- [ ] **GRAPH-02**: Well-Architected Framework 6 pillars seeded as graph nodes with relationships to relevant services
- [ ] **GRAPH-03**: Architecture patterns (microservices, serverless, event-driven, three-tier) seeded with component relationships
- [ ] **GRAPH-04**: Graph schema fully initialized (uniqueness constraints + 1536-dim vector index) before seed runs

### CHAT — Multi-Turn Conversation
- [ ] **CHAT-01**: User can send a message and receive an architecture plan response (end-to-end, non-stub)
- [ ] **CHAT-02**: Conversation history is tracked per `conversation_id` — follow-up messages refine the previous plan
- [ ] **CHAT-03**: All LLM calls use async (`ainvoke`/`astream`) — no blocking sync `.invoke()` in async handlers
- [ ] **CHAT-04**: Recommendation ID is a real UUID (not `"mock-uuid"`)
- [ ] **CHAT-05**: LLM output parsed with structured output (Pydantic) — no brittle regex/string-split parsing
- [ ] **CHAT-06**: Plan response includes: architecture diagram (Mermaid), service breakdown text, IaC snippet preview, cost estimate

### INGEST — Document Ingestion Pipeline
- [ ] **INGEST-01**: User can upload PDF, markdown, and plain text files via the UI
- [ ] **INGEST-02**: Uploaded documents are parsed, chunked, embedded, and stored as `Document_Chunk` nodes in Neo4j
- [ ] **INGEST-03**: Ingestion status is accurately reported (not a hardcoded stub)
- [ ] **INGEST-04**: Vector retrieval (`VectorCypherRetriever`) is wired into the advisor pipeline — GraphRAG uses uploaded docs
- [ ] **INGEST-05**: Embeddings API decision resolved and implemented (OpenAI direct or local sentence-transformers)

### TERRAFORM — Plan Approval + IaC Download
- [ ] **TERRAFORM-01**: User can approve a plan in the chat (via "Approve" button or recognized message)
- [ ] **TERRAFORM-02**: On approval, full Terraform HCL config is generated for the recommended architecture
- [ ] **TERRAFORM-03**: Generated `.tf` file is downloadable from the chat UI
- [ ] **TERRAFORM-04**: Terraform config is valid (passes `terraform validate` or equivalent structure check)

### DOCKER — End-to-End Docker Compose
- [ ] **DOCKER-01**: `docker compose up` brings up a fully functional demo with no manual setup steps
- [ ] **DOCKER-02**: All environment variables documented in `.env.example` with descriptions
- [ ] **DOCKER-03**: Backend exposes a `/health` endpoint; Compose healthchecks use it

## v2 Requirements (Deferred)

- Streaming (SSE) chat responses — UX polish, not functional blocker
- GCP / Azure Terraform output — multi-cloud milestone
- Pre-seeded AWS Well-Architected docs (currently user uploads own docs)
- Authentication / user accounts
- Conversation persistence across container restarts (currently in-memory)

## Out of Scope

- Authentication — demo tool, no auth needed
- GCP / Azure support — future milestone; AWS only for v1
- PostgreSQL / relational persistence — Neo4j is the sole store; SQLAlchemy models removed
- CloudFormation output — Terraform is the v1 IaC target
- Pre-seeded knowledge base — user uploads their own docs

## Traceability

| REQ-ID | Phase |
|--------|-------|
| BUG-01 – BUG-07 | Phase 1 |
| GRAPH-01 – GRAPH-04 | Phase 2 |
| CHAT-01 – CHAT-06 | Phase 3 |
| INGEST-01 – INGEST-05 | Phase 4 |
| TERRAFORM-01 – TERRAFORM-04 | Phase 5 |
| DOCKER-01 – DOCKER-03 | Phase 6 |

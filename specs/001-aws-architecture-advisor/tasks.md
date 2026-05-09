---
description: "Task list for AWS Architecture Advisor implementation"
---

# Tasks: AWS Architecture Advisor

**Input**: Design documents from `/Users/vladsanyuk/Documents/aws-architecture-advisor/specs/001-aws-architecture-advisor/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-spec.md

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and local development stack

- [x] T001 Create project structure (backend/, frontend/, data/)
- [x] T002 [P] Initialize FastAPI project in backend/ with dependencies (langchain, neo4j, boto3) in backend/requirements.txt
- [x] T003 [P] Initialize React project in frontend/ with Vite and Tailwind CSS
- [x] T004 Create docker-compose.yml with backend, frontend, and neo4j services at repository root
- [x] T005 [P] Configure backend linting (ruff/black) and frontend linting (eslint/prettier)
- [x] T006 [P] Setup environment variable management (.env.example with LLM_API_KEY)

**Checkpoint**: Phase 1: Setup complete

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core logic, database schema, and evaluation framework

- [x] T007 [P] Implement SQLAlchemy models in backend/src/models/workload.py (Workload, Recommendation, IaCSnippet, CostProfile)
- [x] T008 [P] Initialize Neo4j schema and vector index in backend/src/services/knowledge_base.py using neo4j-graphrag
- [x] T009 Implement Boto3 Pricing API client with local caching in backend/src/services/pricing.py
- [x] T010 Setup DeepEval framework with 5 core metrics in backend/tests/evals/test_rag_evals.py (Faithfulness, Relevancy, Recall, etc.)
- [x] T011 [P] Implement base RAG prompt templates using AWS Well-Architected Framework patterns in backend/src/core/prompts.py

**Checkpoint**: Foundation ready - core services and infra are functional

---

## Phase 3: User Story 1 - Workload Description & Recommendation (Priority: P1) 🎯 MVP

**Goal**: Interpret natural language workloads and suggest architectures

**Independent Test**: API returns a valid service list and Mermaid diagram for "Standard 3-tier web app"

### Implementation for User Story 1

- [x] T012 [P] [US1] Create Workload requirement extraction service (Traffic, Residency, Budget) in backend/src/core/extractor.py
- [x] T013 [US1] Implement GraphRAG recommendation engine in backend/src/core/advisor.py (Neo4j + OpenRouter)
- [x] T014 [P] [US1] Implement Mermaid.js diagram generator in backend/src/core/diagrammer.py
- [x] T015 [US1] Implement POST /api/v1/chat endpoint in backend/src/api/routes.py
- [x] T016 [P] [US1] Create basic Chat UI component in frontend/src/components/Chat/ChatBox.tsx
- [x] T017 [US1] Integrate diagram viewer in frontend/src/components/Diagram/MermaidViewer.tsx

**Checkpoint**: User Story 1 functional - basic chat and diagrams work

---

## Phase 4: User Story 2 - IaC Snippet Generation (Priority: P2)

**Goal**: Provide ready-to-use Terraform and CloudFormation code

**Independent Test**: Verify generated HCL/YAML snippets pass `tflint` or `cfn-lint`

### Implementation for User Story 2

- [x] T018 [US2] Implement Terraform template generator in backend/src/core/iac/terraform.py
- [x] T019 [US2] Implement CloudFormation template generator in backend/src/core/iac/cloudformation.py
- [x] T020 [P] [US2] Create CodeSnippet component with syntax highlighting in frontend/src/components/Code/Snippet.tsx
- [x] T021 [US2] Integrate IaC display into the chat response view in frontend/src/components/Chat/Message.tsx

---

## Phase 5: User Story 3 - Cost Estimation & Trade-offs (Priority: P3)

**Goal**: Show monthly estimates and service comparisons

**Independent Test**: Verify cost table matches manual SAA pricing for t3.micro instances

### Implementation for User Story 3

- [x] T022 [US3] Implement monthly cost calculator (Compute/Storage) in backend/src/core/cost_analyzer.py
- [x] T023 [US3] Implement trade-off analysis logic (e.g. RDS vs Aurora) in backend/src/core/tradeoff_analyzer.py
- [x] T024 [P] [US3] Create CostTable component in frontend/src/components/Cost/CostTable.tsx
- [x] T025 [P] [US3] Create TradeOffView component in frontend/src/components/Tradeoff/Comparison.tsx
- [x] T026 [US3] Integrate cost and trade-off data into API response and Frontend UI

---

## Phase 6: Knowledge Base & RAG Management

**Purpose**: Upload and index AWS documentation

- [x] T027 [US6] Implement POST /api/v1/knowledge/upload with background indexing task in backend/src/api/knowledge.py
- [x] T028 [US6] Implement GET /api/v1/knowledge/status endpoint in backend/src/api/knowledge.py
- [x] T029 [P] [US6] Create KnowledgeBase management page in frontend/src/pages/KnowledgeBase.tsx
- [x] T030 [US6] Add document ingestion pipeline for AWS Well-Architected Framework PDFs in backend/src/services/ingestor.py

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Quality assurance and final refinements

- [x] T031 [P] Perform final RAG evals with DeepEval and document results in backend/tests/evals/results.md
- [x] T032 Refine Mermaid.js styles for better visual clarity in frontend/src/styles/mermaid.css
- [x] T033 [P] Update quickstart.md with real local setup examples and screenshots
- [x] T034 [P] Add final unit tests for core advisor logic in backend/tests/unit/test_advisor.py

**Checkpoint**: Implementation Complete

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Must complete T004 (Docker) before backend/frontend work
- **Foundational (Phase 2)**: Must complete T008 (Neo4j) before RAG work
- **User Story 1 (P1)**: BLOCKS Phase 4 and Phase 5
- **User Story 2 (P2)**: Depends on Phase 3
- **User Story 3 (P3)**: Depends on Phase 3 and Phase 2 (Pricing)

### Parallel Opportunities

- Frontend and Backend setup (T002, T003)
- Models and Neo4j schema (T007, T008)
- UI component development (T016, T017, T020, T024, T025)
- Document ingestion and core advisor logic (Phase 6 vs Phase 3)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (Neo4j + Extraction)
3. Complete Phase 3: User Story 1 (interpreted chat with diagrams)
4. **STOP and VALIDATE**: Run "Standard Web App" test

### Incremental Delivery

1. Add IaC Generation (Phase 4)
2. Add Cost Analysis (Phase 5)
3. Add Knowledge Base Uploads (Phase 6)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Use OpenRouter (OpenAI-compatible) for all LLM calls
- Neo4j GraphRAG requires relationship-aware retrieval logic

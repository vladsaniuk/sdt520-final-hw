# Directory Structure

**Analysis Date:** 2025-01-31

---

## Backend

```
backend/
├── Dockerfile                        # Python 3.13-slim; uvicorn entrypoint
├── pyproject.toml                    # Ruff + Black config
├── requirements.txt                  # Python runtime dependencies
├── data/                             # SQLite volume mount (runtime, not committed)
│   └── advisor.db                    # SQLite database (conversations, messages, artifacts)
├── tests/
│   ├── unit/
│   │   └── test_advisor.py           # Unit tests for ArchitectureAdvisor
│   └── evals/
│       ├── test_rag_evals.py         # RAG quality evals (deepeval)
│       └── results.md                # Evaluation results log
└── src/
    ├── main.py                       # FastAPI app factory; lifespan hook (init_db + KB schema)
    ├── api/
    │   ├── routes.py                 # ALL primary endpoints (see below)
    │   ├── knowledge.py              # POST/GET /api/v1/knowledge/* (file upload, status)
    │   └── seed.py                   # POST /api/v1/seed (seed Neo4j with sample data)
    ├── core/
    │   ├── advisor.py                # ArchitectureAdvisor — GraphRAG + LLM pipeline
    │   ├── models.py                 # Pydantic schemas: ArchitecturePlan, CostEstimate, ServiceCost
    │   ├── prompts.py                # All prompt templates: GATHER_PROMPT, ADVISOR_PROMPT,
    │   │                             #   FOLLOWUP_PROMPT, TERRAFORM_FULL_PROMPT, COMPACT_PROMPT
    │   ├── extractor.py              # RequirementExtractor (NL → JSON requirements dict)
    │   ├── cost_analyzer.py          # CostAnalyzer (LLM + Pricing API)
    │   ├── diagrammer.py             # DiagramGenerator (Mermaid extractor)
    │   ├── tradeoff_analyzer.py      # TradeoffAnalyzer (LLM)
    │   └── iac/
    │       ├── terraform.py          # TerraformGenerator (HCL, sync — legacy)
    │       └── cloudformation.py     # CloudFormationGenerator (YAML, legacy)
    ├── db/
    │   └── database.py               # SQLite helpers: init_db, save_message, get_history,
    │                                 #   save_artifact, get_artifact, list_conversations,
    │                                 #   set_state, get_state, delete_conversation
    ├── models/
    │   └── workload.py               # SQLAlchemy ORM schema (not wired at runtime; docs only)
    └── services/
        ├── knowledge_base.py         # KnowledgeBaseService: Neo4j schema init, CRUD
        ├── ingestion.py              # Document ingestion pipeline (chunk + embed → Neo4j)
        ├── pricing.py                # PricingService (AWS Pricing API + file cache)
        └── seed.py                   # Seed data loader
```

### `backend/src/api/routes.py` — Endpoint Reference

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/conversations` | List all conversations (sidebar restore) |
| DELETE | `/api/v1/conversations/{conv_id}` | Delete conversation + all messages/artifacts |
| GET | `/api/v1/conversations/{conv_id}/messages` | Return messages for chat restore |
| GET | `/api/v1/conversations/{conv_id}/context` | Return state + artifacts for button restore |
| POST | `/api/v1/chat/stream` | SSE streaming gathering/followup chat |
| POST | `/api/v1/chat` | Non-streaming full architecture (legacy) |
| POST | `/api/v1/chat/{conv_id}/compact` | Summarize history into single SystemMessage |
| POST | `/api/v1/chat/{conv_id}/clear` | Wipe conversation history |
| POST | `/api/v1/chat/{conv_id}/approve` | Generate + validate full Terraform HCL |
| POST | `/api/v1/generate/architecture` | SSE: stream ArchitecturePlan JSON |
| POST | `/api/v1/generate/costs` | SSE: stream Markdown cost estimate |
| POST | `/api/v1/generate/terraform` | SSE: stream HCL Terraform config |
| GET | `/api/v1/debug/info` | System snapshot (Neo4j, SQLite, model, prompts) |

### `backend/src/core/models.py` — Core Pydantic Schemas

```python
ServiceDetail(name, description, rationale)
ServiceCost(service, cost: float, is_calculated: bool)   # coerces str cost values
CostEstimate(total: float, breakdown: List[ServiceCost]) # normalizes alt field names
ArchitecturePlan(summary, diagram, services, iac_snippet, cost_estimate)
StructuredOutputError(Exception)
```

### `backend/src/db/database.py` — SQLite Schema

```sql
conversations (id TEXT PK, state TEXT DEFAULT 'gathering', created_at INTEGER, updated_at INTEGER)
messages (id AUTOINCREMENT, conversation_id TEXT FK, role TEXT, content TEXT, created_at INTEGER)
artifacts (id AUTOINCREMENT, conversation_id TEXT FK, artifact_type TEXT, content TEXT, created_at INTEGER)
```
- `artifact_type` values: `"architecture"` (JSON), `"costs"` (Markdown), `"terraform"` (HCL)
- DB path: `/app/data/advisor.db` (mounted from `sqlite_data` Docker volume)

---

## Frontend

```
frontend/
├── Dockerfile                        # Node 22-slim; Vite dev server on :5173
├── index.html                        # Vite HTML entry point
├── package.json                      # NPM dependencies (React, Chakra UI, Mermaid, etc.)
├── vite.config.ts                    # Vite config (proxy /api → backend:8000)
├── tsconfig.json                     # TypeScript config
├── tailwind.config.js                # Tailwind CSS theme (if used alongside Chakra)
├── eslint.config.js                  # ESLint config
└── src/
    ├── main.tsx                      # React DOM root mount; ChakraProvider wrapper
    ├── App.tsx                       # Root component — ALL top-level state (see below)
    ├── App.css                       # App-level styles
    ├── index.css                     # Global styles
    ├── theme.ts                      # Chakra UI theme customization (aws.orange, aws.squid colors)
    ├── assets/                       # Static imports (images, SVGs)
    ├── components/
    │   ├── ActionBar.tsx             # Generate Architecture/Costs/Terraform buttons
    │   │                             #   Props: unlockedButtons, staleButtons, loadingButton, onGenerate
    │   ├── ArtifactDrawer.tsx        # Right-side drawer with 4 tabs:
    │   │                             #   Architecture (diagram + services), Costs (Markdown),
    │   │                             #   Terraform (HCL + download), Debug (SSE event log)
    │   ├── Chat/
    │   │   └── ChatBox.tsx           # Chat input + message thread; SSE stream reader for /chat/stream
    │   │                             #   Exposes ChatBoxHandle ref: { compact(), clear(), hasMessages() }
    │   ├── Code/                     # Syntax-highlighted code block
    │   ├── Cost/                     # Monthly cost breakdown table
    │   ├── Diagram/
    │   │   └── MermaidViewer.tsx     # Renders Mermaid.js diagrams from plan.diagram string
    │   ├── Drawer/
    │   │   └── DebugTab.tsx          # Debug tab: SSE event log + system info
    │   │                             #   Types: DebugEvent { timestamp, type, payload }, DebugInfo
    │   └── Tradeoff/                 # Trade-off analysis display
    ├── pages/
    │   └── KnowledgeBase.tsx         # Full-page Knowledge Base upload/management
    └── styles/                       # Additional style files
```

### `frontend/src/App.tsx` — State Inventory

All application-level state lives in `App.tsx`. Components receive state via props or refs.

| State | Type | Purpose |
|---|---|---|
| `page` | `'chat' \| 'knowledge'` | Active page route |
| `sessions` | `Session[]` | Sidebar conversation list |
| `activeConvId` | `string \| undefined` | Currently selected conversation |
| `unlockedButtons` | `GenerateType[]` | Which generate buttons are active |
| `staleButtons` | `GenerateType[]` | Buttons needing re-generation (pulsing) |
| `loadingButton` | `GenerateType \| null` | Button showing spinner |
| `drawerOpen` | `boolean` | Right drawer visibility (persisted to localStorage) |
| `loadingTab` | `string \| null` | Active drawer tab during streaming |
| `artifacts` | `{architecture?, costs?, terraform?}` | Generated content for drawer tabs |
| `debugEvents` | `DebugEvent[]` | SSE events for Debug tab |
| `debugInfo` | `DebugInfo \| null` | System snapshot from `/debug/info` |

`chatRef` (via `useImperativeHandle`) bridges App → ChatBox for sidebar Compact/Clear actions.

---

## Infrastructure

### Docker Compose Services

```yaml
# docker-compose.yml
services:
  neo4j:       # neo4j:5.26.0 — ports 7474 (HTTP UI), 7687 (Bolt)
  backend:     # FastAPI — port 8000; depends_on neo4j healthy
  frontend:    # Vite dev — port 3000 → container 5173; depends_on backend healthy
```

### Networking

- **Frontend → Backend:** Vite proxy (`vite.config.ts`) forwards `/api/*` to `http://backend:8000`
- **Backend → Neo4j:** Bolt protocol via `NEO4J_URI=bolt://neo4j:7687` (Docker DNS)
- **Backend → OpenRouter:** HTTPS to `https://openrouter.ai/api/v1` (external)

### Volumes

| Volume | Mount | Contents |
|---|---|---|
| `sqlite_data` (named) | `backend:/app/data` | SQLite database (`advisor.db`) |
| `./data/neo4j` (bind) | `neo4j:/data` | Neo4j database files |
| `./logs` (bind) | `backend:/logs` | `debug.jsonl` SSE event log |
| `./backend` (bind) | `backend:/app` | Live code reload in dev |
| `./frontend` (bind) | `frontend:/app` | Live code reload in dev |

### Environment Variables

| Variable | Service | Description |
|---|---|---|
| `LLM_API_KEY` | backend | OpenRouter API key |
| `NEO4J_URI` | backend | Bolt URI (default: `bolt://neo4j:7687`) |
| `NEO4J_PASSWORD` | backend, neo4j | Neo4j auth password |
| `ALLOWED_ORIGINS` | backend | CORS origins (default: `*`) |

---

## Where to Add New Code

**New API endpoint:**
1. Add handler to `backend/src/api/routes.py` (or new router file in `backend/src/api/`)
2. Register new router in `backend/src/main.py` via `app.include_router()`
3. Add Pydantic request/response models to the same router file

**New LLM pipeline step:**
1. Add prompt to `backend/src/core/prompts.py`
2. Create `backend/src/core/<step>.py` with a single class
3. Wire into `backend/src/api/routes.py`

**New generation artifact type:**
1. Add new `POST /api/v1/generate/<type>` endpoint in `backend/src/api/routes.py`
2. Use `db.save_artifact(conv_id, "<type>", content)` to persist
3. Add tab to `frontend/src/components/ArtifactDrawer.tsx`
4. Add type to `GenerateType` in `frontend/src/components/ActionBar.tsx`
5. Add state key to `artifacts` in `frontend/src/App.tsx`

**New frontend component:**
1. Create `frontend/src/components/<Domain>/ComponentName.tsx`
2. Export as `export const ComponentName: React.FC<Props> = ...`

**New page:**
1. Create `frontend/src/pages/PageName.tsx`
2. Add to `Page` type in `App.tsx` and add render case

**New external service:**
1. Create `backend/src/services/<service>.py` with connection in `__init__`
2. Add lifecycle management in `backend/src/main.py` `lifespan()` if needed

---

*Structure analysis: 2025-01-31*


```
sdt520-final-hw/                   # Monorepo root
├── backend/                        # Python FastAPI service
│   ├── Dockerfile                  # Python 3.13-slim image
│   ├── pyproject.toml              # Ruff + Black config
│   ├── requirements.txt            # Python dependencies
│   ├── src/                        # Application source
│   │   ├── main.py                 # FastAPI app entry point
│   │   ├── api/                    # HTTP route handlers
│   │   │   ├── routes.py           # POST /api/v1/chat
│   │   │   └── knowledge.py        # POST/GET /api/v1/knowledge/*
│   │   ├── core/                   # Business logic / LLM pipeline
│   │   │   ├── prompts.py          # All LangChain PromptTemplates
│   │   │   ├── extractor.py        # RequirementExtractor (NL → JSON)
│   │   │   ├── advisor.py          # ArchitectureAdvisor (GraphRAG + LLM)
│   │   │   ├── diagrammer.py       # DiagramGenerator (Mermaid extractor)
│   │   │   ├── cost_analyzer.py    # CostAnalyzer (LLM + Pricing API)
│   │   │   ├── tradeoff_analyzer.py # TradeoffAnalyzer (LLM)
│   │   │   └── iac/                # IaC code generators
│   │   │       ├── terraform.py    # TerraformGenerator (HCL)
│   │   │       └── cloudformation.py # CloudFormationGenerator (YAML)
│   │   ├── models/                 # SQLAlchemy ORM models
│   │   │   └── workload.py         # Workload, Recommendation, IaCSnippet, CostProfile
│   │   └── services/               # External system adapters
│   │       ├── knowledge_base.py   # KnowledgeBaseService (Neo4j)
│   │       └── pricing.py          # PricingService (AWS Pricing API + cache)
│   └── tests/                      # Test suites
│       ├── unit/
│       │   └── test_advisor.py     # Unit tests for advisor
│       └── evals/
│           ├── test_rag_evals.py   # RAG quality evaluations (deepeval)
│           └── results.md          # Evaluation results log
│
├── frontend/                       # React + Vite SPA
│   ├── Dockerfile                  # Node 22-slim image
│   ├── index.html                  # Vite HTML entry
│   ├── package.json                # NPM dependencies
│   ├── vite.config.ts              # Vite config
│   ├── tsconfig.json               # TypeScript config
│   ├── tailwind.config.js          # Tailwind CSS config
│   ├── eslint.config.js            # ESLint config
│   ├── public/                     # Static assets
│   └── src/                        # Application source
│       ├── main.tsx                # React root mount
│       ├── App.tsx                 # Root component (page router)
│       ├── App.css                 # App-level styles
│       ├── index.css               # Global styles
│       ├── assets/                 # Static imports (images, etc.)
│       ├── components/             # Reusable UI components (grouped by domain)
│       │   ├── Chat/
│       │   │   └── ChatBox.tsx     # Main chat interface (input + message thread)
│       │   ├── Code/
│       │   │   └── Snippet.tsx     # Syntax-highlighted code block
│       │   ├── Cost/
│       │   │   └── CostTable.tsx   # Monthly cost breakdown table
│       │   ├── Diagram/
│       │   │   └── MermaidViewer.tsx # Mermaid.js diagram renderer
│       │   └── Tradeoff/
│       │       └── Comparison.tsx  # Trade-off analysis display
│       ├── pages/                  # Full-page views
│       │   └── KnowledgeBase.tsx   # Knowledge Base upload/management page
│       └── styles/                 # Additional style files
│
├── specs/                          # Feature specification documents
│   └── 001-aws-architecture-advisor/
│       ├── spec.md                 # User stories, requirements, acceptance criteria
│       ├── data-model.md           # Entity definitions (relational + graph)
│       ├── plan.md                 # Implementation plan
│       ├── tasks.md                # Task breakdown
│       ├── research.md             # Research notes
│       ├── quickstart.md           # Quick start guide
│       ├── contracts/
│       │   └── api-spec.md         # REST API contract (request/response shapes)
│       └── checklists/
│           └── requirements.md     # Requirements checklist
│
├── docker-compose.yml              # Three-service dev environment
├── .env.example                    # Environment variable template
├── .tool-versions                  # Runtime version pins (asdf)
└── .planning/                      # Planning artifacts (agent-generated)
    └── codebase/                   # Codebase analysis documents
```

## Directory Purposes

**`backend/src/api/`:**
- Purpose: FastAPI route definitions; HTTP boundary only
- Contains: Router instances, Pydantic request/response models, route handlers
- Key files: `routes.py` (chat endpoint), `knowledge.py` (file upload + status)
- Rule: Route handlers should be thin — delegate all logic to `core/`

**`backend/src/core/`:**
- Purpose: All business logic, LLM orchestration, pipeline steps
- Contains: One class per concern; all LLM-calling classes live here
- Key files: `prompts.py` (single source of truth for prompts), `advisor.py` (main pipeline), `iac/` (code generators)
- Rule: No direct HTTP or DB concerns here

**`backend/src/core/iac/`:**
- Purpose: IaC format-specific generators
- Contains: One file per IaC format
- Add new formats here (e.g., `pulumi.py`, `cdk.py`)

**`backend/src/services/`:**
- Purpose: Adapters to external systems (Neo4j, AWS Pricing API)
- Contains: Stateful clients with connection setup in `__init__`
- Key files: `knowledge_base.py` (graph CRUD + schema), `pricing.py` (Pricing API + file cache)

**`backend/src/models/`:**
- Purpose: Data schema — SQLAlchemy ORM models for the intended relational schema
- Contains: `workload.py` with four entities: `Workload`, `Recommendation`, `IaCSnippet`, `CostProfile`
- Note: Not wired to a DB at runtime; serves as schema documentation and future integration target

**`backend/tests/`:**
- `unit/` — Fast, isolated unit tests using pytest
- `evals/` — LLM evaluation tests using `deepeval` (quality/accuracy checks)

**`frontend/src/components/`:**
- Purpose: Reusable UI building blocks, organized by functional domain
- Naming: Each domain gets a PascalCase subdirectory; component files named after the component
- Current domains: `Chat/`, `Code/`, `Cost/`, `Diagram/`, `Tradeoff/`

**`frontend/src/pages/`:**
- Purpose: Full-page views rendered by `App.tsx`
- Current pages: `KnowledgeBase.tsx`
- Note: `ChatBox.tsx` is in `components/Chat/` but acts as the primary page — could be moved here

**`specs/`:**
- Purpose: Feature specifications, contracts, data models (not consumed by runtime code)
- New features: Add a new numbered directory (e.g., `002-feature-name/`)

## Key File Locations

**Entry Points:**
- `backend/src/main.py`: FastAPI application factory, startup hook, router mount
- `frontend/src/main.tsx`: React DOM root mount
- `frontend/index.html`: Vite HTML shell

**Configuration:**
- `docker-compose.yml`: Service topology, port mappings, environment injection
- `.env.example`: Required env vars (`LLM_API_KEY`, `NEO4J_PASSWORD`)
- `backend/requirements.txt`: Python runtime dependencies
- `frontend/package.json`: Node runtime dependencies
- `backend/pyproject.toml`: Ruff and Black formatter config
- `frontend/vite.config.ts`: Vite build/dev server config
- `frontend/tailwind.config.js`: Tailwind CSS theme

**Core Logic:**
- `backend/src/core/prompts.py`: All LLM prompt templates (edit here to tune LLM behavior)
- `backend/src/core/advisor.py`: Primary pipeline orchestrator
- `backend/src/services/knowledge_base.py`: Neo4j schema + graph operations

**API Contract:**
- `specs/001-aws-architecture-advisor/contracts/api-spec.md`: Canonical API documentation
- `backend/src/api/routes.py`: Pydantic models define the live contract

## Naming Conventions

**Backend Files:**
- Python modules: `snake_case.py` (e.g., `cost_analyzer.py`, `knowledge_base.py`)
- Classes: `PascalCase` (e.g., `RequirementExtractor`, `KnowledgeBaseService`)
- Methods: `snake_case` (e.g., `get_recommendation`, `estimate_costs`)
- Test files: `test_<module>.py` prefix

**Frontend Files:**
- Component files: `PascalCase.tsx` (e.g., `ChatBox.tsx`, `MermaidViewer.tsx`)
- Component directories: `PascalCase/` matching the component name
- Page files: `PascalCase.tsx` (e.g., `KnowledgeBase.tsx`)
- Config files: `camelCase.config.js/ts` (e.g., `vite.config.ts`, `eslint.config.js`)
- All exports: named exports with `export const ComponentName: React.FC`

**Directories:**
- Backend: `snake_case/` for all directories under `src/`
- Frontend `components/`: `PascalCase/` per functional domain
- Specs: `NNN-kebab-case/` numbered feature directories

## Where to Add New Code

**New API endpoint:**
1. Add route handler to `backend/src/api/routes.py` (or create new router file in `backend/src/api/`)
2. Register new router in `backend/src/main.py` via `app.include_router()`
3. Add corresponding Pydantic models for request/response in the router file
4. Document in `specs/001.../contracts/api-spec.md`

**New LLM pipeline step:**
1. Create `backend/src/core/<step_name>.py` with a single class
2. Add prompt template to `backend/src/core/prompts.py`
3. Instantiate the class in `backend/src/api/routes.py` and call it in the request handler

**New IaC format:**
1. Create `backend/src/core/iac/<format>.py` following the pattern in `terraform.py`
2. Instantiate and call in `backend/src/api/routes.py` `chat()` handler
3. Add to the `iac` list in the response

**New frontend component:**
1. Create `frontend/src/components/<Domain>/ComponentName.tsx`
2. Export as named export: `export const ComponentName: React.FC<Props> = ...`
3. Import in `ChatBox.tsx` or the relevant parent

**New page:**
1. Create `frontend/src/pages/PageName.tsx`
2. Add page key to `App.tsx` state type and render in the conditional

**New external service adapter:**
1. Create `backend/src/services/<service_name>.py` with a class
2. Handle connection in `__init__`, surface clean methods
3. Import in `core/` layer classes that need it

**New feature spec:**
1. Create `specs/NNN-feature-name/` with `spec.md`, `data-model.md`, `contracts/api-spec.md`

## Special Directories

**`data/` (runtime, not committed):**
- Purpose: Runtime data volumes
- `data/neo4j/`: Neo4j database files (docker volume mount)
- `data/uploads/`: Uploaded knowledge documents
- `data/cache/pricing/`: AWS Pricing API JSON cache (file-based, keyed by service+filter hash)
- Generated: Yes (at runtime)
- Committed: No (in `.gitignore`)

**`.planning/codebase/`:**
- Purpose: Agent-generated codebase analysis documents
- Generated: Yes (by mapper agents)
- Committed: Yes

**`specs/`:**
- Purpose: Feature specifications authored by planning agents
- Generated: Partially (agent-assisted)
- Committed: Yes

---

*Structure analysis: 2025-01-14*

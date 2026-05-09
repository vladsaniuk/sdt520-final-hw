# External Integrations

**Analysis Date:** 2025-01-24

## APIs & External Services

**LLM Provider:**
- OpenRouter (`https://openrouter.ai/api/v1`) - Routes requests to OpenAI GPT-4o
  - SDK/Client: `langchain-openai` (`ChatOpenAI` with custom `openai_api_base`)
  - Auth: `LLM_API_KEY` env var
  - Used in: `backend/src/core/extractor.py`, `backend/src/core/advisor.py`
  - Model: `openai/gpt-4o` (configured as default)

**AWS Services:**
- AWS Pricing API (`us-east-1`) - Fetches on-demand pricing for AWS services (EC2, etc.)
  - SDK/Client: `boto3` (`backend/src/services/pricing.py`)
  - Auth: Standard AWS credential chain (env vars / IAM role — no explicit key in code)
  - Note: Results are file-cached under `data/cache/pricing/`

## Data Storage

**Databases:**
- **Neo4j 5.26.0** (Graph Database) — Primary knowledge store for AWS services, Well-Architected pillars, and document chunks
  - Connection: `NEO4J_URI` env var (default: `bolt://localhost:7687`)
  - Auth: `NEO4J_USER` / `NEO4J_PASSWORD` env vars
  - Client: `neo4j` Python driver (`backend/src/services/knowledge_base.py`), `langchain-community` `Neo4jGraph` (`backend/src/core/advisor.py`)
  - Features used: Vector index (`aws_document_chunks`, 1536-dim cosine), APOC plugin, GDS plugin
  - Docker image: `neo4j:5.26.0` with `NEO4J_PLUGINS=["apoc", "gds"]`
  - Data volume: `./data/neo4j`

- **PostgreSQL** (Relational Database) — Models defined for workloads, recommendations, IaC snippets, cost profiles
  - Connection: Not yet wired (no `DATABASE_URL` in `.env.example`; `psycopg2-binary` installed but no connection string configured)
  - ORM: SQLAlchemy (`backend/src/models/workload.py`)
  - Models: `Workload`, `Recommendation`, `IaCSnippet`, `CostProfile`
  - Status: Schema defined but PostgreSQL service not in `docker-compose.yml` — database not yet integrated at runtime

**File Storage:**
- Local filesystem — Pricing API cache stored at `data/cache/pricing/` (JSON files)
- Neo4j data volumes mounted at `./data/neo4j`

**Caching:**
- Local file cache for AWS pricing responses (`backend/src/services/pricing.py`)
- No Redis or in-memory cache layer

## Authentication & Identity

**Auth Provider:**
- None — No user authentication implemented
- CORS is open (`allow_origins=["*"]`) in `backend/src/main.py` (noted as demo-only)

## LLM / RAG Pipeline

**GraphRAG:**
- Neo4j as knowledge graph (`AWS_Service`, `WellArchitected_Pillar`, `Document_Chunk` nodes)
- Graph traversal queries via `langchain-community` `Neo4jGraph`
- Vector similarity search via Neo4j vector index (1536-dim embeddings, cosine similarity)
- Packages: `neo4j-graphrag`, `langchain-community`
- Used in: `backend/src/core/advisor.py`

**LLM Chains:**
- `RequirementExtractor` (`backend/src/core/extractor.py`) — NL → structured JSON requirements
- `ArchitectureAdvisor` (`backend/src/core/advisor.py`) — GraphRAG → architecture advice + Mermaid diagram
- `DiagramGenerator` (`backend/src/core/diagrammer.py`) — Extracts Mermaid diagram from LLM output
- `TerraformGenerator` (`backend/src/core/iac/terraform.py`) — LLM → Terraform HCL snippets
- `CloudFormationGenerator` (`backend/src/core/iac/cloudformation.py`) — LLM → CloudFormation YAML snippets
- `CostAnalyzer` (`backend/src/core/cost_analyzer.py`) — Cost estimation from advice text + AWS Pricing API
- `TradeoffAnalyzer` (`backend/src/core/tradeoff_analyzer.py`) — Architecture tradeoff analysis

## Monitoring & Observability

**Error Tracking:**
- None configured

**Logs:**
- `print()` statements throughout backend services (e.g., `[Advisor]`, `[Extractor]`, `[KnowledgeBase]` prefixes)
- No structured logging framework

## CI/CD & Deployment

**Hosting:**
- Docker Compose (`docker-compose.yml`) — three services: `neo4j`, `backend`, `frontend`
- No cloud hosting or Kubernetes config detected

**CI Pipeline:**
- `.github/` directory present — CI config likely exists but not explored
- No deployment scripts at root level

## Environment Configuration

**Required env vars:**
- `LLM_API_KEY` — OpenRouter API key (used by all LLM components)
- `NEO4J_PASSWORD` — Neo4j database password (default: `password`)
- `NEO4J_URI` — Neo4j connection URI (default: `bolt://localhost:7687`)

**Optional env vars:**
- `NEO4J_USER` — Neo4j username (default: `neo4j`, hardcoded fallback in service files)

**Secrets location:**
- `.env` file at project root (gitignored); `.env.example` provides template

## Webhooks & Callbacks

**Incoming:**
- None configured

**Outgoing:**
- None configured

---

*Integration audit: 2025-01-24*

# Phase 2: Graph Seeding & Document Ingestion — Context

> Decisions captured for gsd-phase-researcher and gsd-planner.
> Do not re-ask any decision listed here.

**Phase Goal:** Neo4j is populated with structural AWS knowledge AND the document
ingestion pipeline is wired — so GraphRAG has real data (seeded + user-uploaded)
before the chat advisor uses it.

**Requirements:** GRAPH-01, GRAPH-02, GRAPH-03, GRAPH-04, INGEST-01, INGEST-02,
INGEST-03, INGEST-04, INGEST-05

---

## Decisions

### Seed Trigger
- **Decision:** Seed via a dedicated API endpoint — `POST /api/v1/seed`
- **Behavior:** Calling the endpoint seeds AWS services, Well-Architected pillars,
  and architecture patterns into Neo4j. Idempotent (use MERGE). No auto-seed on startup.
- **Rationale:** Gives control over when the graph is populated; avoids always
  re-seeding on container restart.

### Seed Data Format
- **Decision:** Hardcoded Python dict/list in a `backend/src/services/seed.py` file
- **Rationale:** Simple, no extra file formats; easy to version-control and extend.

### Embeddings API
- **Decision:** Local `sentence-transformers` with model `all-MiniLM-L6-v2`
- **Consequence:** Vector index must use **384 dimensions** (not 1536).
  The existing `initialize_schema()` creates a 1536-dim index — this MUST be updated.
- **No API key required.** Add `sentence-transformers` to `requirements.txt`.
- **Rationale:** Free, no external dependency, runs fully inside the Docker container.

### Document Chunking Strategy
- **Decision:** 500 tokens per chunk, 50-token overlap
- **Splitter:** LangChain `RecursiveCharacterTextSplitter` with `chunk_size=500,
  chunk_overlap=50`
- **Supported file types:** PDF (via `pypdf` or `pdfminer`), markdown, plain text

### Upload UI Progress UX
- **Decision:** WebSocket progress stream
- **Backend:** FastAPI WebSocket endpoint `WS /api/v1/knowledge/progress/{doc_id}`
  — emits `{status, progress_pct, message}` events during ingestion
- **Frontend:** KnowledgeBase page connects to WebSocket after upload, shows live
  progress bar until status is `"indexed"`
- **Fallback:** If WebSocket fails, fall back to polling `GET /api/v1/knowledge/status/{id}`

### Architecture Pattern Graph Structure
- **Decision:** Pattern nodes link to Well-Architected pillars only
- **Cypher structure:**
  ```
  (p:Architecture_Pattern)-[:OPTIMIZES]->(waf:WellArchitected_Pillar)
  ```
- **Patterns to seed:** microservices, serverless, event-driven, three-tier
- **Pillar mappings:**
  - Serverless → Cost Optimization, Operational Excellence
  - Microservices → Reliability, Performance Efficiency
  - Event-driven → Reliability, Performance Efficiency
  - Three-tier → Reliability, Security

---

## Code Context (Reusable Assets)

| File | Notes |
|------|-------|
| `backend/src/services/knowledge_base.py` | `add_service()`, `link_service_to_pillar()`, `initialize_schema()` — extend here; fix vector index to 384-dim |
| `backend/src/api/knowledge.py` | Upload + status endpoints — stub; replace stub logic with real ingestion |
| `backend/src/main.py` | `lifespan()` calls `initialize_schema()` on startup — keep this |
| `frontend/src/pages/KnowledgeBase.tsx` | Upload page exists — wire WebSocket progress |

---

## Canonical Refs

- Requirements: `.planning/REQUIREMENTS.md` (GRAPH-01–04, INGEST-01–05)
- Roadmap: `.planning/ROADMAP.md` Phase 2
- Project: `.planning/PROJECT.md`
- Seed service: `backend/src/services/knowledge_base.py`
- Upload API: `backend/src/api/knowledge.py`
- Upload UI: `frontend/src/pages/KnowledgeBase.tsx`

---

## Deferred Ideas

*(None captured during this discussion.)*

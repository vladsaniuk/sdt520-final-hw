# Phase 2: Graph Seeding & Document Ingestion — Research

**Researched:** 2025-07-11
**Domain:** Neo4j graph seeding, document ingestion pipeline, sentence-transformers embeddings, FastAPI WebSocket, GraphRAG retrieval
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Seed Trigger**
- POST /api/v1/seed endpoint, idempotent (MERGE). No auto-seed on startup.

**Seed Data Format**
- Hardcoded Python dict/list in `backend/src/services/seed.py`

**Embeddings API**
- Local `sentence-transformers`, model `all-MiniLM-L6-v2`, 384 dimensions
- No API key required. Add `sentence-transformers` to `requirements.txt`.
- Vector index MUST be updated to 384 dimensions (existing is 1536).

**Document Chunking Strategy**
- 500 tokens per chunk, 50-token overlap
- LangChain `RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)`
- Supported file types: PDF (pypdf or pdfminer), markdown, plain text

**Upload UI Progress UX**
- WebSocket progress stream at `WS /api/v1/knowledge/progress/{doc_id}`
- Emits `{status, progress_pct, message}` events during ingestion
- Frontend: KnowledgeBase page connects to WebSocket after upload, shows live progress bar until status is `"indexed"`
- Fallback: If WebSocket fails, poll `GET /api/v1/knowledge/status/{id}`

**Architecture Pattern Graph Structure**
- Pattern nodes link to Well-Architected pillars only
- Cypher: `(p:Architecture_Pattern)-[:OPTIMIZES]->(waf:WellArchitected_Pillar)`
- Patterns: microservices, serverless, event-driven, three-tier
- Pillar mappings:
  - Serverless → Cost Optimization, Operational Excellence
  - Microservices → Reliability, Performance Efficiency
  - Event-driven → Reliability, Performance Efficiency
  - Three-tier → Reliability, Security

### the agent's Discretion

*(None captured during this discussion.)*

### Deferred Ideas (OUT OF SCOPE)

*(None captured during this discussion.)*
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GRAPH-01 | Neo4j seeded with 12 AWS core services (EC2, S3, RDS, Lambda, VPC, ELB, CloudFront, SQS, SNS, ECS, EKS, DynamoDB) as graph nodes | `seed.py` hardcoded data + `add_service()` + MERGE Cypher |
| GRAPH-02 | Well-Architected 6 pillars seeded as nodes linked to services | `link_service_to_pillar()` + MERGE; 6 pillars: Operational Excellence, Security, Reliability, Performance Efficiency, Cost Optimization, Sustainability |
| GRAPH-03 | Architecture patterns (microservices, serverless, event-driven, three-tier) seeded with component relationships | `Architecture_Pattern` nodes + `OPTIMIZES` rels to pillars |
| GRAPH-04 | Schema fully initialized (uniqueness constraints + 384-dim vector index) before seed runs | DROP existing 1536-dim index, CREATE 384-dim; constraints already exist for AWS_Service, WellArchitected_Pillar, KnowledgeDocument — add Architecture_Pattern constraint |
| INGEST-01 | User uploads PDF, markdown, and plain text files via the UI | pypdf for PDF; file extension detection; existing upload endpoint (extend, not replace) |
| INGEST-02 | Documents parsed, chunked, embedded, stored as Document_Chunk nodes in Neo4j | RecursiveCharacterTextSplitter → SentenceTransformerEmbeddings → Neo4j MERGE Document_Chunk |
| INGEST-03 | Ingestion status accurately reported (not hardcoded stub) | WebSocket manager + real background task progress tracking; replace asyncio.sleep stub |
| INGEST-04 | VectorCypherRetriever wired into advisor pipeline — GraphRAG uses uploaded docs | `VectorCypherRetriever` from neo4j-graphrag + `SentenceTransformerEmbeddings`; augment `advisor.py` TODO |
| INGEST-05 | Embeddings API resolved and implemented | sentence-transformers, all-MiniLM-L6-v2, 384-dim confirmed; `SentenceTransformerEmbeddings` from `neo4j-graphrag` |
</phase_requirements>

---

## Summary

Phase 2 has a clear, low-ambiguity implementation path. The codebase provides all the structural hooks — `initialize_schema()`, `add_service()`, `link_service_to_pillar()`, the upload endpoint stub, and the KnowledgeBase frontend page. The work is to fill in the real implementations. All packages chosen (neo4j-graphrag, sentence-transformers, pypdf, langchain-text-splitters) are available on PyPI and already confirmed to work together. The `neo4j-graphrag` library even ships a built-in `SentenceTransformerEmbeddings` class, eliminating the need for custom embedding glue code.

**One critical blocker discovered:** The live Neo4j instance already has a vector index `aws_document_chunks` at 1536 dimensions. The existing `initialize_schema()` uses `CREATE VECTOR INDEX ... IF NOT EXISTS` — this will silently skip recreation, leaving the wrong dimension. The index must be explicitly DROPped before the 384-dim version is created. This must happen in `initialize_schema()` before any other schema steps.

**Primary recommendation:** Implement in three sequential sub-tasks: (1) Fix schema + create seed service + POST /api/v1/seed endpoint, (2) Build real ingestion pipeline (parse → chunk → embed → store) with WebSocket progress, (3) Wire VectorCypherRetriever into advisor.py and update KnowledgeBase.tsx for live progress.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| neo4j-graphrag | 1.16.0 | VectorCypherRetriever + SentenceTransformerEmbeddings | Official Neo4j package; already in requirements.txt; ships built-in embedder classes |
| sentence-transformers | 5.4.1 | Local embedding model all-MiniLM-L6-v2 (384-dim) | Free, no API key, runs in Docker; officially supported by neo4j-graphrag |
| pypdf | 6.11.0 | PDF text extraction | Lightweight, actively maintained replacement for PyPDF2 |
| langchain-text-splitters | 1.1.2 | RecursiveCharacterTextSplitter | Locked by CONTEXT.md; already has langchain in requirements |
| fastapi (WebSocket) | built-in | WebSocket endpoint for ingestion progress | Built into FastAPI; no extra install |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| python-multipart | already in requirements | Multipart file upload parsing | Already installed; required for FastAPI file uploads |
| asyncio | stdlib | Background task async coordination | Coordinate progress state between upload handler and WebSocket |

### Installation

```bash
# Add to backend/requirements.txt:
sentence-transformers
pypdf
langchain-text-splitters
# neo4j-graphrag is already in requirements.txt — no change needed
# python-multipart is already in requirements.txt — no change needed
```

**Important:** `neo4j-graphrag` ships `SentenceTransformerEmbeddings` which internally imports `sentence_transformers`. Install `sentence-transformers` as a direct requirement — do NOT use the extras syntax `neo4j-graphrag[sentence-transformers]` in `requirements.txt` (pip extras syntax in plain text files can be fragile); install both packages directly.

---

## Architecture Patterns

### Recommended Project Structure

```
backend/src/
├── services/
│   ├── knowledge_base.py    # initialize_schema() — fix vector index; existing add_service(), link_service_to_pillar()
│   ├── seed.py              # NEW: AWS seed data + seed() function called by API endpoint
│   └── ingestion.py         # NEW: parse_document(), chunk_text(), embed_and_store()
├── api/
│   ├── knowledge.py         # Extend: real index_document(), WebSocket endpoint, status endpoint
│   └── routes.py            # Unchanged
└── core/
    └── advisor.py           # Extend: wire VectorCypherRetriever into get_recommendation()

frontend/src/pages/
└── KnowledgeBase.tsx        # Extend: WebSocket connection, progress bar, file type validation
```

### Pattern 1: Idempotent MERGE-based Seeding

**What:** Use Cypher MERGE so re-calling `POST /api/v1/seed` never creates duplicate nodes.
**When to use:** Every seed operation — services, pillars, pattern nodes, and relationships.

```python
# Source: backend/src/services/knowledge_base.py existing pattern, verified in live Neo4j 5.26.0

def seed_service(session, name, category, description):
    session.run("""
        MERGE (s:AWS_Service {name: $name})
        SET s.category = $category, s.description = $description
    """, name=name, category=category, description=description)

def seed_pillar(session, name, description):
    session.run("""
        MERGE (p:WellArchitected_Pillar {name: $name})
        SET p.description = $description
    """, name=name, description=description)

def seed_pattern(session, name, description):
    session.run("""
        MERGE (ap:Architecture_Pattern {name: $name})
        SET ap.description = $description
    """, name=name, description=description)

def link_pattern_to_pillar(session, pattern_name, pillar_name):
    session.run("""
        MATCH (ap:Architecture_Pattern {name: $pattern_name})
        MATCH (p:WellArchitected_Pillar {name: $pillar_name})
        MERGE (ap)-[:OPTIMIZES]->(p)
    """, pattern_name=pattern_name, pillar_name=pillar_name)
```

### Pattern 2: Vector Index DROP + CREATE (384-dim)

**What:** The existing vector index is 1536-dim. Neo4j 5.x has no ALTER for vector indexes — must DROP then CREATE.
**When to use:** Inside `initialize_schema()` — must run before seed, and before any document ingestion.

```python
# Source: Verified against live Neo4j 5.26.0 instance
def initialize_schema(self):
    with self.driver.session() as session:
        # CRITICAL: Drop the wrong-dimension index before recreating
        session.run("DROP INDEX aws_document_chunks IF EXISTS")

        # Recreate at 384 dimensions for all-MiniLM-L6-v2
        session.run("""
            CREATE VECTOR INDEX `aws_document_chunks` IF NOT EXISTS
            FOR (c:Document_Chunk)
            ON (c.embedding)
            OPTIONS {indexConfig: {
              `vector.dimensions`: 384,
              `vector.similarity_function`: 'cosine'
            }}
        """)

        # Existing constraints (already in Neo4j) — safe to re-run IF NOT EXISTS
        session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (s:AWS_Service) REQUIRE s.name IS UNIQUE")
        session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (p:WellArchitected_Pillar) REQUIRE p.name IS UNIQUE")
        session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (d:KnowledgeDocument) REQUIRE d.id IS UNIQUE")

        # New: Architecture_Pattern constraint
        session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (ap:Architecture_Pattern) REQUIRE ap.name IS UNIQUE")
```

### Pattern 3: Document Ingestion Pipeline

**What:** Parse → chunk → embed → store as Document_Chunk nodes.
**When to use:** Called from background task triggered by `POST /api/v1/knowledge/upload`.

```python
# Source: verified pypdf 6.x API, langchain-text-splitters 1.x, neo4j-graphrag SentenceTransformerEmbeddings

from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from neo4j_graphrag.embeddings import SentenceTransformerEmbeddings

embedder = SentenceTransformerEmbeddings(model="all-MiniLM-L6-v2")
splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)

def extract_text(file_path: str, filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext == "pdf":
        reader = PdfReader(file_path)
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    else:  # markdown and plain text
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()

def ingest_document(doc_id: str, file_path: str, filename: str, driver):
    text = extract_text(file_path, filename)
    chunks = splitter.split_text(text)
    with driver.session() as session:
        for i, chunk_text in enumerate(chunks):
            embedding = embedder.embed_query(chunk_text)
            session.run("""
                MERGE (d:KnowledgeDocument {id: $doc_id})
                SET d.filename = $filename
                CREATE (c:Document_Chunk {
                    id: $chunk_id,
                    text: $text,
                    embedding: $embedding,
                    chunk_index: $index
                })
                MERGE (c)-[:PART_OF]->(d)
            """, doc_id=doc_id, filename=filename,
                 chunk_id=f"{doc_id}_{i}", text=chunk_text,
                 embedding=embedding, index=i)
```

### Pattern 4: FastAPI WebSocket Progress Manager

**What:** In-memory dict maps `doc_id → WebSocket`. Background task pushes progress events.
**When to use:** Upload triggers background task; frontend opens WS after receiving `doc_id`.

```python
# Source: FastAPI WebSocket patterns (standard FastAPI docs)
from fastapi import WebSocket, WebSocketDisconnect
import asyncio

# Module-level state
_progress: dict[str, dict] = {}  # doc_id -> {status, progress_pct, message}
_ws_connections: dict[str, WebSocket] = {}  # doc_id -> WebSocket

@router.websocket("/progress/{doc_id}")
async def progress_websocket(websocket: WebSocket, doc_id: str):
    await websocket.accept()
    _ws_connections[doc_id] = websocket
    try:
        # Stream until done or disconnect
        while True:
            if doc_id in _progress:
                await websocket.send_json(_progress[doc_id])
                if _progress[doc_id].get("status") in ("indexed", "error"):
                    break
            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        pass
    finally:
        _ws_connections.pop(doc_id, None)

async def update_progress(doc_id: str, status: str, pct: int, msg: str):
    _progress[doc_id] = {"status": status, "progress_pct": pct, "message": msg}
    # If WS is connected, push immediately
    ws = _ws_connections.get(doc_id)
    if ws:
        try:
            await ws.send_json(_progress[doc_id])
        except Exception:
            _ws_connections.pop(doc_id, None)
```

### Pattern 5: VectorCypherRetriever in Advisor

**What:** Augment graph context with vector-similarity search over Document_Chunk nodes.
**When to use:** Inside `get_recommendation()`, after the Cypher structural query.

```python
# Source: neo4j-graphrag GitHub, verified VectorCypherRetriever API
from neo4j_graphrag.retrievers import VectorCypherRetriever
from neo4j_graphrag.embeddings import SentenceTransformerEmbeddings

embedder = SentenceTransformerEmbeddings(model="all-MiniLM-L6-v2")

retrieval_query = """
    MATCH (node)-[:PART_OF]->(doc:KnowledgeDocument)
    RETURN node.text AS text, doc.filename AS source, score
"""

retriever = VectorCypherRetriever(
    driver=driver,
    index_name="aws_document_chunks",
    retrieval_query=retrieval_query,
    embedder=embedder,
)

def get_vector_context(query_text: str, top_k: int = 5) -> str:
    results = retriever.search(query_text=query_text, top_k=top_k)
    return "\n".join(item.content for item in results.items)
```

### Pattern 6: Frontend WebSocket Progress (React)

**What:** After upload returns `doc_id`, open a WebSocket to stream ingestion progress.
**When to use:** KnowledgeBase.tsx — replace the static status string with a live progress bar.

```typescript
// Standard browser WebSocket API — no extra npm package needed
const ws = new WebSocket(`ws://localhost:8000/api/v1/knowledge/progress/${docId}`)
ws.onmessage = (event) => {
  const data = JSON.parse(event.data) // { status, progress_pct, message }
  setProgress(data.progress_pct)
  setStatusMsg(data.message)
  if (data.status === 'indexed' || data.status === 'error') {
    ws.close()
  }
}
ws.onerror = () => {
  // Fallback: poll GET /api/v1/knowledge/status/{docId}
  startPolling(docId)
}
```

**Vite dev proxy required:** The frontend container runs on port 3000 (vite dev server). API calls to `/api/v1/*` and WebSocket upgrades to `ws://localhost:8000` need a proxy in `vite.config.ts`. Without it, browser WebSocket connects to the wrong host in Docker.

```typescript
// vite.config.ts — add server.proxy
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://backend:8000', changeOrigin: true },
      '/api/v1/knowledge/progress': {
        target: 'ws://backend:8000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
```

### Anti-Patterns to Avoid

- **`IF NOT EXISTS` without DROP:** The existing 1536-dim index will silently block recreation of the 384-dim index if `IF NOT EXISTS` is used without first dropping. Always DROP before CREATE when changing index parameters.
- **Synchronous embedding in upload handler:** `embedder.embed_query()` loads the model on first call (~2s). Do not call it in the synchronous upload handler; always run in the background task.
- **Module-level model instantiation at import time:** `SentenceTransformerEmbeddings()` downloads the model on `__init__`. Create it once at module level in `ingestion.py` — not per-request.
- **Blocking Neo4j session in async handler:** FastAPI upload endpoint is async. Use `BackgroundTasks` for the blocking ingestion work (already present as a stub). Do not call Neo4j session inside an `async def` endpoint directly.
- **Hardcoding `ws://localhost:8000` in frontend:** In Docker, the browser's `localhost` is the host machine, not the backend container. Use a relative WebSocket URL or the Vite proxy.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sentence embedding | Custom HTTP client to HuggingFace API | `SentenceTransformerEmbeddings` from neo4j-graphrag | Built-in, handles model loading, batching, torch/numpy conversion |
| Vector similarity search + graph traversal | Custom Cypher + manual cosine math | `VectorCypherRetriever` from neo4j-graphrag | Handles index query, score normalization, result formatting |
| PDF text extraction | Custom binary parser | `pypdf.PdfReader` | Handles encrypted, multi-page, rotated PDFs; actively maintained |
| Text chunking with overlap | Custom split-by-char logic | `RecursiveCharacterTextSplitter` | Handles token boundaries, overlap, recursive splitting correctly |
| WebSocket connection management | Custom pub/sub or Redis | Module-level dict `{doc_id: WebSocket}` | Sufficient for single-process demo; no external dependency needed |

**Key insight:** The `neo4j-graphrag` package (already in `requirements.txt`) is a one-stop shop for embeddings + vector retrieval. No additional Neo4j-specific plumbing is needed.

---

## Common Pitfalls

### Pitfall 1: Vector Index Dimension Mismatch (Silent Failure)

**What goes wrong:** `CREATE VECTOR INDEX ... IF NOT EXISTS` succeeds silently but the index stays at 1536 dims. When ingestion stores 384-dim embeddings, Neo4j rejects them with a constraint violation. The error may only appear at query time.
**Why it happens:** `IF NOT EXISTS` treats the existing 1536-dim index as "already exists" — name match is sufficient, parameters are not checked.
**How to avoid:** Always `DROP INDEX aws_document_chunks IF EXISTS` before the `CREATE VECTOR INDEX` in `initialize_schema()`.
**Warning signs:** `ingestion.py` throws `ValueError: Embedding dimension mismatch` or Neo4j driver returns `ClientError: Vector dimensionality... does not match`

### Pitfall 2: sentence-transformers Model Download in Docker

**What goes wrong:** First startup of the backend container hangs for 2-5 minutes downloading the `all-MiniLM-L6-v2` model from HuggingFace Hub (~80MB).
**Why it happens:** `sentence_transformers.SentenceTransformer("all-MiniLM-L6-v2")` downloads on first instantiation.
**How to avoid:** For demo purposes, this is acceptable. Document in README that first ingestion call takes ~30s longer. If speed matters, pre-bake model into Docker image with `RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"` in Dockerfile.
**Warning signs:** First upload request takes >60s; subsequent ones are fast.

### Pitfall 3: WebSocket Timing Race

**What goes wrong:** Frontend opens WebSocket too early (before backend starts the background task) and misses the first progress events. The progress bar never updates.
**Why it happens:** `POST /upload` returns immediately while `BackgroundTasks` starts asynchronously. The frontend may open the WS connection and then wait for events that were already sent.
**How to avoid:** Pre-populate `_progress[doc_id] = {"status": "pending", "progress_pct": 0, "message": "Queued"}` in the upload handler before returning. The WebSocket handler polls from this dict, not from events.
**Warning signs:** Progress bar shows 0% and never updates even though ingestion completes.

### Pitfall 4: `Architecture_Pattern` Label vs `Arch_Pattern`

**What goes wrong:** The original spec uses `Arch_Pattern` but CONTEXT.md's Cypher structure uses `Architecture_Pattern`. If inconsistent labels are used across seed, constraint, and retrieval query, nodes won't be found.
**Why it happens:** Label name disagreement between the spec doc and locked decisions.
**How to avoid:** Always use `Architecture_Pattern` throughout — this is the locked CONTEXT.md decision.

### Pitfall 5: Advisor Vector Context on Cold Start (No Documents Uploaded Yet)

**What goes wrong:** `VectorCypherRetriever.search()` returns an empty result set on cold start (no Document_Chunk nodes). If this throws an exception, the entire chat endpoint breaks.
**Why it happens:** Empty vector index returns 0 results, which is valid — but the advisor must handle it gracefully.
**How to avoid:** Wrap vector retrieval in a try/except. If results are empty, proceed with graph-only context. The structural Cypher query (GRAPH-01/02) provides sufficient grounding.

### Pitfall 6: File Type Detection by Extension Only

**What goes wrong:** A file named `document.txt` could actually be a PDF, or a `.md` file might have encoding issues. Simple extension checks miss these cases.
**Why it happens:** HTTP multipart doesn't guarantee MIME type accuracy.
**How to avoid:** Use extension-based routing (`.pdf` → pypdf, anything else → plain text read). This is sufficient for the demo scope. Validate early: if pypdf raises an exception, fall back to plain text read.

---

## Code Examples

### Seed Data Structure (seed.py)

```python
# backend/src/services/seed.py
AWS_SERVICES = [
    {"name": "EC2",         "category": "Compute",    "description": "Scalable virtual servers in the cloud"},
    {"name": "S3",          "category": "Storage",    "description": "Object storage with high durability and availability"},
    {"name": "RDS",         "category": "Database",   "description": "Managed relational database service"},
    {"name": "Lambda",      "category": "Compute",    "description": "Serverless compute — run code without managing servers"},
    {"name": "VPC",         "category": "Networking", "description": "Isolated cloud network for AWS resources"},
    {"name": "ELB",         "category": "Networking", "description": "Distributes incoming traffic across multiple targets"},
    {"name": "CloudFront",  "category": "CDN",        "description": "Global content delivery network with low latency"},
    {"name": "SQS",         "category": "Messaging",  "description": "Managed message queue for decoupling services"},
    {"name": "SNS",         "category": "Messaging",  "description": "Pub/sub messaging and mobile notifications"},
    {"name": "ECS",         "category": "Compute",    "description": "Container orchestration service for Docker workloads"},
    {"name": "EKS",         "category": "Compute",    "description": "Managed Kubernetes service"},
    {"name": "DynamoDB",    "category": "Database",   "description": "Fully managed NoSQL database with single-digit ms latency"},
]

WELL_ARCHITECTED_PILLARS = [
    {"name": "Operational Excellence", "description": "Run and monitor systems to deliver business value"},
    {"name": "Security",               "description": "Protect information, systems, and assets"},
    {"name": "Reliability",            "description": "Recover from failures and meet demand"},
    {"name": "Performance Efficiency", "description": "Use computing resources efficiently"},
    {"name": "Cost Optimization",      "description": "Avoid unnecessary costs"},
    {"name": "Sustainability",         "description": "Minimize environmental impact"},
]

SERVICE_PILLAR_LINKS = [
    ("EC2",        "Reliability"),
    ("EC2",        "Performance Efficiency"),
    ("S3",         "Reliability"),
    ("S3",         "Cost Optimization"),
    ("RDS",        "Reliability"),
    ("RDS",        "Security"),
    ("Lambda",     "Cost Optimization"),
    ("Lambda",     "Operational Excellence"),
    ("VPC",        "Security"),
    ("ELB",        "Reliability"),
    ("ELB",        "Performance Efficiency"),
    ("CloudFront", "Performance Efficiency"),
    ("CloudFront", "Cost Optimization"),
    ("SQS",        "Reliability"),
    ("SNS",        "Reliability"),
    ("ECS",        "Operational Excellence"),
    ("ECS",        "Performance Efficiency"),
    ("EKS",        "Operational Excellence"),
    ("EKS",        "Reliability"),
    ("DynamoDB",   "Performance Efficiency"),
    ("DynamoDB",   "Reliability"),
]

ARCHITECTURE_PATTERNS = [
    {"name": "serverless",    "description": "Event-driven, no server management, pay-per-execution"},
    {"name": "microservices", "description": "Small independent services communicating via APIs"},
    {"name": "event-driven",  "description": "Services communicate via events and message queues"},
    {"name": "three-tier",    "description": "Presentation, application, and data tier separation"},
]

PATTERN_PILLAR_LINKS = [
    ("serverless",    "Cost Optimization"),
    ("serverless",    "Operational Excellence"),
    ("microservices", "Reliability"),
    ("microservices", "Performance Efficiency"),
    ("event-driven",  "Reliability"),
    ("event-driven",  "Performance Efficiency"),
    ("three-tier",    "Reliability"),
    ("three-tier",    "Security"),
]
```

### POST /api/v1/seed Endpoint

```python
# Add to backend/src/api/knowledge.py (or a new seed.py router)
from fastapi import APIRouter
from src.services.seed import seed_graph

@router.post("/seed")
async def trigger_seed():
    """Idempotent: seeds AWS knowledge graph. Safe to call multiple times."""
    try:
        counts = seed_graph()  # Returns {"services": N, "pillars": N, "patterns": N}
        return {"status": "seeded", **counts}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| OpenAI embeddings (1536-dim) | sentence-transformers all-MiniLM-L6-v2 (384-dim) | No API key; vector index must change; 4x smaller embeddings |
| PyPDF2 (deprecated) | pypdf ≥ 4.0 | pypdf is the maintained successor; same API |
| `langchain-community` Neo4j (removed in Phase 1) | `neo4j-graphrag` + `langchain-neo4j` | Dead imports removed; graphrag is the canonical Neo4j retrieval package |

**Deprecated/outdated:**
- `CREATE VECTOR INDEX ... OPTIONS {indexConfig: {"vector.dimensions": 1536}}`: The current live index — must be replaced with 384-dim version.
- `asyncio.sleep(5)` stub in `index_document()`: Must be replaced with real ingestion pipeline.
- Static `"indexed"` status in `GET /knowledge/status/{id}`: Must be replaced with real progress state.

---

## Open Questions

1. **sentence-transformers model download in Docker**
   - What we know: Model downloads from HuggingFace Hub (~80MB) on first instantiation.
   - What's unclear: Whether the Docker image build environment has outbound internet access.
   - Recommendation: Document in README; do not pre-bake into image unless Phase 5 requires it.

2. **VectorCypherRetriever thread safety**
   - What we know: `SentenceTransformerEmbeddings` uses `model.encode()` which is not inherently thread-safe across multiple requests.
   - What's unclear: FastAPI runs multiple concurrent requests; if two uploads arrive simultaneously, does the shared embedder instance cause issues?
   - Recommendation: For demo scale (single-user), shared module-level instance is acceptable. Flag for Phase 5 if concurrent uploads are tested.

3. **Vite WebSocket proxy in Docker vs localhost**
   - What we know: Frontend container's vite dev server needs a WebSocket proxy. Currently `vite.config.ts` has no proxy config.
   - What's unclear: Whether frontend connects to WebSocket using absolute URL (`ws://localhost:8000`) or relative URL (which Vite's proxy intercepts).
   - Recommendation: Add Vite proxy for both `/api` and WebSocket `/api/v1/knowledge/progress`. Use `ws://backend:8000` as the target (Docker internal hostname).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | Container runtime | ✓ | 29.4.2 | — |
| Neo4j (local) | Index/constraint verification | ✓ | 5.26.0 | Use docker compose |
| Python | Backend | ✓ | 3.14.0 | — |
| Node.js | Frontend | ✓ | 25.2.1 | — |
| sentence-transformers | Embeddings (install needed) | ✗ (not in requirements.txt yet) | — | Add to requirements.txt |
| pypdf | PDF parsing (install needed) | ✗ (not in requirements.txt yet) | — | Add to requirements.txt |
| langchain-text-splitters | Chunking (install needed) | ✗ (not in requirements.txt yet) | — | Add to requirements.txt |
| HuggingFace Hub | Model download | ✓ (outbound internet) | — | Pre-bake in Dockerfile |

**Missing dependencies with no fallback:**
- `sentence-transformers`, `pypdf`, `langchain-text-splitters` must be added to `backend/requirements.txt`. These are the only blockers.

**Missing dependencies with fallback:**
- HuggingFace model download: if outbound internet is blocked in Docker build, pre-bake with a `RUN python -c "..."` layer.

---

## Validation Architecture

> `nyquist_validation` is `false` in config.json — this section is skipped per configuration.

---

## Sources

### Primary (HIGH confidence)
- Live Neo4j 5.26.0 instance — verified: `aws_document_chunks` index exists at 1536-dim; all 3 constraints exist; graph has 0 data nodes
- `github.com/neo4j/neo4j-graphrag-python` — `SentenceTransformerEmbeddings`, `VectorCypherRetriever` class definitions verified directly
- Existing codebase — `knowledge_base.py`, `knowledge.py`, `advisor.py`, `main.py`, `KnowledgeBase.tsx` all read and analyzed

### Secondary (MEDIUM confidence)
- PyPI registry — verified: neo4j-graphrag@1.16.0, sentence-transformers@5.4.1, pypdf@6.11.0, langchain-text-splitters@1.1.2
- FastAPI WebSocket pattern (standard docs) — WebSocket class, accept(), send_json() confirmed as standard API

### Tertiary (LOW confidence)
- sentence-transformers model download behavior in Docker: documented based on known HuggingFace Hub behavior, not directly tested in this environment.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — packages verified on PyPI; neo4j-graphrag source code read directly
- Architecture: HIGH — patterns based on reading actual codebase + live Neo4j state
- Pitfalls: HIGH — vector index dimension mismatch verified against live running instance
- WebSocket pattern: MEDIUM — standard FastAPI pattern; not integration-tested end-to-end here

**Research date:** 2025-07-11
**Valid until:** 2025-08-11 (stable libraries; neo4j-graphrag moves fast but API is stable)

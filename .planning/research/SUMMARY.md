# Research Summary — AWS Architecture Advisor

**Synthesized:** 2025-07-11
**Sources:** STACK.md · FEATURES.md · ARCHITECTURE.md · PITFALLS.md · PROJECT.md

---

## TL;DR

- **This is brownfield completion, not greenfield.** The scaffold (FastAPI + React + Neo4j + LangChain + Docker Compose) exists but is hollow: chat returns mocked data, ingestion is a sleep stub, TypeScript won't compile clean, and Mermaid rendering is silently broken. The entire effort is wiring up and fixing existing code.
- **Fix-first, build-second.** Six baseline bugs block every other feature — they must be cleared in Phase 0 before any meaningful work proceeds. Attempting to build history or ingestion on top of broken infrastructure is a time sink.
- **The embeddings API decision must be made before the ingestion phase begins.** OpenRouter (used for all LLM chat) does NOT proxy the `/embeddings` endpoint. Building the ingestion pipeline requires either a separate `OPENAI_API_KEY` (recommended) or switching to local `sentence-transformers` (requires rebuilding the Neo4j vector index from 1536→384 dims). Wrong choice mid-phase means a schema rebuild.
- **Every component that parses LLM output is fragile.** All five core components (`extractor.py`, `diagrammer.py`, `terraform.py`, `cost_analyzer.py`, `cloudformation.py`) use ad-hoc string splitting that raises `IndexError` on unfenced JSON. A single `LLMOutputParser` utility with regex-based extraction + Pydantic validation eliminates the majority of runtime failures across the board.
- **Build order is fully forced by feature dependencies.** No phase is optional and none can be reordered: bug fixes → graph seeding → conversation history → ingestion pipeline → Terraform download → streaming. Each phase unblocks the next and only the next.

---

## Stack Recommendations

### Backend (Python)

| Package | Version | Action |
|---------|---------|--------|
| `fastapi` | `0.136.1` | Pin — already used |
| `langchain` | `1.2.18` | Pin — already used |
| `langchain-core` | `1.3.3` | Pin — transitive, make explicit |
| `langchain-openai` | `1.2.1` | Pin — already used |
| `langchain-neo4j` | `0.9.0` | **Add** — replaces `langchain-community` for Neo4j |
| `langchain-text-splitters` | `1.1.2` | **Add** — required for document chunking |
| `neo4j` | `5.28.4` | **Pin to 5.x, do NOT upgrade** — driver 6.x breaks API; server is 5.26.0 |
| `neo4j-graphrag` | `1.16.0` | Pin — already used |
| `pypdf` | `6.11.0` | Make explicit — already transitive dep |
| `boto3` | latest | Keep — AWS Pricing API |
| `langchain-community` | — | **Remove** — Neo4j integration migrated to `langchain-neo4j` |
| `sqlalchemy` | — | **Remove** — dead code, no PostgreSQL |
| `psycopg2-binary` | — | **Remove** — dead code, no PostgreSQL |

### Frontend (TypeScript/React)

All current packages are correct — **no new packages needed**. Streaming uses native `fetch` + `ReadableStream`. Key fixes:
- `mermaid.contentLoaded()` → `mermaid.run({ nodes: [el] })` (API removed in v10+)
- `bool` → `boolean` TypeScript type error in `CostTable.tsx`

### Infrastructure

| Component | Version | Note |
|-----------|---------|------|
| Neo4j | `5.26.0` | **Do not upgrade** — GDS + APOC plugins configured |
| Docker Compose | v3 | Add `healthcheck` on `neo4j` + `depends_on: condition: service_healthy` on backend |

### Key API Patterns to Use

- **SSE streaming:** FastAPI `StreamingResponse` + LangChain `chain.astream()` — not WebSockets
- **Frontend streaming:** `fetch()` + `ReadableStream` — NOT `EventSource` (EventSource is GET-only, chat is POST)
- **Conversation history:** `RunnableWithMessageHistory` + `InMemoryChatMessageHistory` — NOT deprecated `ConversationBufferMemory`
- **Startup hook:** FastAPI `lifespan` context manager — NOT deprecated `@app.on_event("startup")`
- **LLM calls in async handlers:** `await chain.ainvoke()` / `async for chunk in chain.astream()` — NOT blocking `.invoke()`

---

## Build Order (Forced by Dependencies)

Every phase is gated by the one before it. No reordering.

### Phase 0 — Baseline Repair *(unblocks all phases)*

Fix the six things that are currently broken before touching any feature code:

1. **TypeScript `bool` → `boolean`** in `CostTable.tsx` — frontend won't compile
2. **Mermaid API** — replace `mermaid.contentLoaded()` with `mermaid.run({ nodes: [el] })` + `innerHTML` pre-set
3. **`import json` placement** in `advisor.py` — runtime error on first advice call
4. **Docker Compose neo4j healthcheck** — add `healthcheck` + `depends_on: condition: service_healthy`; backend crashes on cold start without it
5. **`initialize_schema()`** — call it in a FastAPI `lifespan` startup hook; it's defined but never invoked, so vector index and constraints are never created
6. **`recommendation_id: "mock-uuid"`** → `str(uuid.uuid4())` — required for plan approval/download flow
7. **Remove dead code** — delete `backend/src/models/workload.py`, `sqlalchemy`, `psycopg2-binary`; replace `langchain-community` import with `langchain-neo4j`

**Gate:** `docker compose up` starts cleanly; single-turn chat reaches the LLM and returns a real (if generic) response.

---

### Phase 1 — Graph Seeding *(unblocks meaningful advice quality)*

**Depends on:** Phase 0

The advisor's Cypher query returns zero rows on a fresh Neo4j — all advice is pure LLM hallucination with no graph grounding.

1. Create `backend/src/services/seeder.py` — MERGE ~20 `AWS_Service` nodes linked to `WellArchitected_Pillar` nodes
2. Call seeder from the `lifespan` startup hook (after `initialize_schema()`, idempotent via MERGE)
3. Add single shared `neo4j_driver` singleton — currently two separate connection pools exist (`raw driver` + `Neo4jGraph`), which doubles pool usage
4. Validate: Cypher query in advisor returns ≥5 services on cold start

**Gate:** GraphRAG advisor returns real service recommendations grounded in graph context.

---

### Phase 2 — Multi-Turn Conversation History *(unblocks iterative refinement — the core UX)*

**Depends on:** Phase 0

`conversation_id` is accepted by the API but silently discarded. Every message starts fresh. "Make it cheaper" produces a generic new plan, not a modification.

1. `backend/src/core/memory.py` — `ConversationMemory` class: `dict[str, InMemoryChatMessageHistory]`
2. Update `ChatRequest` — generate server-side UUID on first turn if not provided
3. Update `ChatResponse` — include `conversation_id: str`
4. Wire history into `RequirementExtractor.extract()` and `ArchitectureAdvisor.get_recommendation()`
5. Update `routes.py` — load/save history per request via `ConversationMemory`
6. Frontend `ChatBox.tsx` — store `conversation_id` in `localStorage`, send with every subsequent request
7. Switch all LLM calls to async (`await chain.ainvoke()`) — current sync `.invoke()` blocks the FastAPI event loop

**Gate:** Follow-up messages ("use ECS instead of EKS", "make it more cost-optimized") produce contextually grounded refinements.

---

### Phase 3 — Document Ingestion Pipeline *(unblocks RAG quality — "grounded in their own docs")*

**Depends on:** Phase 0, Phase 1 (Neo4j schema in place)

**⚠️ Decide before building:** Embeddings API source.
- **Option A (recommended):** Add `OPENAI_API_KEY` env var → `OpenAIEmbeddings` against `api.openai.com`. Keeps the existing 1536-dim vector index. Low friction if user has an OpenAI key.
- **Option B:** `langchain-huggingface` + `sentence-transformers/all-MiniLM-L6-v2` (384-dim). No extra API key but requires dropping and recreating the vector index at a different dimension. Larger Docker image.

The upload endpoint is a 5-second sleep stub. Nothing ingests, chunks, embeds, or stores documents.

1. `backend/src/core/ingestion/parser.py` — `pypdf` for PDFs, plaintext for `.md`/`.txt`
2. `backend/src/core/ingestion/embedder.py` — `RecursiveCharacterTextSplitter(chunk_size=1000, overlap=200)` → embed → Neo4j `Document_Chunk` upsert
3. Replace stub in `knowledge.py` with real `BackgroundTask` pipeline; add in-memory `INDEXING_STATUS` dict
4. Update `GET /status/{doc_id}` to read from `INDEXING_STATUS` (not always-return-"indexed")
5. Add filename sanitization: `Path(file.filename).name` to prevent path traversal
6. Wire vector retrieval in `ArchitectureAdvisor` (the `TODO` comment on line 32 of `advisor.py`)
7. Use `VectorCypherRetriever` from `neo4j-graphrag` to combine graph context + semantic chunks

**Gate:** Uploaded PDFs appear in the knowledge base; advisor references user-uploaded doc content in recommendations.

---

### Phase 4 — Terraform File Download *(the deliverable feature)*

**Depends on:** Phase 2 (real `recommendation_id` from conversation flow)

No approval signal, no download endpoint, and generated HCL is never persisted — the core deliverable of the project doesn't exist yet.

1. Add `data/generated/` to `docker-compose.yml` volumes
2. After `TerraformGenerator.generate()` in `routes.py`, write to `data/generated/{recommendation_id}.tf`
3. Separate `TERRAFORM_PROMPT` from `IAC_PROMPT` — current prompt requests both HCL + YAML and conflicts with itself; LLMs output both formats ~30% of the time
4. Strengthen HCL extraction: replace brittle string split with `re.search(r'```(?:hcl|terraform)?\n(.*?)```', content, re.DOTALL)`
5. Add `GET /api/v1/terraform/{recommendation_id}` endpoint → `FileResponse` with `Content-Disposition: attachment; filename=main.tf`
6. Remove `CloudFormationGenerator` from the main pipeline (out-of-scope per PROJECT.md; code can stay)
7. Frontend `ChatBox.tsx` — show "Download Terraform" button once `recommendation_id` is in response; `window.location.href = /api/v1/terraform/{id}`

**Gate:** User can click a button and receive a `.tf` file download.

---

### Phase 5 — LLM Streaming Responses *(UX quality)*

**Depends on:** Phase 2 (conversation works), Phase 4 (response assembled correctly)

Currently users wait 30–60 seconds for a blank screen before any response appears (5 sequential blocking LLM calls).

1. Backend: Change `POST /api/v1/chat` to `StreamingResponse` (SSE, `media_type="text/event-stream"`)
2. Stream advisor tokens as `data: {"type":"token","content":"..."}` events
3. Emit metadata at end: `data: {"type":"done","recommendation_id":"...","diagram":"...","costs":{}}`
4. Parallelize independent calls: run `TerraformGenerator` + `CostAnalyzer` concurrently via `asyncio.gather()` after advisor text is complete
5. Frontend: Replace `fetch().json()` with `fetch()` + `ReadableStream` reader (NOT `EventSource` — it's GET-only)
6. `ChatBox.tsx`: append tokens progressively to message; handle metadata event to update diagram and cost panels
7. Add `Cache-Control: no-cache` and `X-Accel-Buffering: no` headers to SSE response

**Gate:** First token appears within 2 seconds of sending a message; full response streams progressively.

---

### Phase 6 — End-to-End Docker Polish *(demo-ready)*

**Depends on:** All prior phases

1. Verify `docker compose up` cold-start works with zero manual steps
2. Add graceful AWS credentials fallback in `PricingService` (currently crashes at startup if creds absent)
3. Add `.env.example` with all required vars: `LLM_API_KEY`, `NEO4J_PASSWORD`, `OPENAI_API_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
4. Document APOC/GDS plugin download dependency — requires outbound internet on first start; note in README
5. Add Vite proxy config (`vite.config.ts`) for local dev outside Docker
6. Update README quickstart

**Gate:** `docker compose up` + `.env` file = working demo with no additional steps.

---

## Top Risks

### Risk 1: OpenRouter Does Not Support Embeddings (CP — Phase 3 blocker)

**What breaks:** The existing vector index (`aws_document_chunks`, 1536-dim) was built expecting OpenAI embeddings. `LLM_API_KEY` routes through `openrouter.ai/api/v1` which handles chat completions only — the `/embeddings` endpoint returns 404. The ingestion pipeline cannot embed without a separate API key or a local model.

**Mitigation:** Decide at Phase 3 start: add `OPENAI_API_KEY` env var (recommended) OR switch to local `sentence-transformers` and rebuild the vector index at 384 dims. Document the decision; do not leave it ambiguous until implementation time.

---

### Risk 2: Neo4j Startup Race Condition (CP-1 — Phase 0)

**What breaks:** Docker Compose `depends_on: neo4j` only waits for the container to start, not for Neo4j's ~30s initialization (APOC/GDS plugin load + migration). Backend connects, gets `ServiceUnavailable`, crashes or swallows the error, and all graph operations silently return empty results.

**Mitigation:** Add `healthcheck` to the `neo4j` service and `depends_on: condition: service_healthy` to the backend. Add retry logic in the lifespan startup handler.

---

### Risk 3: Sync LLM Calls Block the FastAPI Event Loop (CP-3 — affects Phase 2+)

**What breaks:** All 5 LLM calls use synchronous `.invoke()` inside `async def` FastAPI handlers. This blocks the entire ASGI event loop for 30–60 seconds per request. Health checks time out; Docker Compose restarts the backend; 2 concurrent users create 60+ second waits each.

**Mitigation:** Replace all `.invoke()` with `await chain.ainvoke()` as part of Phase 2. Parallelize `TerraformGenerator` + `CostAnalyzer` calls with `asyncio.gather()` in Phase 5.

---

### Risk 4: LLM JSON Parsing Raises `IndexError` Silently (CP-6 — affects Phase 0/1)

**What breaks:** `extractor.py` and `cost_analyzer.py` parse LLM output with `content.split("```json")[1]`. When the LLM returns valid JSON without a code fence (common), this raises `IndexError`, which is caught by a bare `except Exception` and returns a fallback dict. Every recommendation then uses `user_count: 0, high_availability: False` — wrong parameters, wrong advice, silently.

**Mitigation:** Replace all string-split JSON extraction with a single robust utility using `re.search(r'\{.*\}', content, re.DOTALL)` + `json.loads()` + Pydantic validation. Implement once in Phase 0/1; use everywhere.

---

### Risk 5: Empty Graph = Hallucinated Advice (CP-7 — Phase 1)

**What breaks:** No seed data exists. The advisor's Cypher query returns zero rows on fresh install. The LLM generates plausible-sounding but ungrounded recommendations using only its training data. The entire "GraphRAG-powered" value proposition is false until Phase 1 is complete.

**Mitigation:** Seed script with ~20 canonical AWS services linked to Well-Architected pillars, called idempotently at startup. This is Phase 1's entire purpose and must precede any quality evaluation.

---

## Key Decisions Required

These must be resolved **before** the indicated phase begins. Ambiguity mid-phase causes rework.

| Decision | Must Decide Before | Options | Recommendation |
|----------|--------------------|---------|----------------|
| **Embeddings API source** | Phase 3 start | A) Separate `OPENAI_API_KEY` → `api.openai.com` (1536-dim, no index change) · B) Local `sentence-transformers/all-MiniLM-L6-v2` (384-dim, requires index rebuild) | **Option A** — minimal change; most developers have an OpenAI key |
| **Terraform approval UX** | Phase 4 start | A) Frontend "Approve & Download" button → `GET /terraform/{id}` · B) Chat message ("approved") triggers download | **Option A (button)** — deterministic, no NLP parsing needed |
| **LLM structured output strategy** | Phase 0/1 | A) Pydantic + `llm.with_structured_output()` for extractor and cost analyzer · B) Robust regex utility | **Option A** — eliminates CP-6 and the bulk of parsing fragility across all components simultaneously |
| **AWS Pricing credentials handling** | Phase 0 | A) Require AWS creds; fail on missing · B) Lazy-init + graceful no-creds fallback | **Option B** — demo tool; don't require AWS creds for a working demo |
| **Conversation history size limit** | Phase 2 | A) Unlimited (risks context window overflow) · B) Sliding window of last N turns | **Option B (last 10 turns)** — LLM context windows are finite; unlimited history will eventually break |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Stack versions and package choices | HIGH | Verified against live PyPI; official LangChain docs |
| Feature inventory and current state | HIGH | Direct codebase audit — every finding is traceable to a specific file/line |
| Build order and phase dependencies | HIGH | Dependency graph is mechanical; each phase's gate condition is verifiable |
| Architecture component design | HIGH | Based on existing scaffolding; no novel patterns required |
| OpenRouter embedding limitation | HIGH | Documented API surface; OpenRouter explicitly does not proxy `/embeddings` |
| `neo4j-graphrag` VectorCypherRetriever API | MEDIUM | API verified from package changelog; OpenRouter embedding compat needs a smoke test |
| Terraform HCL quality from LLM | MEDIUM | LLM output quality is probabilistic; validation subprocess will reveal actual failure rate |
| AWS Pricing API coverage | LOW | Only EC2 costs currently handled; real workloads need RDS, Lambda, S3, CloudFront at minimum |

**Overall: HIGH** — all critical findings are grounded in direct source code inspection, not inference. The one genuine unknown is the embeddings API compatibility, which is resolved by a pre-Phase-3 decision.

**Gaps to watch:**
- AWS Pricing coverage is poor (EC2 only); cost estimates will be misleading for non-EC2 architectures
- No tests exist for any component — regression risk is high across all phases
- APOC/GDS plugin download requires outbound internet; CI and air-gapped environments will fail silently

---

## Sources

- `backend/src/api/routes.py`, `knowledge.py` — direct API audit
- `backend/src/core/advisor.py`, `extractor.py`, `iac/terraform.py`, `cost_analyzer.py` — direct core logic audit
- `backend/src/services/knowledge_base.py` — Neo4j service audit
- `backend/src/main.py`, `docker-compose.yml` — infrastructure audit
- `frontend/src/components/Chat/ChatBox.tsx`, `Diagram/MermaidViewer.tsx` — frontend audit
- `.planning/PROJECT.md` — requirements, out-of-scope items, constraints
- `.planning/codebase/CONCERNS.md` — known bugs and tech debt
- LangChain 1.x official docs — `RunnableWithMessageHistory`, `langchain-neo4j`, `astream()`
- Neo4j Python driver changelog — 5.x vs 6.x compatibility matrix
- Mermaid 10+ changelog — `contentLoaded()` removal, `run()` API
- FastAPI docs — `lifespan`, `StreamingResponse`, SSE pattern

# Technical Concerns

**Analysis Date:** 2025-07-15

---

## Known Issues

**Neo4j graph has no AWS_Service or WellArchitected_Pillar nodes (Phase 2 seeding skipped):**
- Symptoms: Cypher query in `backend/src/core/advisor.py` (`build_advisor_messages()` and `get_recommendation()`) runs `MATCH (s:AWS_Service)-[:ALIGNS_WITH]->(p:WellArchitected_Pillar) RETURN ...` and always gets `[]`. Graph context is silently empty string. Only vector/document RAG is active.
- Files: `backend/src/core/advisor.py` lines 134–140, 193–198; `backend/src/services/seed.py` (seed data defined but never called at startup)
- Trigger: Every architecture generation request.
- Workaround: `seed.py` has all data ready (`AWS_SERVICES`, `WELL_ARCHITECTED_PILLARS`, `SERVICE_PILLAR_LINKS`, `ARCHITECTURE_PATTERNS`). Call `seed_graph()` from startup or expose a `/api/v1/admin/seed` endpoint and run it once.

**RAG sources always come from games/serverless PDFs regardless of query domain:**
- Symptoms: Vector retrieval in `backend/src/core/advisor.py` (`_get_vector_context()`) searches all `Document_Chunk` nodes without any document-level filtering. A WordPress query retrieves chunks from whatever PDFs happen to be uploaded, including unrelated domains.
- Files: `backend/src/core/advisor.py` lines 38–47; `backend/src/services/ingestion.py`
- Trigger: Any query where the user's domain doesn't match the indexed PDFs.
- Workaround: None currently. Fix: add metadata filters to the Cypher retrieval query to match by topic or add a query-time document relevance filter.

**neo4j-graphrag serializes Record objects as strings — handled via brittle regex:**
- Symptoms: When the retrieval query returns multiple columns (text, source, score), `item.content` in `results.items` is a raw `<Record text='...' source='...' score=0.9>` string instead of structured fields.
- Files: `backend/src/core/advisor.py` lines 54–66 (`_parse_record_string()`)
- Trigger: Every vector retrieval call.
- Workaround: `_parse_record_string()` regex handles both single and double-quoted fields. Risk: breaks on multi-line text chunks where quotes appear inside the text.

**`CostEstimate` model_validator normalizes LLM schema drift at runtime:**
- Symptoms: LLM (OpenRouter/GPT-4o) returns `estimated_monthly_cost` instead of `total`, or `breakdown` as a dict instead of a list, or cost values as strings like `"$45/month"`. Three separate normalizations in `_normalise()` and `_coerce_cost()`.
- Files: `backend/src/core/models.py` lines 21–60
- Trigger: Any architecture generation where LLM deviates from schema.
- Workaround: Validators handle known drift patterns. Risk: new drift patterns silently produce `total: 0.0` or empty breakdown.

**`window.confirm` used for delete confirmation:**
- Symptoms: Conversation delete uses browser-native `window.confirm()` dialog, not Chakra UI modal, inconsistent with the rest of the UI.
- Files: `frontend/src/App.tsx` line 355
- Trigger: User clicks delete on a conversation.
- Workaround: Functional (doesn't block delete). Fix: replace with `useDisclosure` + Chakra `AlertDialog`.

**`depends_on: service_healthy` unreliable on `docker compose restart`:**
- Symptoms: `docker compose restart` does not re-evaluate health conditions — frontend container can start before backend is ready, causing 502s.
- Files: `docker-compose.yml` lines 32–34 (backend `depends_on: neo4j: condition: service_healthy`); Dockerfile CMD should have poll loop
- Trigger: `docker compose restart` (not `docker compose up`).
- Workaround: Vite proxy has `keepAlive: false` to re-resolve DNS on every request (`frontend/vite.config.ts` line 28), which helps with stale IP 502s after restart but doesn't fix startup ordering.

---

## Tech Debt

**`get_recommendation()` in advisor.py makes blocking sync Neo4j call in async context:**
- Issue: Line 198 in `backend/src/core/advisor.py` calls `self.graph.query(context_query)` synchronously (no `asyncio.to_thread`) in an async route handler. Comment says "sync Neo4j query — acceptable for demo".
- Files: `backend/src/core/advisor.py` line 198
- Impact: Blocks the async event loop during Neo4j I/O. Under concurrent requests, this stalls all other coroutines.
- Fix approach: Wrap with `await asyncio.to_thread(self.graph.query, context_query)`.

**Duplicate `_make_llm()` calls — new `ChatOpenAI` instance created per request:**
- Issue: `routes.py` calls `_make_llm()` inside `generate()` closures and `_generate_full_terraform()`. Each invocation creates a new `ChatOpenAI` object with no connection pooling.
- Files: `backend/src/api/routes.py` lines 74–79, 156, 569, 654, 710
- Impact: No HTTP keep-alive reuse to OpenRouter; minor latency overhead per request.
- Fix approach: Use module-level singleton or request-scoped dependency injection via FastAPI `Depends`.

**`_terraform_cache` is an in-memory dict with no eviction:**
- Issue: `_terraform_cache: Dict[str, str]` in `routes.py` accumulates HCL strings per `recommendation_id` for the process lifetime. No TTL, no size limit, no persistence.
- Files: `backend/src/api/routes.py` line 53
- Impact: Memory grows unbounded under heavy use. Cache is lost on restart.
- Fix approach: Use `backend/src/db/database.py`'s `save_artifact()` / `get_artifact()` (which already exists and handles terraform artifacts) instead of the in-memory dict.

**Debug events (`type: "debug"`) streamed to frontend clients:**
- Issue: Every SSE stream yields `_log_event({'type': 'debug', ...})` events containing full message arrays (truncated at 2000 chars per message). These are sent to the client browser, not just the log file.
- Files: `backend/src/api/routes.py` lines 312–317, 369–371, 573–578, 656–659, 712–715
- Impact: Exposes system prompt content (GATHER_PROMPT, ADVISOR_PROMPT) to any client that reads the SSE stream.
- Fix approach: Add `if os.getenv("DEBUG_SSE"): yield ...` guard, or only write debug events to the log file and not into the SSE yield.

**CORS wildcard default (`ALLOWED_ORIGINS=*`):**
- Issue: `docker-compose.yml` defaults to `ALLOWED_ORIGINS=*` and `backend/src/main.py` applies this to `CORSMiddleware`. Any origin can call the LLM inference and document upload endpoints.
- Files: `backend/src/main.py` lines 27–35; `docker-compose.yml` line 31
- Impact: Public internet abuse of LLM API key (OpenRouter billed per token).
- Fix approach: Require explicit `ALLOWED_ORIGINS` in `.env`; do not default to `*`.

**SQLite opens a new connection per call (no connection pool):**
- Issue: Every function in `backend/src/db/database.py` calls `_get_conn()` which creates a new `sqlite3.connect()`. There is no connection pool or context manager reuse.
- Files: `backend/src/db/database.py` lines 10–14
- Impact: Under concurrent requests, SQLite WAL mode prevents data corruption but connection overhead adds latency. At demo scale this is fine.
- Fix approach: Use a thread-local connection cache or switch to `aiosqlite` for async-native access.

**`list_conversations()` issues N+1 queries (one per conversation for title):**
- Issue: `database.py:list_conversations()` fetches all conversations then issues a separate `SELECT` per conversation to get the first human message as title.
- Files: `backend/src/db/database.py` lines 147–169
- Impact: O(N) database queries for N conversations in sidebar. Slow at scale.
- Fix approach: Use a single `LEFT JOIN` or subquery to fetch first messages in one query.

**`vite.config.ts` uses `require('http')` (CommonJS) inside an ES module config:**
- Issue: `frontend/vite.config.ts` line 28: `new (require('http').Agent)({ keepAlive: false })`. Vite config is an ES module context; `require()` works here because Vite processes it via Node.js, but it's a CommonJS/ESM mixing anti-pattern.
- Files: `frontend/vite.config.ts` line 28
- Fix approach: `import http from 'http'` at top of file.

---

## Risks

**Conversation history not persisted across restarts (advisor.py legacy comment):**
- Risk: The project context notes "conversation history in-memory dict in advisor.py keyed by conversation_id — not persisted across restarts." However, `advisor.py` no longer has an in-memory dict — history is persisted via SQLite in `database.py`. If any path still bypasses the DB (e.g., the legacy `/api/v1/chat` POST endpoint in `routes.py` lines 418–468), history from that path is not cross-referenced with the stream endpoint's DB state.
- Files: `backend/src/api/routes.py` lines 418–468 (non-streaming `/chat` endpoint), `backend/src/db/database.py`
- Impact: Using the non-streaming endpoint (`/chat` POST) and the streaming endpoint (`/chat/stream` POST) for the same conversation may produce inconsistent history.

**No rate limiting or request queuing on LLM endpoints:**
- Risk: `/generate/architecture`, `/generate/costs`, `/generate/terraform`, `/chat/stream` all initiate LLM streaming calls with no concurrency limit. Simultaneous users each trigger independent GPT-4o calls via OpenRouter, all billed to the single `LLM_API_KEY`.
- Files: `backend/src/api/routes.py` lines 276, 553, 622, 687
- Impact: Cost runaway under any load; OpenRouter may rate-limit the key causing 429 errors that the frontend has no retry logic for.

**No authentication on any endpoint:**
- Risk: All API endpoints — including document upload (`/knowledge/upload`), architecture generation, and database queries — are completely unauthenticated. Any network-accessible deployment is open to abuse.
- Files: `backend/src/main.py`, `backend/src/api/routes.py`
- Current mitigation: None.
- Impact: Arbitrary users can upload documents to Neo4j, drain the LLM API key, and read all stored conversations.

**Terraform CLI not installed in Docker container — validation always skipped:**
- Risk: `_validate_terraform()` in `routes.py` calls `shutil.which("terraform")` and returns `(None, [])` if not found, with `valid=None` in the response. The backend Dockerfile almost certainly does not install Terraform.
- Files: `backend/src/api/routes.py` lines 171–233; `backend/Dockerfile` (Terraform not installed)
- Impact: HCL validation is silently skipped. The approve endpoint always returns `valid: null` in production.

**AWS Pricing API (`boto3`) requires AWS credentials not documented or injected:**
- Risk: `backend/src/services/pricing.py` calls `boto3.client('pricing', region_name='us-east-1')` using the implicit credential chain. No AWS credentials are in `docker-compose.yml` or `.env` documentation.
- Files: `backend/src/services/pricing.py` lines 9–10; `docker-compose.yml`
- Impact: Pricing API calls fail silently (returns `None`). `cost_analyzer.py` wraps this in a try/except that falls back to LLM estimates — so the failure is masked.

**`PricingService` caches to `data/cache/pricing` on the host filesystem:**
- Risk: Cache path is relative (`data/cache/pricing`), which resolves differently inside Docker vs. the host. Files written inside the container are not mounted to a volume and are lost on restart.
- Files: `backend/src/services/pricing.py` lines 10–11
- Impact: Pricing cache never persists; every cold start re-fetches from AWS Pricing API (if credentials are available).

---

## Unresolved Decisions

**Two chat endpoints exist with overlapping responsibilities:**
- The legacy `/api/v1/chat` POST endpoint (`routes.py` lines 418–468) uses `ArchitectureAdvisor.get_recommendation()` with structured output (JSON mode). The streaming `/api/v1/chat/stream` endpoint uses raw LLM streaming with manual JSON parsing. Both persist to the same SQLite DB but use different code paths.
- Question: Is `/api/v1/chat` (non-streaming) still used by the frontend? If not, it is dead code accumulating maintenance burden.
- Files: `backend/src/api/routes.py` lines 276–415 (stream), 418–468 (non-stream)

**Separate embedder instances in ingestion.py and advisor.py (same model, double memory):**
- `backend/src/services/ingestion.py` line 19: module-level `embedder = SentenceTransformerEmbeddings(model="all-MiniLM-L6-v2")`.
- `backend/src/core/advisor.py` line 29: `_embedder = SentenceTransformerEmbeddings(model="all-MiniLM-L6-v2")` (lazy singleton).
- Both load the same `all-MiniLM-L6-v2` model into memory (~90MB). At startup, two copies exist in the backend process.
- Question: Should there be a single shared embedder module imported by both?

**`seed.py` never called automatically — manual seeding required:**
- `backend/src/services/seed.py` has `seed_graph()` fully implemented but it is never called from `backend/src/main.py` startup or from any API route.
- Question: Should `seed_graph()` be called on every startup (idempotent via MERGE)? Or should there be an explicit admin endpoint to trigger seeding once?
- Files: `backend/src/services/seed.py`, `backend/src/main.py`

---

## Test Coverage Gaps

**Unit tests are shallow stubs — no core logic is tested:**
- What's not tested: `ArchitectureAdvisor.get_recommendation()`, `_get_vector_context()`, `_parse_record_string()`, all route handlers, `CostEstimate._normalise()`, database CRUD operations, SSE stream events.
- Files: `backend/tests/unit/test_advisor.py` (3 tests — only `DiagramGenerator.extract_mermaid()` and instantiation checks)
- Risk: Any change to advisor, models, or routes has zero test coverage.
- Priority: High

**RAG eval test uses static hardcoded mock data:**
- What's not tested: The live Neo4j retrieval pipeline, actual LLM responses, real document chunks.
- Files: `backend/tests/evals/test_rag_evals.py`
- Risk: Eval metrics measure quality of hardcoded strings, not the running system. Results are meaningless as quality signal.
- Priority: High

**No frontend tests of any kind:**
- What's not tested: All React components, SSE stream parsing, state machine transitions (gathering → architecture_ready → costs_ready → terraform_ready), conversation restore logic.
- Files: `frontend/src/` (zero `*.test.*` or `*.spec.*` files)
- Priority: Medium

---

## Next Priorities

1. **Seed the graph** — call `seed_graph()` from `backend/src/main.py` on startup (or expose `/api/v1/admin/seed`). This unblocks graph context for every architecture recommendation. `backend/src/services/seed.py` is already complete.

2. **Guard debug SSE events** — remove or gate `type: "debug"` events behind a `DEBUG_SSE` env var. System prompts are currently exposed to any client reading the stream. `backend/src/api/routes.py`.

3. **Replace `_terraform_cache` with DB artifacts** — use `db.save_artifact()` / `db.get_artifact()` already in `backend/src/db/database.py` instead of the unbounded in-memory dict.

4. **Fix `get_recommendation()` sync Neo4j call** — wrap `self.graph.query(context_query)` with `asyncio.to_thread()` in `backend/src/core/advisor.py` line 198.

5. **Add minimal authentication** — a single FastAPI `Depends` that checks a static `API_KEY` header would block public abuse of the LLM key. `backend/src/main.py` or a shared dependency.

6. **Consolidate embedder** — extract a shared `backend/src/services/embedder.py` singleton imported by both `ingestion.py` and `advisor.py` to halve memory use.

7. **Fix list_conversations N+1** — rewrite `backend/src/db/database.py:list_conversations()` with a single `LEFT JOIN` subquery.

---

*Concerns audit: 2025-07-15*

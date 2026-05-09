# Codebase Concerns

**Analysis Date:** 2025-01-30

---

## Tech Debt

**Mock `recommendation_id` hardcoded in chat route:**
- Issue: Every chat response returns `"recommendation_id": "mock-uuid"` instead of a real UUID.
- Files: `backend/src/api/routes.py` (line 54)
- Impact: No ability to reference, retrieve, or persist recommendations. API contract states this should be a real UUID.
- Fix approach: Generate with `str(uuid.uuid4())` or persist a `Recommendation` record and return its actual ID.

**`import json` placed at bottom of module:**
- Issue: `import json` is placed at the bottom of `backend/src/core/advisor.py` (line 52) after class definition, which works but violates Python convention and is a sign of rushed addition.
- Files: `backend/src/core/advisor.py`
- Impact: Non-critical but causes linter warnings and indicates untested refactoring.
- Fix approach: Move import to top of file.

**`import json` also missing from cost_analyzer top-level:**
- Issue: Same pattern in `backend/src/core/cost_analyzer.py` (line 68) — `import json` appended at file bottom.
- Files: `backend/src/core/cost_analyzer.py`
- Impact: Same as above.
- Fix approach: Move to standard import block at top.

**CORS wildcard `allow_origins=["*"]` in production:**
- Issue: `backend/src/main.py` has `allow_origins=["*"]` with comment "For demo, restrict in prod."
- Files: `backend/src/main.py` (line 13)
- Impact: Any origin can call the backend API, exposing the LLM inference endpoint and AWS Pricing API to public abuse.
- Fix approach: Set explicit allowed origins from environment variable (e.g., `ALLOWED_ORIGINS`).

**SQLAlchemy models defined but never connected or used:**
- Issue: `backend/src/models/workload.py` defines full relational schema (`Workload`, `Recommendation`, `IaCSnippet`, `CostProfile`) using SQLAlchemy with PostgreSQL UUID types. No database engine, session, or connection configuration exists anywhere in `backend/src/`. No `DATABASE_URL` env var is in `.env.example`. No PostgreSQL service in `docker-compose.yml`.
- Files: `backend/src/models/workload.py`
- Impact: All data is stateless/in-memory. Recommendations are never persisted. The full relational schema is dead code.
- Fix approach: Either wire up a PostgreSQL service in `docker-compose.yml` with a session factory and integrate models into routes, or remove the models if pure Neo4j/in-memory is the intended design.

**`psycopg2-binary` listed as dependency but no database is configured:**
- Issue: `backend/requirements.txt` includes `psycopg2-binary` (PostgreSQL adapter), but no PostgreSQL container exists in `docker-compose.yml` and no `DATABASE_URL` is in `.env.example`.
- Files: `backend/requirements.txt`, `docker-compose.yml`, `.env.example`
- Impact: Unused dependency adds container weight and potential install failures.
- Fix approach: Remove if PostgreSQL is not being used, or complete the PostgreSQL integration.

---

## Known Bugs

**TypeScript type error in `CostTable.tsx`:**
- Symptoms: `is_calculated: bool` (line 6) is Python syntax in a TypeScript file. Should be `is_calculated: boolean`.
- Files: `frontend/src/components/Cost/CostTable.tsx` (line 6)
- Trigger: TypeScript compilation — `tsc` will fail on this file.
- Workaround: None; the frontend may not compile cleanly.

**`MermaidViewer` uses deprecated `mermaid.contentLoaded()` API:**
- Symptoms: Mermaid v10+ removed `mermaid.contentLoaded()`. The component calls it in a `useEffect` but this method no longer exists in current Mermaid releases.
- Files: `frontend/src/components/Diagram/MermaidViewer.tsx` (line 20)
- Trigger: Any architecture recommendation that renders a diagram in the browser.
- Workaround: Use `mermaid.run({ nodes: [containerRef.current] })` (Mermaid v10+ API).

**Mermaid diagram renderer does not set inner content correctly:**
- Symptoms: The `MermaidViewer` renders `{definition}` as JSX text children in a `div.mermaid`. Mermaid's `contentLoaded()` / `run()` scans for `.mermaid` class elements and parses their `textContent`. React rendering this as JSX children should work, but combined with the deprecated API above, diagram rendering will silently fail.
- Files: `frontend/src/components/Diagram/MermaidViewer.tsx`
- Trigger: All diagram displays.
- Workaround: Set `containerRef.current.innerHTML = definition` before calling `mermaid.run()`.

**`conversation_id` accepted by API but never used:**
- Symptoms: `ChatRequest` model includes `conversation_id: Optional[str]` but the field is never read, stored, or passed to any component. Multi-turn context is silently dropped.
- Files: `backend/src/api/routes.py` (line 21)
- Trigger: Any follow-up message in a conversation.
- Workaround: None; each message is treated as a fresh request.

---

## Security Considerations

**AWS credentials implicitly required but not documented:**
- Risk: `backend/src/services/pricing.py` calls `boto3.client('pricing', region_name='us-east-1')` without explicit credentials. boto3 uses the default credential chain (env vars, `~/.aws`, instance profile). If `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` are not set, the Pricing API call will fail silently.
- Files: `backend/src/services/pricing.py` (line 9)
- Current mitigation: None. `.env.example` does not mention AWS credentials.
- Recommendations: Document required AWS credentials in `.env.example` with `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`. Alternatively, scope to a minimal IAM policy for `pricing:GetProducts` only.

**LLM API key exposed risk:**
- Risk: `LLM_API_KEY` is used directly in four separate class constructors (`advisor.py`, `extractor.py`, `cost_analyzer.py`, `tradeoff_analyzer.py`). If any unhandled exception leaks the key into logs or responses, it is exposed.
- Files: `backend/src/core/advisor.py`, `backend/src/core/extractor.py`, `backend/src/core/cost_analyzer.py`, `backend/src/core/tradeoff_analyzer.py`
- Current mitigation: Key is loaded from env var, not hardcoded.
- Recommendations: Create a single shared LLM client factory to centralise key access. Ensure exception handlers do not include the full `Exception` object in API responses.

**No input validation or size limits on chat messages:**
- Risk: The `/api/v1/chat` endpoint accepts arbitrary-length strings. A large input can cause excessive LLM token usage and cost.
- Files: `backend/src/api/routes.py`, `backend/src/models/workload.py`
- Current mitigation: None.
- Recommendations: Add a `max_length` validator on `ChatRequest.message` using Pydantic's `Field(max_length=2000)`.

**No authentication on any endpoint:**
- Risk: All API endpoints (`/api/v1/chat`, `/api/v1/knowledge/upload`, `/api/v1/knowledge/status/{id}`) are completely unauthenticated. Any client can trigger LLM inference calls that incur cost.
- Files: `backend/src/api/routes.py`, `backend/src/api/knowledge.py`
- Current mitigation: None.
- Recommendations: Add at minimum a static API key check as FastAPI dependency for non-demo deployments.

**Uploaded files stored with predictable paths:**
- Risk: `backend/src/api/knowledge.py` stores uploaded files as `data/uploads/{uuid}_{original_filename}`. The original filename is user-controlled and not sanitized.
- Files: `backend/src/api/knowledge.py` (line 28)
- Current mitigation: UUID prefix reduces guessability.
- Recommendations: Use `pathlib.Path(file.filename).name` to strip directory components and sanitize the filename before use.

---

## Performance Bottlenecks

**Five sequential LLM API calls per chat request:**
- Problem: A single `/api/v1/chat` request triggers 4 separate LLM calls in sequence: (1) `RequirementExtractor.extract()`, (2) `ArchitectureAdvisor.get_recommendation()`, (3) `TerraformGenerator.generate()`, (4) `CloudFormationGenerator.generate()`. Additionally `CostAnalyzer.estimate_costs()` makes a 5th LLM call to extract billable resources. Each call is independently blocking.
- Files: `backend/src/api/routes.py` (lines 37–51)
- Cause: No parallelism; all calls are `await`-less invocations of synchronous LangChain methods in an async FastAPI handler.
- Improvement path: Run Terraform, CloudFormation, and Cost Analyzer calls concurrently with `asyncio.gather()` after the initial recommendation is obtained. Use async LangChain client if available.

**GraphRAG query is a naive full-table scan:**
- Problem: `ArchitectureAdvisor.get_recommendation()` runs `MATCH (s:AWS_Service)-[:ALIGNS_WITH]->(p:WellArchitected_Pillar) RETURN ... LIMIT 20` — fetching 20 arbitrary services regardless of the actual workload requirements. No filtering by traffic pattern, region, or use case.
- Files: `backend/src/core/advisor.py` (lines 25–29)
- Cause: GraphRAG filtering logic not implemented (see TODO at line 33).
- Improvement path: Parameterize the Cypher query using extracted `requirements` (e.g., filter by pillar alignment based on `high_availability`, `data_residency`).

**No streaming on LLM responses:**
- Problem: All LLM calls use `.invoke()` which blocks until the full response is generated. Users see no output until all processing (~30+ seconds) completes.
- Files: `backend/src/core/advisor.py`, `backend/src/core/extractor.py`, `backend/src/core/cost_analyzer.py`
- Cause: Synchronous blocking LLM invocation pattern throughout.
- Improvement path: Use FastAPI `StreamingResponse` with LangChain `.astream()` for at least the main advisor response.

---

## Fragile Areas

**Mermaid extraction via regex is brittle:**
- Files: `backend/src/core/diagrammer.py`
- Why fragile: Regex `r"```(?:mermaid)?\s*(.*?)```"` will incorrectly extract the first code block in the response, even if it is a Terraform or CloudFormation block rather than a Mermaid diagram. Since all three (diagram, Terraform, CloudFormation) are extracted from the same `advice_text` string, the wrong block may be used.
- Safe modification: Make the advisor prompt output diagrams in a clearly labelled section (e.g., `### DIAGRAM`) and extract by section header rather than by code fence language.
- Test coverage: One unit test covers happy path; no test for multi-block responses or responses without diagrams.

**LLM JSON parsing uses bare `json.loads()` without schema validation:**
- Files: `backend/src/core/extractor.py` (line 29), `backend/src/core/cost_analyzer.py` (line 33)
- Why fragile: If the LLM returns malformed JSON or unexpected field names, `json.loads()` raises `JSONDecodeError` or produces a dict that silently omits required keys. The fallback in `extractor.py` returns `user_count: 0` and `high_availability: False`, which are valid defaults that mask extraction failure.
- Safe modification: Use Pydantic model validation on the parsed dict to enforce schema and surface extraction failures explicitly.
- Test coverage: No tests for malformed LLM output scenarios.

**Knowledge base indexing is a no-op stub:**
- Files: `backend/src/api/knowledge.py` (lines 14–21)
- Why fragile: `index_document()` background task only sleeps for 5 seconds and does nothing. `GET /status/{document_id}` always returns `"status": "indexed"` and `"chunk_count": 42` regardless of whether any document was actually processed.
- Safe modification: Implement real PDF parsing (e.g., using `pypdf` or `langchain.document_loaders.PyPDFLoader`) and Neo4j vector insertion before marking as indexed.
- Test coverage: No tests for indexing pipeline.

---

## Missing Critical Features

**Document ingestion pipeline (`ingestor.py`) not created:**
- Problem: Task T030 in `tasks.md` requires `backend/src/services/ingestor.py` implementing the AWS Well-Architected PDF ingestion pipeline. This file does not exist.
- Blocks: The vector search path in `advisor.py` (marked TODO), full GraphRAG retrieval quality, and the Knowledge Base upload feature working end-to-end.
- Files: Missing `backend/src/services/ingestor.py`

**Vector retrieval not implemented in advisor:**
- Problem: `backend/src/core/advisor.py` (line 33) has `# TODO: Implement vector retrieval from 'aws_document_chunks' index`. The RAG retrieval is graph-only (a full scan) with no semantic vector search over ingested documents.
- Blocks: FR-002 (Well-Architected Framework grounding), SC-001 (90% accuracy on canonical questions).
- Files: `backend/src/core/advisor.py`

**`TradeoffAnalyzer` exists but is never invoked:**
- Problem: `backend/src/core/tradeoff_analyzer.py` implements `TradeoffAnalyzer.analyze()` but it is not imported or called anywhere in `backend/src/api/routes.py`. The trade-off analysis is expected to come from the main advisor prompt only.
- Blocks: FR-006 (explicit service comparison), User Story 3 acceptance criteria.
- Files: `backend/src/core/tradeoff_analyzer.py` is dead code; `backend/src/api/routes.py` missing integration.

**`TradeOffView` frontend component never rendered:**
- Problem: `frontend/src/components/Tradeoff/Comparison.tsx` exists but is never imported or used in `ChatBox.tsx`. There is no `tradeoff` field in the `Message` interface or in the `ChatResponse` API contract.
- Blocks: User Story 3 visual trade-off display.
- Files: `frontend/src/components/Tradeoff/Comparison.tsx`, `frontend/src/components/Chat/ChatBox.tsx`

**`frontend/src/components/Chat/Message.tsx` referenced in tasks but missing:**
- Problem: Task T021 (`tasks.md` line 69) references `frontend/src/components/Chat/Message.tsx` for IaC display integration. This file does not exist. IaC rendering is instead inline in `ChatBox.tsx`.
- Blocks: Separation of concerns; makes ChatBox a monolith for all message rendering.
- Files: Missing `frontend/src/components/Chat/Message.tsx`

**No Neo4j seed data — graph is empty on first run:**
- Problem: `KnowledgeBaseService` initialises the schema (constraints, vector index) but no seed data loader exists to populate `AWS_Service`, `WellArchitected_Pillar`, or `Arch_Pattern` nodes. On first startup, the GraphRAG query returns zero results and the advisor operates with empty context.
- Blocks: Any meaningful recommendation quality without manual seeding.
- Files: `backend/src/services/knowledge_base.py` (has `add_service()` and `link_service_to_pillar()` helpers but no seeder that calls them)

**No conversation history / multi-turn support:**
- Problem: `conversation_id` field is accepted by the API but never used. Each message is stateless; the LLM has no prior context. Spec assumption A-001 implies conversational interaction.
- Blocks: Follow-up clarification questions (Edge Case: vague descriptions), iterative refinement.
- Files: `backend/src/api/routes.py`

---

## Spec vs Implementation Gaps

**Health check missing service status:**
- Spec (`contracts/api-spec.md`): `GET /health` should return `{"status": "ok", "services": {"neo4j": "up", "llm": "up"}}`.
- Implementation (`backend/src/main.py`): Returns only `{"status": "ok"}` with no dependency health checks.

**Cost breakdown missing `unit` and `quantity` fields:**
- Spec (`contracts/api-spec.md`): Cost breakdown items should include `service`, `cost`, `is_calculated`. Data model spec (`data-model.md`) includes `unit`, `quantity` in the JSON schema.
- Implementation: `CostAnalyzer.estimate_costs()` returns items with only `service`, `cost`, `is_calculated`. `unit` and `quantity` are not populated.
- Files: `backend/src/core/cost_analyzer.py`

**FR-007 missing from spec but gap exists:**
- Spec: Requirements jump from FR-006 to FR-008 (no FR-007 defined). No vague-input detection is implemented.
- Implementation: No logic to detect under-specified workload descriptions and prompt for missing dimensions (Edge Case in spec).
- Files: `backend/src/core/extractor.py`, `backend/src/api/routes.py`

**SC-002: IaC linting not integrated:**
- Spec: SC-002 states generated IaC must pass `tflint`/`cfn-lint` 100% of the time.
- Implementation: No linting step in CI, no lint-on-generate logic, no test that actually runs a linter.
- Files: `backend/tests/` (no linting test exists)

**Eval results file appears pre-populated with fabricated scores:**
- Problem: `backend/tests/evals/results.md` shows all metrics passing with scores (0.88, 0.92, etc.) dated 2026-05-09. The eval test (`test_rag_evals.py`) uses hardcoded mock inputs unconnected to the live system. With an empty Neo4j graph and stub indexing, these results cannot reflect actual system performance.
- Files: `backend/tests/evals/results.md`, `backend/tests/evals/test_rag_evals.py`
- Risk: Misleading quality signal; masks that the RAG pipeline is non-functional end-to-end.

---

## Test Coverage Gaps

**No tests for `ArchitectureAdvisor` (core RAG logic):**
- What's not tested: GraphRAG retrieval, LLM prompt formatting, Neo4j interaction, error handling in `get_recommendation()`.
- Files: `backend/src/core/advisor.py`
- Risk: Silent failures if Neo4j schema changes or LLM response format changes.
- Priority: High

**No tests for `CostAnalyzer`:**
- What's not tested: LLM resource extraction, pricing API integration, EC2 cost calculation, non-EC2 service handling.
- Files: `backend/src/core/cost_analyzer.py`
- Risk: Cost estimates could be silently zero for all services without detection.
- Priority: High

**No tests for `TerraformGenerator` or `CloudFormationGenerator`:**
- What's not tested: Template structure, code fence extraction, error handling.
- Files: `backend/src/core/iac/terraform.py`, `backend/src/core/iac/cloudformation.py`
- Risk: Spec SC-002 (lint-passing IaC) has no automated enforcement.
- Priority: High

**No frontend tests whatsoever:**
- What's not tested: All React components (`ChatBox`, `CostTable`, `MermaidViewer`, `CodeSnippet`, `TradeOffView`, `KnowledgeBase`).
- Files: `frontend/src/` (no `*.test.*` or `*.spec.*` files found)
- Risk: TypeScript type error in `CostTable.tsx` (`bool` vs `boolean`) would be caught by compilation but no runtime/render tests exist.
- Priority: Medium

**Eval test uses fully static mock data:**
- What's not tested: The actual live pipeline (Neo4j retrieval → LLM → response).
- Files: `backend/tests/evals/test_rag_evals.py`
- Risk: Eval metrics reflect quality of hardcoded mock data, not the running system.
- Priority: High

---

*Concerns audit: 2025-01-30*

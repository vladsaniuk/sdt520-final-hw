# Features Research

**Project:** AWS Architecture Advisor (GraphRAG chat)
**Researched:** 2025-01-30
**Confidence:** HIGH — based on direct codebase audit + milestone context

---

## Context: What the Scaffold Has vs. What's Needed

The existing codebase has the correct *shape* but is functionally hollow:

| Component | Exists | Functional |
|-----------|--------|------------|
| FastAPI `/chat` endpoint | ✓ | ✗ — returns `"mock-uuid"`, no history |
| FastAPI `/knowledge/upload` | ✓ | ✗ — 5-second sleep stub |
| FastAPI `/knowledge/status` | ✓ | ✗ — always returns `"indexed: 42"` |
| Neo4j graph schema + vector index | ✓ | ✗ — empty, no seed data |
| GraphRAG Cypher query | ✓ | ✗ — LIMIT 20 full-table scan |
| Vector search retrieval | ✗ | ✗ — TODO comment in advisor.py |
| Multi-turn conversation history | ✗ | ✗ — `conversation_id` accepted, never used |
| Mermaid diagram renderer | ✓ | ✗ — deprecated `contentLoaded()` API |
| Terraform snippet generator | ✓ | ~ — works but as isolated LLM call |
| Plan approval → Terraform download | ✗ | ✗ — not implemented anywhere |
| TradeoffAnalyzer | ✓ | ✗ — dead code, never wired |
| TypeScript compilation | ✓ | ✗ — `bool` vs `boolean` type error |

---

## Table Stakes

Features that must exist for the tool to be usable at all. Missing any one of these = the demo is broken.

| Feature | Why Required | Complexity | Current State |
|---------|--------------|------------|---------------|
| **Bug fixes: TypeScript + Mermaid API** | Frontend doesn't compile (`bool` type error); diagram rendering silently fails (`mermaid.contentLoaded()` removed in v10+). Every other feature depends on a working frontend. | Low | Broken — 2 known bugs |
| **Neo4j seed data** | Graph query (`MATCH (s:AWS_Service)-[:ALIGNS_WITH]->(p:WellArchitected_Pillar)`) returns zero rows on first boot. LLM receives empty context → generic, unjustified advice. | Medium | Missing — seeder script does not exist |
| **Real document ingestion pipeline** | The knowledge base upload endpoint does a 5-second `asyncio.sleep` and nothing else. Without real PDF/markdown parsing → chunking → embedding → Neo4j upsert, the "GraphRAG-powered" claim is false. | High | Stub only — `ingestor.py` doesn't exist |
| **Ingestion status that reflects reality** | `GET /status/{id}` always returns `{"status": "indexed", "chunk_count": 42}`. UI can't show progress or errors. | Low | Hardcoded mock |
| **Multi-turn conversation history** | `conversation_id` is in the API contract but is silently dropped. The LLM sees no prior messages. Every follow-up question starts from scratch. Iterative refinement — the core UX — is impossible. | Medium | Accepted but ignored in `routes.py` |
| **Real recommendation IDs** | Every response returns `recommendation_id: "mock-uuid"`. No plan can be referenced, retrieved, or linked to a download. | Low | Hardcoded — one-line fix |
| **Stable unified plan response** | The response shape (text + diagram + iac + costs) is correct, but diagram extraction is brittle regex that picks the first code fence regardless of type. Needs structured prompt output with labelled sections, not regex fishing. | Medium | Fragile — regex in `diagrammer.py` |
| **Plan approval → Terraform download** | Core value prop per PROJECT.md: "Once satisfied with the plan, users can generate and download a Terraform config ready to deploy on AWS." No approval signal, no download endpoint, no file delivery exists anywhere. | Medium | Not implemented |

---

## Differentiators

Features that distinguish this tool from generic AI chat. Not strictly required for the tool to run, but required for it to be valuable.

| Feature | Value Proposition | Complexity | Current State |
|---------|-------------------|------------|---------------|
| **Parameterized GraphRAG retrieval** | Instead of `LIMIT 20` full-table scan, filter Cypher query by extracted requirements (e.g., `high_availability: true` → filter for Reliability-pillar services; `user_count > 100000` → filter for scalability patterns). Makes recommendations actually grounded in context. | Medium | TODO comment in `advisor.py` line 33 |
| **Vector search augmentation** | After graph retrieval, run kNN similarity search over `Document_Chunk` nodes (using the `aws_document_chunks` vector index already defined in schema) to retrieve relevant passages from user-uploaded docs. Inject retrieved text into LLM context. This is the "RAG" in GraphRAG. | High | Vector index defined; retrieval not implemented |
| **Trade-off analysis surface** | `TradeoffAnalyzer.analyze()` exists and works but is never called from `routes.py`. `TradeOffView` component exists but is never rendered in `ChatBox.tsx`. Wire these together: explicit service comparison table (e.g., "Lambda vs ECS Fargate: cost, cold start, ops overhead"). | Medium | Dead code — wiring only |
| **Vague input detection + clarification prompts** | When workload description is under-specified (no traffic estimates, no region, no data residency requirements), ask clarifying questions before generating a plan instead of producing a generic recommendation. Mentioned in spec as an edge case; no implementation exists. | Medium | Not implemented |
| **Concurrent LLM call pipeline** | Currently 5 sequential blocking LLM calls per chat request: RequirementExtractor → ArchitectureAdvisor → TerraformGenerator → CloudFormationGenerator → CostAnalyzer. After the initial recommendation, Terraform and Cost calls can run concurrently via `asyncio.gather()`. Reduces response time from ~30s to ~15s. | Medium | Sequential blocking in `routes.py` |
| **LLM response streaming** | Use FastAPI `StreamingResponse` + LangChain `.astream()` for the main advisor response. Users see text appearing progressively instead of a 30+ second blank wait. Requires SSE handling in frontend. | High | All calls use `.invoke()` (blocking) |
| **Conversation-aware plan refinement** | With history working, allow messages like "Make it more cost-optimized" or "Add multi-AZ redundancy" to modify the existing plan rather than generate a new one. Requires the LLM to receive prior plan context and the frontend to maintain `conversation_id`. | Medium | Blocked by missing history feature |

---

## Anti-Features (v1)

Things to deliberately **not** build. Each has a reason and a "instead" guidance.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Authentication / user accounts** | Demo tool — PROJECT.md explicitly out of scope. Login adds auth service, session management, token handling. Zero user-facing value for a single-user demo. | Keep CORS open (`allow_origins=["*"]`) is fine for demo; document it as demo-only |
| **Multi-cloud (GCP / Azure) Terraform** | Each cloud provider adds a full set of resource mappings, pricing API integrations, and graph nodes. AWS alone is the v1 scope. | Leave `CloudFormationGenerator` dormant; don't add GCP/Azure providers |
| **CloudFormation output** | CF generator exists but Terraform is the v1 IaC target. Generating both adds surface area and a 6th LLM call with no v1 requirement. | Keep `cloudformation.py` code but don't expose CF in the API response |
| **PostgreSQL persistence** | SQLAlchemy models are dead code — no DB engine, no container, no connection string. Adding PostgreSQL now means container orchestration changes, migration tooling, and session management. Neo4j is the sole store. | Delete `backend/src/models/workload.py` and `psycopg2-binary` from `requirements.txt` |
| **IaC linting (tflint / cfn-lint)** | SC-002 spec requirement but would need linting binaries in the container, a lint-on-generate pass, and CI enforcement. Out of proportion for a v1 demo. | Note as a future milestone quality gate |
| **Multi-file batch upload** | Single file at a time is sufficient for demo use case. Batch adds progress tracking complexity and concurrent indexing coordination. | One file per upload request; users can upload multiple files sequentially |
| **Webhook / push notifications for ingestion complete** | Polling `GET /status/{id}` is adequate for a demo. WebSocket or webhook infrastructure adds unnecessary complexity. | Frontend polls status every 2s until `indexed`; simple and reliable |
| **Custom embedding model selection** | OpenAI `text-embedding-ada-002` (1536 dims, matching the vector index definition) is the correct default. Model selection UI adds config surface area with no v1 value. | Hard-code the embedding model in ingestor; make it an env var for flexibility without UI |
| **Chat history export / sharing** | No auth means no user identity means no meaningful share target. Export adds file generation with no clear consumer. | In-memory history is sufficient; cleared on page reload |
| **Real-time cost calculator UI** | The cost estimate comes from the LLM + AWS Pricing API at recommendation time. An interactive slider-based cost estimator would require a separate pricing service architecture. | Show the static cost table returned per recommendation |

---

## Feature Dependencies

Critical ordering constraints for implementation:

```
Bug fixes (TypeScript bool→boolean, Mermaid API)
    └── All frontend features render correctly

Neo4j seed data
    └── Graph query returns non-empty results
        └── LLM receives service context
            └── Meaningful recommendations (even without user docs)

Real document ingestion pipeline (ingestor.py)
    └── Chunks + embeddings in Neo4j
        └── Vector search augmentation works
            └── Recommendations grounded in user's own docs

Real recommendation IDs (uuid.uuid4())
    └── Plan approval flow can reference a specific plan

Multi-turn conversation history
    └── conversation_id stored in-memory
        └── LLM receives message history
            └── Iterative plan refinement ("make it cheaper")
                └── Plan approval flow (user refines until satisfied)
                    └── Terraform download (user downloads approved plan)

Stable unified plan response (structured sections not regex)
    └── Diagram always renders correctly
        └── Plan approval is meaningful (user can see the plan)
            └── Terraform download (download the plan they approved)

Parameterized GraphRAG retrieval
    └── Vector search augmentation
        └── Full GraphRAG quality (graph + semantic)
```

### Blocking Dependencies Summary

| Blocked Feature | Blocked By |
|----------------|-----------|
| Any frontend rendering | Bug fixes (TypeScript, Mermaid) |
| Meaningful GraphRAG output | Neo4j seed data |
| RAG grounding in user docs | Working document ingestion |
| Iterative refinement | Multi-turn conversation history |
| Plan approval flow | Multi-turn history + Real recommendation IDs |
| Terraform download | Plan approval flow |
| Trade-off surface | History (context needed) + wiring dead code |
| Vector search | Working ingestion pipeline |

---

## MVP Recommendation

Build in this order — each step unblocks the next:

1. **Bug fixes** — TypeScript type error, Mermaid `mermaid.run()` migration, `import json` placement, real UUIDs. 30 minutes. Unblocks everything.
2. **Neo4j seed data + remove dead code** — Write seeder with ~20 core AWS services linked to Well-Architected pillars. Delete SQLAlchemy models + psycopg2. Gives the graph query something to return.
3. **Working document ingestion** — `ingestor.py` with `pypdf`/`PyPDFLoader`, chunking, `text-embedding-ada-002` embeddings, Neo4j `Document_Chunk` upsert. Real ingestion status tracking. This is the highest-complexity item.
4. **Multi-turn conversation history** — In-memory dict `conversation_id → [messages]`, pass history to LangChain chain. Enables all refinement UX.
5. **Stable unified plan response** — Switch from regex extraction to structured prompt sections (`### DIAGRAM`, `### SERVICES`, `### TERRAFORM_SNIPPET`, `### COSTS`). Reliable parsing.
6. **Plan approval → Terraform download** — Detect approval signal in chat (or add approve button), call a `/api/v1/recommendations/{id}/terraform` endpoint, return `.tf` file as attachment.

**Defer for polish:**
- Parameterized GraphRAG retrieval (improves quality, not a blocker)
- Vector search augmentation (improves quality, needs ingestion first)
- Trade-off analysis wiring (nice differentiator, not blocking)
- Concurrent LLM calls (performance, not correctness)
- LLM streaming (UX, not correctness)
- Vague input detection (edge case handling)

---

## Sources

- Direct codebase audit: `backend/src/api/routes.py`, `knowledge.py`, `advisor.py`, `iac/terraform.py`, `services/knowledge_base.py`
- Direct frontend audit: `frontend/src/components/Chat/ChatBox.tsx`, `Diagram/MermaidViewer.tsx`
- `.planning/PROJECT.md` — validated requirements, out of scope items
- `.planning/codebase/CONCERNS.md` — known bugs, tech debt, missing features audit
- Confidence: HIGH — all findings from direct source code inspection, no inference required

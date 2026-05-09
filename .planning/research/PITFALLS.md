# Pitfalls Research

**Project:** AWS Architecture Advisor (GraphRAG Chat Application)
**Domain:** GraphRAG + LangChain + Neo4j + FastAPI + React
**Researched:** 2025-01-30
**Sources:** Direct codebase audit of `backend/src/` and `frontend/src/`, CONCERNS.md analysis, known Neo4j/LangChain ecosystem failure patterns
**Confidence:** HIGH — all pitfalls are grounded in the actual code, not generic advice

---

## Critical Pitfalls

Mistakes that cause silent failures, rewrites, or broken end-to-end behaviour.

---

### CP-1: Neo4j Startup Race — Backend Crashes on `docker compose up`

**What goes wrong:**
`docker-compose.yml` uses `depends_on: neo4j` but this only waits for the container to *start*, not for Neo4j to finish its ~30-second initialization sequence. The backend starts, immediately tries `GraphDatabase.driver(...)` and `Neo4jGraph(...)`, and the connection is refused. FastAPI crashes or silently swallows the error, and all graph operations return `ServiceUnavailable`.

**Why it happens:**
Docker Compose's `depends_on` is not health-aware by default. Neo4j 5.x runs migrations and plugin initialization (APOC, GDS) before the Bolt port is open. There is no `healthcheck:` configured on the `neo4j` service in the current `docker-compose.yml`.

**Consequences:**
- `docker compose up` appears to work but the backend never connects to Neo4j
- `KnowledgeBaseService.initialize_schema()` is never called (it has no startup hook), so constraints and the vector index are never created
- All `MATCH (s:AWS_Service)...` queries return empty results silently

**Warning signs:**
- Backend logs show `ServiceUnavailable: Cannot connect to Bolt` at startup
- Chat endpoint returns `"I encountered an error while generating your recommendation."` for all requests

**Prevention:**
Add a `healthcheck` to the neo4j service and `depends_on.condition: service_healthy` on the backend:
```yaml
neo4j:
  healthcheck:
    test: ["CMD", "cypher-shell", "-u", "neo4j", "-p", "${NEO4J_PASSWORD:-password}", "RETURN 1"]
    interval: 10s
    timeout: 5s
    retries: 10

backend:
  depends_on:
    neo4j:
      condition: service_healthy
```
Also add a FastAPI `@app.on_event("startup")` lifespan handler that calls `kb_service.initialize_schema()` with retry logic.

**Phase:** Docker Compose / Infrastructure wiring phase (earliest phase)

---

### CP-2: `initialize_schema()` Never Called — Vector Index and Constraints Never Created

**What goes wrong:**
`KnowledgeBaseService.initialize_schema()` creates the `aws_document_chunks` vector index and uniqueness constraints. It is defined but never invoked anywhere in the application startup path. On a fresh Neo4j instance, there are no constraints and no vector index. When `knowledge.py`'s real ingestion eventually calls `CREATE` on `Document_Chunk` nodes or runs vector queries, these operations silently fail or produce no results.

**Why it happens:**
The method exists as a standalone helper. No `@app.on_event("startup")` hook or lifespan handler in `main.py` calls it.

**Consequences:**
- Vector similarity search via `aws_document_chunks` index raises `Index Not Found` in Neo4j
- `MERGE` on `AWS_Service` without the uniqueness constraint creates duplicate nodes
- Duplicate nodes cause Cypher `MATCH` queries to return noise results

**Warning signs:**
- Neo4j browser shows no indexes under `:schema`
- Upload → index pipeline produces duplicate `AWS_Service` nodes
- Vector search returns `ClientError: There is no such index`

**Prevention:**
Add to `backend/src/main.py`:
```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    kb_service = KnowledgeBaseService()
    kb_service.initialize_schema()
    yield
    kb_service.close()

app = FastAPI(lifespan=lifespan)
```

**Phase:** Knowledge base ingestion phase

---

### CP-3: Synchronous LangChain `.invoke()` Blocks the FastAPI Event Loop

**What goes wrong:**
`routes.py` is an `async def chat(...)` handler, but every LangChain call (`extractor.extract()`, `advisor.get_recommendation()`, `tf_gen.generate()`, `cfn_gen.generate()`, `cost_analyzer.estimate_costs()`) is synchronous `.invoke()`. FastAPI runs these on the same thread as the event loop. Under any concurrent load, the event loop is blocked for the 30-60 seconds required to complete all 5 sequential LLM round-trips. No other request can be processed during that time.

**Why it happens:**
LangChain's `ChatOpenAI.invoke()` is synchronous. An `async def` FastAPI handler calling sync blocking code does not automatically get offloaded to a thread pool — it blocks the loop directly unless wrapped with `asyncio.run_in_executor`.

**Consequences:**
- 2 concurrent users = each waits 60+ seconds
- Health checks time out during LLM processing
- Docker Compose restarts the backend container due to health-check failures

**Warning signs:**
- `GET /health` returns 503 while a single chat request is in-flight
- Browser shows "pending" for all requests issued while one chat is processing

**Prevention:**
Replace `.invoke()` with `.ainvoke()` (LangChain async) and `await` the calls:
```python
response = await self.llm.ainvoke(formatted_prompt)
```
Run the independent IaC/cost calls concurrently:
```python
tf_task, cfn_task, cost_task = await asyncio.gather(
    tf_gen.agenerate(advice_text),
    cfn_gen.agenerate(advice_text),
    cost_analyzer.aestimate_costs(advice_text)
)
```

**Phase:** Chat endpoint implementation / performance phase

---

### CP-4: `conversation_id` Accepted but Silently Discarded — Multi-Turn is Broken by Design

**What goes wrong:**
`ChatRequest.conversation_id` is accepted by the API but never read, stored, or threaded into any LangChain component. Every message starts a fresh conversation. The LLM has no memory of previous turns. A user who says "make it more cost-effective" in a follow-up message gets a response with zero context about what was previously recommended.

**Why it happens:**
`routes.py` line 21 declares the field. Lines 37–51 never reference it. LangChain `ConversationBufferMemory` or equivalent was never integrated.

**Consequences:**
- The "iterative refinement" core value proposition does not work
- Refinement messages ("change to ECS instead of EKS") generate irrelevant responses
- Users must repeat the full workload description in every message

**Warning signs:**
- Any follow-up like "use smaller instances" produces a generic response, not a modification
- Backend logs show no `conversation_id` being used anywhere

**Prevention:**
Implement conversation history using LangChain's memory or manual message accumulation:
```python
# Option A: Per-conversation in-memory store (demo-appropriate)
conversations: Dict[str, List[BaseMessage]] = {}

def get_or_create_history(conv_id: str) -> List[BaseMessage]:
    return conversations.setdefault(conv_id, [])
```
Then pass history to the LLM as `messages` parameter. Use `conversation_id = str(uuid4())` on first turn, return it in the response so the frontend can thread it back.

**Phase:** Multi-turn chat implementation phase

---

### CP-5: Mermaid Regex Extracts First Code Block, Not the Diagram Block

**What goes wrong:**
`diagrammer.py` uses `r"```(?:mermaid)?\s*(.*?)```"` with no language specifier enforcement. The pattern matches the *first* code block in the advisor's response. The ADVISOR_PROMPT asks for: architecture overview, service selection, trade-off analysis, and a Mermaid diagram — in that order. LLMs frequently emit service configuration snippets or JSON examples before the diagram. When they do, `extract_mermaid()` returns the config snippet, not the diagram, and the frontend renders garbage.

**Why it happens:**
The regex does not anchor to the `mermaid` language tag — `(?:mermaid)?` makes it optional. Any code fence matches.

**Consequences:**
- `MermaidViewer` receives YAML/JSON/Terraform text instead of a diagram definition
- Mermaid.js `run()` throws a parse error and renders nothing (silently, due to the deprecated API on top of this)

**Warning signs:**
- Diagram panel shows blank or an error instead of a flowchart
- `diagram` field in the API response contains `provider "aws"` or JSON

**Prevention:**
1. Change the prompt to output the diagram in a clearly labelled section: `### ARCHITECTURE_DIAGRAM\n\`\`\`mermaid\n...\`\`\``
2. Extract by section header, not just code fence:
```python
section = re.search(r"### ARCHITECTURE_DIAGRAM.*?```mermaid\s*(.*?)```", text, re.DOTALL)
```
3. If section-based extraction fails, fall back to fence with mandatory `mermaid` language tag only:
```python
re.search(r"```mermaid\s+(.*?)```", text, re.DOTALL)
```

**Phase:** Prompt engineering / diagram rendering phase

---

### CP-6: LLM JSON Parsing Via String Split — IndexError on Unexpected Output

**What goes wrong:**
Both `extractor.py` and `cost_analyzer.py` parse LLM JSON output with:
```python
content = content.split("```json")[1].split("```")[0]
```
If the LLM returns valid JSON *without* a code fence wrapper (which is common when prompted with "Output as JSON"), `split("```json")` returns a list of length 1. Indexing `[1]` raises `IndexError`. This is caught by the bare `except Exception` handler which silently returns the fallback dict `{"traffic_pattern": "unknown", ..., "high_availability": False}`.

**Why it happens:**
LLMs inconsistently wrap JSON in code fences. The extraction logic handles the fenced case and the raw case, but the split-based approach raises before reaching the fallback.

**Consequences:**
- Requirement extraction silently fails for a significant fraction of inputs
- `advisor.get_recommendation()` receives `user_count: 0, high_availability: False` for every request where the LLM returned plain JSON
- The Cypher query runs with wrong requirements — recommendations are not grounded in the actual workload

**Warning signs:**
- Backend logs: `[Extractor] Error during requirement extraction: list index out of range`
- All chat responses include the same generic fallback recommendations regardless of the workload described

**Prevention:**
Use a robust JSON extraction approach:
```python
import re

def extract_json(content: str) -> dict:
    # Try fenced first
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
    if m:
        return json.loads(m.group(1))
    # Try raw JSON object anywhere in the string
    m = re.search(r"\{.*\}", content, re.DOTALL)
    if m:
        return json.loads(m.group(0))
    raise ValueError("No JSON found in LLM response")
```
Then validate with a Pydantic model to surface schema mismatches explicitly.

**Phase:** Core extraction / LLM response parsing (implement once, used everywhere)

---

### CP-7: Neo4j Graph Is Empty on First Run — GraphRAG Returns Zero Context

**What goes wrong:**
`KnowledgeBaseService` creates the schema but no code seeds `AWS_Service`, `WellArchitected_Pillar`, or `Arch_Pattern` nodes. On a fresh install, the advisor's Cypher query:
```cypher
MATCH (s:AWS_Service)-[:ALIGNS_WITH]->(p:WellArchitected_Pillar) RETURN ... LIMIT 20
```
returns an empty list. `graph_context = []` is passed to the ADVISOR_PROMPT as `str([])`. The LLM produces a recommendation anyway (using its own training data), but it is not grounded in the user's uploaded knowledge base. This breaks the core GraphRAG value proposition.

**Why it happens:**
There is no seed script, no migration tool, and no data import at startup. The `add_service()` and `link_service_to_pillar()` helpers exist but nothing calls them.

**Consequences:**
- All recommendations are pure LLM hallucination, not graph-grounded
- Upload → index flow doesn't help because vector retrieval is also a TODO stub
- Eval metrics in `results.md` (0.88, 0.92) are fabricated against hardcoded mocks, not the live system

**Warning signs:**
- Neo4j browser: `MATCH (n) RETURN count(n)` returns 0
- API responses are long and confident but reference no uploaded documents

**Prevention:**
Create `backend/src/services/seeder.py` with static seed data for AWS services and Well-Architected pillars. Call it in the startup lifespan handler (after `initialize_schema()`). For the full GraphRAG path, implement the vector ingestion pipeline in `ingestor.py` that:
1. Parses PDF/Markdown with `langchain.document_loaders`
2. Chunks with `RecursiveCharacterTextSplitter`
3. Embeds with `OpenAIEmbeddings` (matching the 1536-dim index)
4. Stores as `Document_Chunk` nodes with `embedding` property in Neo4j

**Phase:** Knowledge base ingestion phase (highest priority to unblock everything)

---

## Common Mistakes

Issues that degrade quality or cause subtle bugs, but don't cause total failure.

---

### CM-1: Two Separate Neo4j Connection Pools — Resource Exhaustion Under Load

**What goes wrong:**
`knowledge_base.py` uses `neo4j.GraphDatabase.driver(...)` (raw driver). `advisor.py` uses `langchain_community.graphs.Neo4jGraph(...)`. Both are instantiated at module load time in `routes.py` and `knowledge.py`. Under load, this doubles Neo4j connection pool usage and can exhaust the default pool (100 connections in Neo4j Community).

**Prevention:**
Create a single `neo4j_driver` singleton in `main.py` and pass it to all services, or use `Neo4jGraph` exclusively (it wraps the driver). Close the driver gracefully in the shutdown lifespan handler.

**Phase:** Refactoring / service layer phase

---

### CM-2: Five Separate `ChatOpenAI` Instances — No Shared Client or Rate Limiting

**What goes wrong:**
`extractor.py`, `advisor.py`, `terraform.py`, `cloudformation.py`, and `cost_analyzer.py` each instantiate `ChatOpenAI(...)` independently. No rate limiting, no shared retry config, no timeout configuration. A single request that hits OpenRouter rate limits will fail in whatever call it's on, with no coordinated backoff.

**Prevention:**
Create a `backend/src/core/llm_client.py` factory that returns a shared `ChatOpenAI` instance with standardized `timeout`, `max_retries`, and optional rate limiting middleware. All five classes should import from the factory.

**Phase:** LLM integration phase

---

### CM-3: Terraform Prompt Generates Both HCL and YAML, Then Tries to Filter

**What goes wrong:**
`IAC_PROMPT` template says "Generate Terraform (HCL) **and** CloudFormation (YAML) snippets." `TerraformGenerator` then appends "Only output the Terraform (HCL) code block." These instructions conflict. LLMs honour the appended override ~70% of the time; the other 30%, they output both formats mixed. The regex `split("```hcl")` then extracts only the first block, which may be CloudFormation YAML rather than HCL.

**Prevention:**
Use separate, single-purpose prompts for Terraform and CloudFormation. `IAC_PROMPT` should be two distinct templates: `TERRAFORM_PROMPT` (HCL only) and `CFN_PROMPT` (YAML only). No ambiguity in the instruction.

**Phase:** IaC generation phase

---

### CM-4: File Upload Stores User-Controlled Filename Without Sanitization

**What goes wrong:**
`knowledge.py` stores uploads at `data/uploads/{uuid}_{file.filename}`. If `file.filename` contains path components like `../../etc/passwd` or `../app/main.py`, and the OS doesn't strip them, this is a path traversal write vulnerability. Even without malice, filenames with spaces, unicode, or colons break downstream `open()` calls.

**Prevention:**
```python
from pathlib import Path
safe_name = Path(file.filename).name  # strips directory components
file_path = os.path.join(UPLOAD_DIR, f"{doc_id}_{safe_name}")
```
Also add MIME type validation (only `application/pdf`, `text/plain`, `text/markdown`).

**Phase:** Knowledge base upload implementation phase

---

### CM-5: Mermaid v10 API Mismatch Silently Renders Nothing

**What goes wrong:**
`MermaidViewer.tsx` calls `mermaid.contentLoaded()` in a `useEffect`. This method was removed in Mermaid v10. The component fails silently — no error is thrown in the browser console, the diagram container remains empty. Additionally, the diagram definition is set as JSX children (`{definition}`), but Mermaid's `run()` reads `element.textContent` from the DOM, which React does not reliably set for the render timing window.

**Prevention:**
```typescript
useEffect(() => {
  if (containerRef.current && definition) {
    containerRef.current.innerHTML = definition;  // set before mermaid scans
    mermaid.run({ nodes: [containerRef.current] });
  }
}, [definition]);
```
Pin `mermaid` to `^10.x` in `package.json` to prevent future API drift.

**Phase:** Frontend bug fix phase (known bug — fix in first phase)

---

### CM-6: AWS Pricing API Instantiated at Import Time — Fails Without Credentials

**What goes wrong:**
`PricingService.__init__()` calls `boto3.client('pricing', ...)` at construction. `CostAnalyzer.__init__()` constructs `PricingService()`. `CostAnalyzer()` is instantiated at module load in `routes.py`. If `AWS_ACCESS_KEY_ID` is not set, boto3 raises `NoCredentialsError` at startup, not during the first pricing call. The entire backend fails to start.

**Why it's insidious:**
`.env.example` does not document `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY`. A developer running the app without AWS credentials will see a confusing startup crash with no clear explanation.

**Prevention:**
1. Add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION` to `.env.example` with clear instructions (even if optional for demo mode)
2. Lazy-initialize `PricingService` — instantiate inside the method call, not in `__init__`
3. Add a graceful fallback: if credentials are missing, return `{"total": 0.0, "breakdown": [], "note": "AWS credentials not configured"}`

**Phase:** Docker Compose end-to-end phase / environment configuration

---

### CM-7: Background Task Indexing Status Has No Persistence

**What goes wrong:**
`knowledge.py` triggers `index_document()` as a background task and immediately returns `{"status": "indexing"}`. The `GET /status/{document_id}` endpoint always returns `{"status": "indexed", "chunk_count": 42}` regardless of actual state. When real ingestion is implemented, the background task's progress exists only in-memory. A backend restart wipes all in-progress status. Clients polling for completion will get `indexed` even for documents that were never processed.

**Prevention:**
Use a simple in-memory dict (acceptable for demo) as a status store, or a Neo4j `KnowledgeDocument` node as persistent state:
```python
INDEXING_STATUS: Dict[str, Dict] = {}  # doc_id → {status, chunk_count, error}

async def index_document(doc_id: str, file_path: str):
    INDEXING_STATUS[doc_id] = {"status": "indexing", "chunk_count": 0}
    try:
        # ... real ingestion ...
        INDEXING_STATUS[doc_id] = {"status": "indexed", "chunk_count": actual_count}
    except Exception as e:
        INDEXING_STATUS[doc_id] = {"status": "error", "error": str(e)}
```

**Phase:** Knowledge base ingestion phase

---

### CM-8: APOC/GDS Plugin Download Requires Internet at Container Start

**What goes wrong:**
`docker-compose.yml` sets `NEO4J_PLUGINS=["apoc", "gds"]`. Neo4j 5.x downloads these plugins from `plugins.neo4j.com` at first startup. In air-gapped environments, CI runners without outbound internet, or Docker networks with restricted egress, the Neo4j container silently fails to load the plugins. Neo4j still starts, but APOC procedures (`apoc.*`) and GDS algorithms raise `Unknown function` errors at runtime.

**Prevention:**
Pre-download plugin JARs and mount them:
```yaml
volumes:
  - ./data/neo4j/plugins:/plugins
```
Document the required plugin versions in the README. For CI, use a Neo4j test image with plugins baked in, or skip GDS/APOC in test mode.

**Phase:** Docker Compose / CI setup phase

---

### CM-9: Mock `recommendation_id` Breaks Plan Approval Flow

**What goes wrong:**
`routes.py` returns `"recommendation_id": "mock-uuid"` for every response. Any feature that references a recommendation by ID (plan approval, Terraform download, status tracking) cannot work — all lookups return the same mock key. Since there is no persistence layer for recommendations, even a real UUID would be useless without a store.

**Prevention:**
Generate a real UUID per request: `recommendation_id = str(uuid.uuid4())`. Store the recommendation in a Neo4j `:Recommendation` node (the graph is already the persistence layer). Return the real UUID. The Terraform download endpoint can look up by this ID.

**Phase:** Recommendation persistence phase

---

### CM-10: LLM-Generated Terraform Is Never Linted or Validated

**What goes wrong:**
The advisor generates HCL via LLM. LLMs produce syntactically invalid Terraform at a non-trivial rate (mismatched braces, wrong resource type names, invalid attribute names, wrong provider versions). The generated HCL is returned directly to the user and offered for download with no validation step. SC-002 in the spec requires 100% `tflint` pass rate — this is currently 0%.

**Warning signs:**
- `terraform validate` on downloaded `.tf` file produces errors
- Resource type names like `aws_ecs_cluster_capacity_providers` instead of `aws_ecs_cluster` + separate resource

**Prevention:**
1. Constrain the LLM prompt to output only HCL, with a specific provider version block and resource scaffold
2. Run `terraform fmt -check` and `terraform validate` in a subprocess against a temp directory after generation
3. If validation fails, retry with an error-correction prompt (include the validator output): "The following HCL has validation errors: {errors}. Fix and return only corrected HCL."

**Phase:** Terraform generation phase

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Docker Compose wiring | Neo4j not ready when backend starts; backend crashes silently | Add `healthcheck` + `depends_on.condition: service_healthy`; add lifespan startup hook |
| Knowledge base ingestion | `initialize_schema()` never called; vector index missing | Call in startup lifespan; verify with `SHOW INDEXES` in Neo4j |
| Knowledge base ingestion | Embedding dimensions mismatch (index=1536 but model returns different size) | Pin embedding model; assert `len(embedding) == 1536` before insert |
| Knowledge base ingestion | Unsanitized filenames; path traversal | Use `pathlib.Path(name).name` to strip directory components |
| Knowledge base ingestion | Background task status not persisted; polling always returns mock data | Implement in-memory or Neo4j-backed status store |
| Multi-turn chat | `conversation_id` accepted but dropped; every turn is stateless | Wire `conversation_id` to a message history store; return new ID on first turn |
| Multi-turn chat | History grows unbounded, exceeds LLM context window | Apply a sliding window or summarization strategy after N turns |
| Chat endpoint | Sync `.invoke()` in async handler blocks event loop | Replace with `.ainvoke()` + `asyncio.gather()` for parallel IaC/cost calls |
| Chat endpoint | 5 sequential LLM calls = 30–60s response time | Parallelize independent calls after initial recommendation is produced |
| Mermaid rendering | Deprecated `contentLoaded()` silently does nothing | Replace with `mermaid.run({ nodes: [el] })` + `innerHTML` pre-set |
| Mermaid extraction | Regex captures first code block regardless of language | Anchor to `mermaid` language tag; use section-header extraction in prompt |
| LLM JSON parsing | String split raises `IndexError` on non-fenced JSON output | Use regex-based JSON extraction with Pydantic schema validation |
| Terraform generation | Contradictory IaC prompt generates both HCL and YAML | Separate `TERRAFORM_PROMPT` and `CFN_PROMPT` templates |
| Terraform generation | LLM-generated HCL is invalid; no lint step | Run `terraform validate` subprocess post-generation; error-correct on failure |
| Cost estimation | `PricingService` instantiated at import; crashes if AWS creds missing | Lazy-init; document credentials in `.env.example`; graceful no-credentials fallback |
| Cost estimation | Only EC2 costs calculated; all other services return $0 | Extend pricing handlers for RDS, Lambda, S3, CloudFront at minimum |
| Neo4j graph | Empty graph on fresh install — all recommendations are hallucinated | Implement seeder with canonical AWS services and Well-Architected pillars |
| Neo4j graph | Two connection pools (raw driver + Neo4jGraph) — resource waste | Consolidate to single `Neo4jGraph` or single raw driver passed by dependency injection |
| Frontend TypeScript | `bool` type in `CostTable.tsx` prevents `tsc` compilation | Change to `boolean`; run `tsc --noEmit` in CI to catch type errors early |
| End-to-end demo | `docker compose up` fails without `.env` file; no helpful error | Add `.env.example` with all required vars; `docker-compose.yml` should fail fast with clear messages |
| Security | CORS wildcard exposes LLM endpoint to any origin | Set `ALLOWED_ORIGINS` env var; read in `main.py`; restrict before demo |

---

## Cross-Cutting Warnings

### No Tests Protect Against Regression
Every critical component (ArchitectureAdvisor, CostAnalyzer, TerraformGenerator, ingestion pipeline) has zero test coverage. The eval suite uses static mock data disconnected from the live system. Adding tests to each phase is not optional — without them, every fix risks breaking an adjacent component silently.

**Minimum viable test targets per phase:**
- Extraction: test LLM JSON parsing with fenced, unfenced, and malformed responses
- GraphRAG: test Cypher query parameterization with mock Neo4j driver
- Terraform: test code fence extraction with multi-block responses; run `terraform validate` in subprocess
- Ingestion: test chunking, embedding dimension, and Neo4j upsert with a Neo4j test container

### LLM Output Variability Is the Central Quality Risk
Every component that parses LLM output (extractor, diagrammer, terraform generator, cost analyzer) will fail on outputs it doesn't expect. Each uses a different ad-hoc parsing strategy. A single robust `LLMOutputParser` utility with structured output (LangChain's `with_structured_output()` or Pydantic output parsers) would eliminate the majority of parsing pitfalls across all components simultaneously.

**LangChain structured output (HIGH confidence, current API):**
```python
class Requirements(BaseModel):
    traffic_pattern: str
    user_count: int
    high_availability: bool

structured_llm = llm.with_structured_output(Requirements)
requirements = structured_llm.invoke(prompt)  # returns validated Requirements instance
```
This eliminates CP-6, and makes CM-3, CM-10 parsing easier.

---

*Pitfalls audit completed: 2025-01-30*
*All pitfalls verified against actual source files in `backend/src/` and `frontend/src/`*

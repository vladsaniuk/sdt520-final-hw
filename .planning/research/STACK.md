# Stack Research

**Project:** AWS Architecture Advisor (GraphRAG Chat + Terraform Generator)
**Researched:** 2025-07-11
**Codebase state:** Brownfield scaffold — FastAPI + React + Neo4j + LangChain + OpenRouter

---

## Recommended Stack

### Core Backend Libraries

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `fastapi` | `0.136.1` | REST API + SSE streaming | Already used — pin version |
| `uvicorn[standard]` | latest | ASGI server with websocket extras | Already used |
| `langchain` | `1.2.18` | LLM orchestration core | Already used — pin version |
| `langchain-core` | `1.3.3` | LCEL, runnables, message history | Transitive dep — pin |
| `langchain-openai` | `1.2.1` | ChatOpenAI for OpenRouter | Already used — pin version |
| `langchain-neo4j` | `0.9.0` | **Replace** `langchain-community` Neo4j integration | **NEW — must add** |
| `langchain-text-splitters` | `1.1.2` | Recursive character splitter for KB chunking | **NEW — must add** |
| `neo4j` | `5.28.4` | Official Python driver for Neo4j 5.x server | **Pin to 5.x — do NOT upgrade to 6.x** |
| `neo4j-graphrag` | `1.16.0` | Vector retrieval pipeline (VectorRetriever, HybridRetriever) | Already used — pin version |
| `pypdf` | `6.11.0` | PDF text extraction for KB upload | Already installed (transitive) — explicit pin |
| `pydantic` | `>=2.0` | Request/response validation, structured output parsing | Already used |
| `pydantic-settings` | latest | Settings from env vars | Already used |
| `python-multipart` | latest | File upload in FastAPI | Already used |
| `boto3` | latest | AWS Pricing API | Already used |
| `python-dotenv` | latest | `.env` loading | Already used |

### Removed Libraries

| Library | Reason |
|---------|--------|
| `langchain-community` | Neo4j integration migrated to `langchain-neo4j`. Other features not used. Remove. |
| `sqlalchemy` | PROJECT.md: Neo4j is sole data store. Dead code. Remove. |
| `psycopg2-binary` | No PostgreSQL. Dead code. Remove. |

### Frontend Libraries

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `react` | `19.2.5` | UI framework | Already used — current |
| `react-dom` | `19.2.5` | DOM renderer | Already used — current |
| `mermaid` | `^11.14.0` | Architecture diagram rendering | Already used — fix API call |
| `react-syntax-highlighter` | `^16.1.1` | HCL/Terraform code blocks | Already used — keep |
| `typescript` | `~6.0.2` | Type safety | Already used — current |
| `vite` | `^8.0.10` | Build tool | Already used — current |
| `tailwindcss` | `^4.3.0` | Styling | Already used — current |

**No new frontend packages needed.** Streaming uses native `fetch` + `ReadableStream`.

### Infrastructure

| Component | Version | Why |
|-----------|---------|-----|
| Neo4j | `5.26.0` | Already in Docker Compose — **do not upgrade**; GDS + APOC plugins enabled |
| Docker Compose | v3 | Single-command demo deployment |

---

## Rationale

### 1. `langchain-neo4j` replaces `langchain-community` for Neo4j

**Why:** The `Neo4jGraph` and `Neo4jVector` classes were moved from `langchain-community` to the dedicated `langchain-neo4j` package (released 2024, now at 0.9.0). The community package path is on a deprecation trajectory. `langchain-neo4j` is co-maintained by Neo4j and LangChain, gets faster updates, and exposes `Neo4jVector.from_existing_index()` — the cleanest path to wiring the `aws_document_chunks` vector index already created in the schema.

**Migration:** `from langchain_community.graphs import Neo4jGraph` → `from langchain_neo4j import Neo4jGraph`. Drop-in for the import path; no API changes.

**Confidence:** HIGH — Official LangChain docs show `langchain-neo4j` as the canonical integration.

---

### 2. Pin neo4j driver to 5.28.4, NOT 6.x

**Why:** Docker Compose runs `neo4j:5.26.0`. The Python `neo4j` driver introduced a major version 6.x (currently 6.2.0) with breaking API changes. The 5.x driver is the correct compatibility tier for Neo4j server 5.x. Upgrading to 6.x would require API migration work with zero functional benefit for this project.

**What changes at 6.x:** `neo4j` driver 6.0 removes several session/transaction patterns used in the existing `KnowledgeBaseService`. Not worth the migration risk.

**Confidence:** HIGH — Version matrix from Neo4j Python driver changelog.

---

### 3. FastAPI `StreamingResponse` with Server-Sent Events (SSE) for chat

**Why:** The current chat endpoint is blocking (`llm.invoke()` → full response → return JSON). LLM responses can take 5–30 seconds. SSE streaming gives users immediate feedback as tokens arrive.

**Pattern:**
```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

async def token_generator(chain, input_data):
    async for chunk in chain.astream(input_data):
        content = chunk.content if hasattr(chunk, 'content') else str(chunk)
        if content:
            yield f"data: {json.dumps({'token': content})}\n\n"
    yield "data: [DONE]\n\n"

@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    chain = build_chain(request.conversation_id)
    return StreamingResponse(
        token_generator(chain, {"input": request.message}),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )
```

**Why `text/event-stream` not WebSocket:** SSE is simpler (HTTP/1.1, no upgrade), unidirectional (server→client fits this use case), reconnects automatically, and works through proxies. WebSocket adds complexity for no gain here.

**Confidence:** HIGH — FastAPI official docs pattern; `langchain-openai` `astream()` is production-ready.

---

### 4. React streaming: `fetch()` + `ReadableStream`, NOT `EventSource`

**Why:** `EventSource` is browser-native SSE, but it only supports GET requests and cannot send JSON body or custom headers. The chat endpoint requires POST with `{"message": "..."}`. Use `fetch()` with streaming reader instead.

**Pattern:**
```typescript
const response = await fetch('/api/v1/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: input, conversation_id: conversationId }),
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
      const data = JSON.parse(line.slice(6));
      setStreamingText(prev => prev + data.token);
    }
  }
}
```

**Why React state pattern:** Accumulate tokens into a `useState` string. Append each chunk; React batches re-renders efficiently in React 19 with automatic batching.

**Confidence:** HIGH — Standard 2025 pattern; `fetch` streaming works in all modern browsers.

---

### 5. Multi-turn conversation: `RunnableWithMessageHistory` + `InMemoryChatMessageHistory`

**Why:** The current `ChatRequest` model already has `conversation_id: Optional[str]` — it's the right hook. The 2025 LangChain pattern for stateful chat is `RunnableWithMessageHistory` (LCEL), not the deprecated `ConversationBufferMemory`.

**Why NOT LangGraph:** LangGraph (1.1.10) is the right tool for complex agent loops with conditional branching. This app has a linear conversation: user message → GraphRAG retrieval → LLM response. LCEL + `RunnableWithMessageHistory` handles this with far less complexity.

**Pattern:**
```python
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_core.chat_history import InMemoryChatMessageHistory

# Module-level store (survives within a container session, fine for demo)
conversation_store: dict[str, InMemoryChatMessageHistory] = {}

def get_session_history(session_id: str) -> InMemoryChatMessageHistory:
    if session_id not in conversation_store:
        conversation_store[session_id] = InMemoryChatMessageHistory()
    return conversation_store[session_id]

chain_with_history = RunnableWithMessageHistory(
    graph_rag_chain,
    get_session_history,
    input_messages_key="input",
    history_messages_key="chat_history",
)
```

**Session ID source:** Use `conversation_id` from `ChatRequest`. Frontend generates a UUID on first message and passes it on all subsequent turns.

**Confidence:** HIGH — LangChain 1.x official docs; `RunnableWithMessageHistory` is the stable LCEL pattern.

---

### 6. Neo4j GraphRAG: Hybrid retrieval (vector + graph traversal)

**Why:** The current `ArchitectureAdvisor` only does Cypher graph traversal (`MATCH (s:AWS_Service)-[:ALIGNS_WITH]->(p:WellArchitected_Pillar)`). The vector index `aws_document_chunks` is initialized but never queried. Hybrid retrieval combines both for better relevance.

**Pattern with `neo4j-graphrag`:**
```python
from neo4j_graphrag.retrievers import VectorCypherRetriever
from neo4j_graphrag.embeddings import OpenAIEmbeddings

embedder = OpenAIEmbeddings(
    model="text-embedding-3-small",
    openai_api_key=os.getenv("LLM_API_KEY"),
    base_url="https://openrouter.ai/api/v1"  # OpenRouter supports embeddings
)

retriever = VectorCypherRetriever(
    driver=neo4j_driver,
    index_name="aws_document_chunks",
    embedder=embedder,
    retrieval_query="""
        MATCH (chunk)-[:PART_OF]->(doc:KnowledgeDocument)
        OPTIONAL MATCH (s:AWS_Service)-[:MENTIONED_IN]->(doc)
        RETURN chunk.text AS text, doc.filename AS source, 
               collect(s.name) AS services
    """
)
```

**Embedding model choice:** `text-embedding-3-small` via OpenRouter (same API key, OpenAI-compatible). Matches the 1536-dim vector index already configured in the schema.

**Confidence:** MEDIUM — `neo4j-graphrag` 1.x API verified from package version history; OpenRouter embedding compatibility is documented but test before finalizing.

---

### 7. Terraform generation: Structured output with Pydantic

**Why:** The current `TerraformGenerator` does brittle string splitting on ` ```hcl `. LangChain's `.with_structured_output()` (LCEL) or Pydantic output parsers produce cleaner extraction. For HCL specifically, structured output isn't useful (HCL isn't JSON), but the extraction logic can be made robust with a `PydanticOutputParser`.

**Recommended pattern:** Keep the current string approach but replace the brittle multi-branch split with a single regex:
```python
import re

def extract_hcl_block(content: str) -> str:
    match = re.search(r'```(?:hcl|terraform)?\n(.*?)```', content, re.DOTALL)
    return match.group(1).strip() if match else content.strip()
```

For the full Terraform download (plan-approval flow), generate the complete config in one LLM call using a detailed system prompt, not iterative generation.

**Confidence:** HIGH — No external dependencies required.

---

### 8. Document ingestion: `pypdf` + `langchain-text-splitters`

**Why:** The knowledge base upload endpoint is a stub. The ingestion pipeline needs: (1) parse PDF/markdown/text → (2) chunk → (3) embed → (4) write to Neo4j vector index.

**`pypdf`** (6.11.0, already installed as a transitive dep): Extracts text from PDFs. Pure Python, zero system deps. Correct choice for a Docker demo. `unstructured` is heavyweight (requires `libmagic`, Tesseract, Poppler — all system-level) and overkill for text-based PDFs.

**`langchain-text-splitters`** (1.1.2): `RecursiveCharacterTextSplitter` with `chunk_size=1000, chunk_overlap=200` is the standard 2025 pattern for document RAG.

**Pipeline:**
```python
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter

def extract_text(file_path: str, filename: str) -> str:
    if filename.endswith('.pdf'):
        reader = PdfReader(file_path)
        return "\n".join(page.extract_text() for page in reader.pages)
    else:  # markdown, txt
        with open(file_path) as f:
            return f.read()

splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
chunks = splitter.split_text(raw_text)
```

**Confidence:** HIGH — pypdf and langchain-text-splitters are the de-facto 2025 RAG ingestion stack.

---

### 9. Mermaid: Fix deprecated `contentLoaded()` → `mermaid.run()`

**Why:** `mermaid.contentLoaded()` was removed in Mermaid 10+. Current code is broken. The current app uses Mermaid 11.14.0.

**Fix:**
```typescript
useEffect(() => {
  if (containerRef.current && definition) {
    mermaid.run({ nodes: [containerRef.current] });
  }
}, [definition]);
```

The container must have the `class="mermaid"` and its `textContent` must be the Mermaid definition before `.run()` is called. React renders the text content synchronously before the effect fires — this works.

**Confidence:** HIGH — Mermaid 10+ changelog explicitly documents this API change.

---

### 10. FastAPI `lifespan` replaces deprecated `@app.on_event`

**Why:** FastAPI deprecated `@app.on_event("startup")` / `@app.on_event("shutdown")` in 0.93+. Current code uses it. Replace with `lifespan` context manager.

**Fix:**
```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    kb_service.initialize_schema()
    yield
    # shutdown (if needed)

app = FastAPI(title="AWS Architecture Advisor API", lifespan=lifespan)
```

**Confidence:** HIGH — FastAPI official docs; deprecated warning is emitted at runtime.

---

## What to Avoid

### `langchain-community` for Neo4j
**Avoid.** `Neo4jGraph` and `Neo4jVector` have canonical homes in `langchain-neo4j`. The community package still works but is the "legacy" path — PRs and fixes go to `langchain-neo4j` first. Remove `langchain-community` from requirements entirely (nothing else in this codebase uses it).

### neo4j driver 6.x
**Do not upgrade.** Neo4j Python driver 6.x targets Neo4j server 6.x, introduces breaking API changes, and Docker Compose is pinned to Neo4j 5.26.0. The 5.28.4 driver is the safe, current choice for a 5.x server.

### `ConversationBufferMemory` / `ConversationChain`
**Deprecated.** These are pre-LCEL LangChain APIs. They still function but produce deprecation warnings and won't receive updates. Use `RunnableWithMessageHistory` + `InMemoryChatMessageHistory` instead.

### LangGraph
**Overkill.** LangGraph is the right tool when you need conditional branching (tool-calling agents, retry loops, human-in-the-loop). This application has a single linear flow: retrieve → generate → respond. LangGraph adds ~2,000 lines of state machine overhead for zero functional gain here.

### `EventSource` for streaming
**Broken for POST.** `EventSource` only issues GET requests. The chat endpoint requires POST with a JSON body. Use `fetch()` + `ReadableStream`.

### `unstructured` for document parsing
**Too heavy for a demo.** `unstructured` pulls in Poppler, Tesseract, `libmagic`, and other native system packages that must be in the Docker image. For text-based PDFs and markdown (the expected KB content), `pypdf` + plain file reading is sufficient and keeps the Docker image small.

### SQLAlchemy + psycopg2
**Dead code.** PROJECT.md explicitly says Neo4j is the sole data store for this milestone. The `workload.py` models are disconnected from any DB. Remove both packages from requirements and delete the models (or stub them).

### Blocking `llm.invoke()` in the chat endpoint
**Blocks the event loop.** All LLM calls inside async FastAPI endpoints must use `await chain.ainvoke()` or `async for chunk in chain.astream()`. The current code uses synchronous `.invoke()` which blocks the entire ASGI worker, preventing concurrent requests. Every LLM call in `advisor.py`, `extractor.py`, and `terraform.py` needs the async variant.

---

## Confidence

| Area | Confidence | Notes |
|------|------------|-------|
| Package versions | HIGH | Verified via `pip index versions` against live PyPI |
| `langchain-neo4j` migration | HIGH | Official LangChain docs; drop-in import swap |
| neo4j driver pinning to 5.x | HIGH | Neo4j version matrix; Docker Compose locked to 5.26.0 |
| FastAPI SSE streaming pattern | HIGH | FastAPI docs; LangChain `astream()` is stable |
| React `fetch` + ReadableStream | HIGH | Standard browser API; works in all React 19 environments |
| `RunnableWithMessageHistory` | HIGH | LangChain 1.x official API; stable since 0.3.x |
| `neo4j-graphrag` VectorCypherRetriever | MEDIUM | API verified from changelog; OpenRouter embedding compat needs smoke test |
| Terraform HCL extraction regex | HIGH | Trivially verifiable; no external deps |
| Mermaid `run()` fix | HIGH | Mermaid 10+ changelog; `contentLoaded()` explicitly removed |

---

## Pinned Requirements File (updated)

```
# Core API
fastapi==0.136.1
uvicorn[standard]

# LangChain ecosystem
langchain==1.2.18
langchain-core==1.3.3
langchain-openai==1.2.1
langchain-neo4j==0.9.0
langchain-text-splitters==1.1.2

# Neo4j
neo4j==5.28.4
neo4j-graphrag==1.16.0

# Document processing
pypdf==6.11.0

# AWS
boto3

# App utilities
pydantic
pydantic-settings
python-multipart
python-dotenv

# Dev/test
deepeval
pytest
ruff
black
```

**Removed from current requirements.txt:**
- `langchain-community` → replaced by `langchain-neo4j`
- `sqlalchemy` → dead code, no PostgreSQL
- `psycopg2-binary` → dead code, no PostgreSQL

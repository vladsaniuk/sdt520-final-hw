# AWS Architecture Advisor

A chat-based AI tool that turns a plain-English system description into a concrete, deployable AWS architecture — complete with a Mermaid diagram, service breakdown, IaC snippet preview, and cost estimate. Once you're satisfied with the plan, generate and download a ready-to-deploy Terraform config.

The recommendations are grounded in **your own knowledge base**: upload PDF, Markdown, or plain-text best-practice docs and the advisor uses GraphRAG (Neo4j) to surface context-aware suggestions rather than generic boilerplate.

---

## Features

- **Iterative chat** — refine the plan across multiple turns ("use ECS instead of EKS", "make it cheaper")
- **GraphRAG grounding** — recommendations come from your uploaded docs, not hallucinated generics
- **Structured responses** — every reply contains a diagram, service list, IaC preview, and cost estimate
- **Terraform download** — approve a plan and get a valid, deployment-ready `.tf` file
- **Document upload** — PDF, Markdown, and plain text; progress tracked in real time via WebSocket
- **Zero-setup demo** — `docker compose up` is all you need

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11+, FastAPI, LangChain, `langchain-neo4j` |
| LLM | OpenRouter (OpenAI-compatible endpoint) |
| Graph DB | Neo4j 5.26 + vector index (sentence-transformers, 384-dim) |
| Frontend | React 18, TypeScript, Vite, Chakra UI, Mermaid v10 |
| IaC output | Terraform HCL (AWS provider) |
| Deployment | Docker Compose (neo4j → backend → frontend, health-gated) |

---

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- An [OpenRouter](https://openrouter.ai/) API key

### 1. Clone and configure

```bash
git clone https://github.com/vladsaniuk/sdt520-final-hw.git
cd sdt520-final-hw
cp .env.example .env
```

Edit `.env`:

```env
LLM_API_KEY=your_openrouter_key_here
NEO4J_PASSWORD=password          # change if desired
```

### 2. Start

```bash
docker compose up --build
```

Services start in order: Neo4j → Backend → Frontend. Wait for all three to be healthy (~60 s on first run).

### 3. Open

- **App** → [http://localhost:3000](http://localhost:3000)
- **API docs** → [http://localhost:8000/docs](http://localhost:8000/docs)
- **Neo4j browser** → [http://localhost:7474](http://localhost:7474)

### 4. Upload your knowledge base

Open the **Knowledge Base** panel in the UI and upload your own best-practice docs (PDF, Markdown, or plain text). The advisor grounds every recommendation in these documents — the more relevant your docs, the sharper the output.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_API_KEY` | ✅ | OpenRouter API key — used for all LLM calls |
| `NEO4J_PASSWORD` | ✅ | Neo4j password (default: `password`) |
| `NEO4J_URI` | — | Neo4j Bolt URI (default: `bolt://neo4j:7687`) |
| `ALLOWED_ORIGINS` | — | CORS origins (default: `*`) |

> **Note:** OpenRouter does not proxy `/embeddings`. Embeddings use `sentence-transformers` (local, no extra key needed).

---

## Project Structure

```
.
├── backend/              # FastAPI application
│   ├── src/
│   │   ├── api/          # Routes, SSE streaming
│   │   └── core/         # ArchitectureAdvisor, KnowledgeBaseService
│   └── Dockerfile
├── frontend/             # React + Vite SPA
│   ├── src/
│   │   ├── components/   # ChatBox, MermaidViewer, KnowledgeBase, …
│   │   └── App.tsx
│   └── Dockerfile
├── data/                 # Neo4j persistent volumes (git-ignored)
├── logs/                 # SSE debug log (git-ignored)
├── docker-compose.yml
└── .env.example
```

---

## Development

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

### Linting

```bash
cd backend && ruff check . && black --check .
cd frontend && npm run lint
```

### Tests

```bash
cd backend && pytest
```

---

## Contributing with GSD

This project uses [**get-shit-done (GSD)**](https://github.com/gsd-build/get-shit-done) — a structured AI-assisted development workflow. Planning artifacts live in `.planning/`.

### Setup

Install GSD and the GitHub Copilot CLI if you haven't already:

```bash
# Install GSD
npm install -g @gsd-build/gsd

# Verify
gsd --version
```

### Understand the current state

```bash
/gsd-progress
```

This shows the active phase, completed plans, and what's next.

### Start the next planned phase

```bash
/gsd-plan-phase 4
```

GSD will research the phase, generate a detailed plan, check it, and walk you through execution with atomic commits.

### Do a quick ad-hoc task

For small tasks that don't belong to a planned phase:

```bash
/gsd-quick fix the Neo4j connection retry logic
/gsd-quick --discuss add a loading skeleton to the chat panel
```

`--discuss` surfaces ambiguous decisions before planning. `--full` adds plan-checking and verification.

### Phase workflow

```
/gsd-discuss-phase <N>   → gather context (optional)
/gsd-plan-phase <N>      → generate PLAN.md artifacts
/gsd-execute-phase <N>   → execute plans with atomic commits
/gsd-verify-work         → confirm phase goal is met
```

### Contribution guidelines

1. **Work on a feature branch** — quick tasks and phases each get their own branch via GSD.
2. **Never edit `.planning/` by hand** — GSD owns `ROADMAP.md` and `STATE.md`; edits break state tracking.
3. **Atomic commits** — GSD commits each plan task separately; follow the same pattern for manual changes.
4. **No tests = no merge** — the project has no test suite yet (tracked in ROADMAP); adding tests is always welcome.
5. **Phase 1 is the entry point** — if the app doesn't start cleanly, fix Phase 1 before anything else.

### Current roadmap status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Baseline Fixes | ✅ Complete |
| 2 | Graph Seeding & Document Ingestion | ✅ Complete |
| 2.1 | UI Polish | ✅ Complete |
| 3 | Multi-Turn Chat | ✅ Verified |
| 4 | Terraform Download | ✅ Complete |
| 5 | Docker Polish | ✅ Complete |

---

## Project Breakdown

### Task Milestones

**Dev A — Ingestion & RAG**

1. Set up Neo4j vector index and schema initialization on backend startup
2. Build document ingestion pipeline: upload → parse (PDF/Markdown/text) → chunk → embed with sentence-transformers → store as vector nodes
3. Wire VectorCypherRetriever into the advisor: query uploaded docs by similarity, inject retrieved context into LLM prompt
4. Build the Knowledge Base panel: file upload dropzone, real-time WebSocket progress bar, indexed document list with delete
5. Build the debug panel: RAG retrieval viewer showing what context was injected into each LLM call, live SSE event log

**Dev B — Conversation & Prompt Engineering**

6. Design the prompt system: ADVISOR_PROMPT for initial plans, FOLLOWUP_PROMPT for refinements that delta off prior context, TERRAFORM_FULL_PROMPT for HCL generation
7. Implement conversation history on the backend: in-memory store keyed by conversation_id, full history injected into every LLM call
8. Implement structured LLM output: Pydantic ArchitecturePlan model with with_structured_output(), retry on schema violations, cost field coercion
9. Build multi-turn chat UI: message bubbles, context fill bar showing token usage, diff badges on refined plans, Compact and Clear controls
10. Build the guided intake flow: multi-step Q&A that collects system requirements before the first LLM call, results passed as structured context to the advisor

**Dev C — Generation, Validation & DevOps**

11. Build the architecture advisor endpoint: async LLM call via OpenRouter, structured response (Mermaid diagram + services + IaC snippet + cost estimate)
12. Build Terraform generation: POST /approve → LLM generates full valid HCL → terraform validate subprocess → cache and serve by recommendation ID
13. Build the Terraform approval UI: Approve button on assistant messages, approval status indicator, download .tf file as a Blob
14. Set up Docker Compose with full health-gated startup: Neo4j → Backend → Frontend, each waiting on the previous service's health endpoint
15. Build the system prompt inspector: expose assembled prompt + model config via debug endpoint, render in frontend debug drawer

---

### Key Challenges

1. **Structured output parsing brittleness** — The LLM frequently returned JSON wrapped in markdown code fences, with explanation text before/after the JSON block, or violated the schema in subtle ways (e.g. cost as a string `"~$200/mo"` instead of a number). Had to switch from regex/string-split parsing to `with_structured_output()` with a Pydantic model, plus a retry decorator for schema violations.

2. **LLM-generated Mermaid syntax errors** — The model produced structurally invalid Mermaid diagrams: broken arrow syntax, illegal node names with special characters, unclosed brackets, and inconsistent indentation. Required building a targeted `sanitizeMermaid()` pre-processor and catching render errors gracefully in the frontend.

3. **RAG returning empty context on cold start** — Before any documents were uploaded, `VectorCypherRetriever` threw exceptions (no `Document_Chunk` nodes, no populated index), causing every advisor call to 500. Added a try/except cold-start guard that returns `""` when no documents exist so the LLM still responds — just without grounding.

4. **Hardcoded seed data polluting recommendations** — The advisor injected 12 hardcoded AWS service nodes into every LLM system prompt alongside RAG context, meaning the model's output was partially grounded in static boilerplate rather than the user's actual uploaded documents — contradicting the core purpose of the system. Removed the graph query entirely; `combined_context` is now purely vector-retrieved content from uploaded docs.

5. **RAG record serialization format inconsistency** — `neo4j-graphrag` serialized Neo4j `Record` objects into `item.content` as Python repr strings, using either single or double quotes depending on data values. A string like `{'name': "it's here"}` broke naive JSON parsing. Had to write `_parse_record_string()` with a regex that handles both quote styles before content could be injected into the prompt.

6. **Conversation history growing beyond LLM context window** — Multi-turn conversations with large architecture responses accumulated tokens fast. Without a compaction strategy, long sessions hit model context limits and the LLM started truncating or refusing responses. Added `POST /compact` (summarize history to a single system message) and `POST /clear` endpoints, with a context fill-bar in the UI warning users before they hit the limit.

7. **Follow-up prompts triggering fresh plans instead of refinements** — Without explicit instruction, the LLM treated every follow-up message ("make it cheaper", "use ECS instead") as a new architecture request and returned a completely different plan ignoring prior context. Required a dedicated `FOLLOWUP_PROMPT` template that explicitly instructs the model to treat prior turns as the base plan and only apply the requested delta.

8. **Loose LLM cost schema causing deserialization failures** — The model returned cost estimates in inconsistent formats: plain numbers, strings with currency symbols, ranges (`"$100-200"`), or omitted the field entirely. Pydantic validation failed on every third response. Required coercing the cost field at parse time and making it `Optional` with a fallback rather than enforcing a strict numeric type.

9. **Terraform HCL quality from the LLM** — The model generated syntactically plausible but semantically invalid Terraform: missing `required_providers` blocks, hardcoded region strings instead of variables, resource type names that don't exist in the AWS provider. Had to engineer `TERRAFORM_FULL_PROMPT` with explicit structural constraints and run `terraform validate` as a post-generation check with the result surfaced to the user.

10. **Embeddings API vs LLM API mismatch** — The scaffold assumed OpenRouter would handle both chat completions and embeddings under one key. OpenRouter only proxies chat completions — calling `/embeddings` returns a 404. The ingestion pipeline silently failed with no documents ever stored in Neo4j. Resolved by switching to local `sentence-transformers` (`all-MiniLM-L6-v2`, 384-dim) running inside Docker — no second API key required.

---

## License

MIT

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

### 4. Seed the knowledge base (optional but recommended)

The advisor ships with a baseline set of AWS service nodes. To seed them:

```bash
curl -X POST http://localhost:8000/api/v1/seed
```

Upload your own docs via the **Knowledge Base** panel in the UI.

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
| 5 | Docker Polish | ⬜ Not started |

---

## License

MIT

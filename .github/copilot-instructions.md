# AWS Architecture Advisor — Copilot Instructions

## What This Project Is

A chat-based AI tool where users describe the system they want to build and receive an architecture plan — diagram, service breakdown, IaC snippets, and cost estimates — grounded in their own uploaded knowledge base (GraphRAG over Neo4j). Once satisfied through iterative refinement, users generate and download a Terraform config ready to deploy on AWS.

## Tech Stack

- **Backend**: Python 3.11+, FastAPI, LangChain, `langchain-neo4j` 0.9.0
- **LLM**: OpenRouter (OpenAI-compatible endpoint via `OPENROUTER_API_KEY`)
- **Graph DB**: Neo4j 5.26.0 (NOT 6.x — locked to match `neo4j` driver 5.x)
- **Frontend**: React 18, TypeScript, Vite
- **IaC Output**: Terraform HCL (AWS provider)
- **Deployment**: Docker Compose (three services: neo4j, backend, frontend)

## Project State

Brownfield — scaffold exists but is hollow. See `.planning/ROADMAP.md` for the 6-phase completion plan:

1. **Baseline Fixes** → app starts, compiles, real LLM call
2. **Graph Seeding** → Neo4j populated with AWS + Well-Architected knowledge
3. **Multi-Turn Chat** → history-aware iterative conversation
4. **Document Ingestion** → user uploads ground the GraphRAG
5. **Terraform Download** → approved plan → downloadable `.tf`
6. **Docker Polish** → `docker compose up` = zero-setup demo

## Critical Rules

### Python
- All FastAPI endpoint handlers MUST be `async` — use `await llm.ainvoke()`, never `.invoke()`
- Use `lifespan` context manager (not deprecated `@app.on_event("startup")`)
- Use `langchain-neo4j` (NOT `langchain-community` Neo4j imports)
- Parse LLM output with `with_structured_output()` + Pydantic models — no string splitting or regex
- `import` statements belong at the **top** of every file — never mid-file
- No SQLAlchemy, psycopg2-binary, or PostgreSQL — Neo4j is the sole store

### Neo4j
- Neo4j driver pinned to 5.x — do NOT upgrade to 6.x
- `initialize_schema()` MUST be called on startup (vector index + constraints) before any seed or query
- Vector index dimension: 1536 (OpenAI embeddings) — do not change without rebuilding the index
- Use `langchain_neo4j.Neo4jGraph` and `langchain_neo4j.GraphCypherQAChain`

### TypeScript / React
- TypeScript types: use `boolean`, never `bool`
- Mermaid: use `mermaid.run()` — `mermaid.contentLoaded()` was removed in v10+
- Streaming chat: use `fetch` + `ReadableStream` (NOT `EventSource` — EventSource is GET-only)

### Docker Compose
- Backend service MUST declare `depends_on: neo4j: condition: service_healthy`
- Backend MUST expose `/health` endpoint used by Compose healthcheck
- All secrets via `.env` file — never hardcoded; document every var in `.env.example`
- No APOC/GDS plugins in the Neo4j service — they're unused and slow cold starts

### Embeddings
- OpenRouter does NOT proxy `/embeddings` — embeddings use a separate `OPENAI_API_KEY` (or local `sentence-transformers`)
- Never silently fall back — fail fast with a clear error if the embeddings API is unavailable

## Key Architecture Patterns

```
User message
  └─► FastAPI /chat (async)
        └─► ArchitectureAdvisor.advise()
              ├─► Neo4j GraphRAG (Cypher + vector retrieval)
              ├─► Conversation history (in-memory dict keyed by conversation_id)
              └─► LLM (OpenRouter) → structured Pydantic output
                    └─► Response: {diagram, services, iac_snippet, cost_estimate}
```

## Open Decisions (resolve before affected phase)

| Decision | Needed by | Status |
|----------|-----------|--------|
| Embeddings API: OpenAI direct key vs. local sentence-transformers | Phase 4 | **Unresolved** |
| Plan approval UX: UI button vs. recognized message phrase | Phase 5 | **Unresolved** |
| Conversation history window: last-N turns vs. token budget | Phase 3 | **Unresolved** |

## GSD Workflow

This project uses [get-shit-done](https://github.com/gsd-build/get-shit-done). Planning artifacts live in `.planning/`.

- Start the next phase: `/gsd-plan-phase 1`
- Check progress: `/gsd-progress`
- Config: `.planning/config.json` (YOLO mode, coarse granularity, parallel execution)

# AWS Architecture Advisor

## What This Is

A chat-based AI tool where users describe the system they want to build and receive a concrete AWS architecture plan — Mermaid diagram, service breakdown, IaC snippet preview, and cost estimate — grounded in their own uploaded knowledge base (GraphRAG over Neo4j). Once satisfied with the plan through iterative refinement, users can generate and download a Terraform config ready to deploy on AWS.

## Core Value

Upload your best-practice docs. Describe what you want to build. Get a deployable architecture plan grounded in your own knowledge.

## Current State — v1.0 ✅

All 5 phases shipped. The app runs end-to-end via `docker compose up`:
- Real LLM chat (OpenRouter) with multi-turn conversation history
- Document upload pipeline (PDF, Markdown, text → Neo4j vector index → RAG)
- Structured responses: Mermaid diagram + services + IaC snippet + cost estimate
- Terraform HCL generation + download on plan approval
- Zero-setup Docker Compose with health-gated startup order

**Core design decision:** Recommendations are grounded solely on user-uploaded documents. The advisor does not inject hardcoded AWS knowledge — what you upload is what drives the output.

## Key Decisions

| Decision | Rationale | Status |
|----------|-----------|--------|
| User-uploaded knowledge base (not pre-seeded) | Users bring their own best practices — more flexible, avoids stale hardcoded data | ✅ Validated |
| sentence-transformers (local, 384-dim) for embeddings | No separate embeddings API key required; runs inside Docker | ✅ Validated |
| Iterative chat (not single-turn) | Lets users refine the plan naturally; mirrors how architects actually work | ✅ Validated |
| Neo4j as sole persistence store | Graph model fits architecture knowledge; no PostgreSQL complexity | ✅ Validated |
| Terraform as primary IaC output | Wider adoption than CloudFormation; multi-cloud path when needed | ✅ Validated |
| In-memory conversation history | Sufficient for demo; persistence deferred to v2 | ✅ Accepted tech debt |

## Out of Scope (v1)

- Authentication / user accounts — demo tool, no auth needed
- GCP / Azure Terraform — multi-cloud is a future milestone
- Pre-seeded AWS knowledge base — user uploads their own docs
- CloudFormation output — Terraform is the v1 IaC target
- SSE/streaming chat responses — structured JSON used for v1

## v2 Candidates

- Conversation persistence across restarts (Neo4j-backed)
- Pre-seeded Well-Architected Framework docs (user can augment)
- Streaming (SSE) chat responses
- Multi-cloud Terraform output (GCP, Azure)
- Authentication / user accounts

## Constraints

- **Tech stack**: Python 3.11+ (FastAPI), TypeScript (React 18+), Neo4j 5.x, Docker — locked
- **LLM**: OpenRouter (OpenAI-compatible) — env var driven, no hardcoded keys
- **Cloud target (v1)**: AWS only — Terraform AWS provider
- **Deployment**: Everything must work via `docker compose up` — no external setup
- **No auth**: Demo tool — no login, sessions, or user management

---
*Last updated: 2026-05-10 — v1.0 milestone complete*

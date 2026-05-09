# AWS Architecture Advisor

## What This Is

A chat-based AI tool where users describe the system they want to build and receive an architecture plan — diagram, service breakdown, IaC snippets, and cost estimates — grounded in their own uploaded knowledge base (GraphRAG over Neo4j). Once satisfied with the plan through iterative refinement, users can generate and download a Terraform config ready to deploy on AWS.

## Core Value

A user describes what they want to build, and gets back a concrete, deployable architecture plan — grounded in their own best-practice docs.

## Requirements

### Validated

- ✓ FastAPI backend with chat and knowledge base endpoints — existing
- ✓ Neo4j GraphRAG architecture (KnowledgeBaseService, ArchitectureAdvisor) — existing
- ✓ React SPA chat interface skeleton — existing
- ✓ Three-service Docker Compose setup (neo4j, backend, frontend) — existing
- ✓ Terraform + CloudFormation HCL generator code — existing

### Active

- [ ] Knowledge base upload fully working — user uploads docs (PDF, markdown, text) → ingested and indexed into Neo4j graph
- [ ] Real iterative chat conversation — multi-turn, history-aware, user can refine the plan via follow-up messages
- [ ] Unified plan response — one chat reply contains: architecture diagram (Mermaid), service breakdown text, IaC code snippet preview, and cost estimate
- [ ] Plan approval flow — user approves plan in chat; app generates full Terraform config and offers preview + download
- [ ] AWS Terraform as primary IaC output (HCL, downloadable .tf file)
- [ ] Real recommendation IDs (replace mock UUID)
- [ ] Fix known frontend bugs (TypeScript bool→boolean, deprecated mermaid.contentLoaded API)
- [ ] Resolve dead SQLAlchemy models (remove or wire up)
- [ ] End-to-end functional Docker Compose — `docker compose up` brings up a working demo

### Out of Scope

- Authentication / user accounts — demo tool, no auth needed
- GCP / Azure Terraform — multi-cloud is a future milestone
- Pre-seeded knowledge base — user uploads their own best-practice docs
- PostgreSQL persistence — Neo4j is the sole data store for this milestone
- CloudFormation output — Terraform is the v1 IaC target; CF code can stay dormant

## Context

The codebase scaffold exists (FastAPI, React, Neo4j, Docker Compose) but is largely unimplemented:
- Chat endpoint returns mock/stub data (`recommendation_id: "mock-uuid"`)
- SQLAlchemy models are defined but not connected to any DB
- Frontend has TypeScript errors and uses a deprecated Mermaid API
- Knowledge base ingestion pipeline needs completing

The architecture intent is correct: LangChain → OpenRouter LLM → Neo4j GraphRAG → structured response. The plumbing needs to be wired up and bugs fixed.

LLM access is via OpenRouter (OpenAI-compatible endpoint). No direct AWS SDK calls for LLM — only for the Pricing API.

## Constraints

- **Tech stack**: Python 3.11+ (FastAPI), TypeScript (React 18+), Neo4j, Docker — locked
- **LLM**: OpenRouter (OpenAI-compatible) — env var driven, no hardcoded keys
- **Cloud target (v1)**: AWS only — Terraform AWS provider
- **Deployment**: Everything must work via `docker compose up` — no external setup required
- **No auth**: Demo tool — no login, sessions, or user management
- **Neo4j only**: No PostgreSQL for this milestone — remove or stub SQLAlchemy models

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| AWS first, multi-cloud later | Scope control — AWS has clearest IaC patterns; GCP/Azure adds complexity without v1 value | — Pending |
| User-uploaded knowledge base (not pre-seeded) | Users bring their own best practices — more flexible, avoids licensing questions | — Pending |
| Iterative chat (not single-turn) | Lets users refine the plan naturally; mirrors how architects actually work | — Pending |
| Neo4j as sole persistence store | Avoids PostgreSQL complexity; graph model fits architecture knowledge naturally | — Pending |
| Terraform as primary IaC output | Wider adoption than CloudFormation; multi-cloud path when needed | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-09 after initialization*

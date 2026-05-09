# Implementation Plan: AWS Architecture Advisor

**Branch**: `001-aws-architecture-advisor` | **Date**: 2026-05-09 | **Spec**: [specs/001-aws-architecture-advisor/spec.md](spec.md)
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Build an AWS Architecture Advisor that provides reference architectures, IaC snippets, and cost estimates based on natural language workload descriptions. The system uses a GraphRAG approach with Neo4j and AWS Well-Architected Framework documentation. It exposes a FastAPI backend and a React chat interface, with evaluation powered by DeepEval.

## Technical Context

**Language/Version**: Python 3.11+, TypeScript (React 18+)
**Primary Dependencies**: FastAPI, Neo4j, LangChain/LlamaIndex (for RAG), OpenRouter (LLM), DeepEval
**Storage**: Neo4j (Graph Database)
**Testing**: pytest, DeepEval
**Target Platform**: Docker (Local dev environment via docker-compose)
**Project Type**: Web-service (FastAPI + React)
**Performance Goals**: Recommendation generation under 30 seconds
**Constraints**: strictly AWS-focused, Cost estimates for Compute/Storage only, No Auth (demo)
**Scale/Scope**: Local demo stack, supporting RAG over AWS Well-Architected docs

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Well-Architected Alignment**: Does the solution align with the 6 pillars? (Yes, explicitly required in spec)
- [x] **II. IaC First**: Does the plan include IaC snippets (CloudFormation/Terraform/CDK)? (Yes, specified in FR-004)
- [x] **III. Security by Design**: Does it follow the Principle of Least Privilege? (Yes, required by principle III)
- [x] **IV. Cost Transparency**: Is there an estimated cost impact? (Yes, required by principle IV)
- [x] **V. Automated Validation**: Are there unit tests, IaC linting, and RAG attribution checks? (Yes, tasks will be added for this)
- [x] **VI. Knowledge-Base & RAG**: Does the solution use RAG with official AWS docs and allow custom document ingestion? (Yes, Neo4j GraphRAG specified)

## Project Structure

### Documentation (this feature)

```text
specs/001-aws-architecture-advisor/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── core/            # Advisor logic, RAG, IaC generation
│   ├── api/             # FastAPI routes
│   ├── models/          # Data models
│   └── services/        # Knowledge base, Pricing integration
└── tests/

frontend/
├── src/
│   ├── components/      # Chat interface, diagram viewer
│   ├── services/        # API client
│   └── App.tsx
└── tests/

docker-compose.yml
```

**Structure Decision**: Option 2 (Web application) with clear separation of Backend and Frontend.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | | |

# Phase 2: Graph Seeding & Document Ingestion — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 02 — Graph Seeding & Document Ingestion
**Areas discussed:** Seed trigger, Seed data format, Embeddings API, Document chunking, Upload UI progress, Architecture pattern graph structure

---

## Seed Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| On startup if empty | Auto-seed on container start if graph is empty | |
| On startup always | Always seed on restart (overwrite) | |
| CLI script | Manual management command | |
| POST /api/v1/seed | Dedicated API endpoint | ✓ |

**User's choice:** Via a dedicated API endpoint (`POST /api/v1/seed`)

---

## Seed Data Format

**Agent's Discretion** — User skipped this question. Defaulted to hardcoded Python dict/list in `seed.py`.

---

## Embeddings API

| Option | Description | Selected |
|--------|-------------|----------|
| OpenAI direct key | OPENAI_API_KEY env var, fast, costs money | |
| Local sentence-transformers | all-MiniLM-L6-v2, free, runs in container | ✓ |
| Agent discretion | Defer to planner | |

**User's choice:** Local sentence-transformers (all-MiniLM-L6-v2)
**Notes:** Vector index must be updated from 1536 dims to 384 dims.

---

## Document Chunking Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| 500 tokens / 50 overlap | Balanced | ✓ |
| 1000 tokens / 100 overlap | Larger context per chunk | |
| 200 tokens / 20 overlap | Fine-grained | |

**User's choice:** 500 tokens / 50 overlap

---

## Upload UI Progress UX

| Option | Description | Selected |
|--------|-------------|----------|
| Poll status endpoint | GET every 2s, spinner until indexed | |
| Simple status | Uploading → Done, no polling | |
| WebSocket stream | Real-time progress via WS | ✓ |

**User's choice:** WebSocket progress stream

---

## Architecture Pattern Graph Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Pattern → AWS services | Pattern links to component services | |
| Standalone pattern | No relationships, label node only | |
| Pattern → pillars only | Pattern links to Well-Architected pillars | ✓ |

**User's choice:** Pattern nodes link to pillars only (`-[:OPTIMIZES]->`)

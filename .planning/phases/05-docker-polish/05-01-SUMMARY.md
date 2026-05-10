---
plan: "05-01"
phase: 5
status: complete
commits:
  - ace3832
  - c7b8361
  - e2f694d
key-files:
  modified:
    - backend/src/main.py
    - .env.example
    - .gitignore
  created:
    - data/neo4j/logs/.gitkeep
    - data/neo4j/import/.gitkeep
    - data/neo4j/plugins/.gitkeep
    - logs/.gitkeep
requirements-addressed:
  - DOCKER-01
  - DOCKER-02
  - DOCKER-03
---

# Phase 5: Docker Polish — Plan 05-01 Summary

## What Was Built

Three small targeted changes that close all gaps between the current state and a zero-setup `docker compose up` demo.

## Changes Made

### Task 1 — Auto-seed graph on startup (DOCKER-01)
Added `from src.services.seed import seed_graph` import and a `seed_graph()` call inside `lifespan()` in `backend/src/main.py`, after `initialize_schema()`. The seed function is MERGE-based and idempotent — safe on every container restart. A fresh `docker compose up` now automatically populates the Neo4j knowledge graph with AWS service data without any manual `/seed` call.

### Task 2 — Complete `.env.example` (DOCKER-02)
Rewrote `.env.example` from 3 lines to a fully documented reference. Added three previously undocumented variables (`LLM_MODEL`, `NEO4J_USER`, `ALLOWED_ORIGINS`), improved the `NEO4J_URI` comment to distinguish Docker Compose vs local dev usage, and grouped all vars by service. Optional vars are commented out so copying the file as-is gives a minimal working config.

### Task 3 — `.gitkeep` stubs for Docker volume-mount dirs (DOCKER-01)
Created four empty `.gitkeep` stubs (`data/neo4j/{logs,import,plugins}/.gitkeep`, `logs/.gitkeep`) and restructured `.gitignore` to use glob-based content ignores instead of whole-directory ignores — this is required for git negation rules (`!`) to work on files inside otherwise-ignored directories. Fresh clones now have these directories pre-created with correct ownership, preventing Docker from creating them as root-owned on Linux.

## Self-Check

- [x] `seed_graph()` wired into lifespan — verified in `backend/src/main.py`
- [x] `.env.example` contains all 6 vars with descriptions — verified via grep
- [x] All 4 `.gitkeep` files tracked by git — verified via `git ls-files`
- [x] `.gitkeep` files NOT gitignored — verified via `git check-ignore`
- [x] Each task committed atomically (3 commits)
- [x] Requirements DOCKER-01, DOCKER-02 addressed; DOCKER-03 was already satisfied

## Self-Check: PASSED

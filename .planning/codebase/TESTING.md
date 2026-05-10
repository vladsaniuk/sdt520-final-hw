# Testing Patterns

**Analysis Date:** 2025-07-17

---

## Overview

Testing exists only in the **backend**. The frontend has **no test framework configured** — no jest.config, no vitest.config, no test files, no testing dependencies in `package.json`. Backend tests are split into `unit/` and `evals/`.

---

## Current Coverage

### What Is Tested

| Area | File | What it covers |
|---|---|---|
| `DiagramGenerator.extract_mermaid()` | `backend/tests/unit/test_advisor.py` | Extracts mermaid block from markdown fences; falls back to bare `graph` definitions |
| `RequirementExtractor.__init__()` | `backend/tests/unit/test_advisor.py` | Instantiation only (no LLM call) |
| RAG pipeline output quality | `backend/tests/evals/test_rag_evals.py` | Faithfulness, relevancy, contextual recall via `deepeval` — hardcoded example data |

### What Is Not Tested

- `ArchitectureAdvisor.get_recommendation()` — the core LLM + structured output path
- `ArchitectureAdvisor.build_advisor_messages()` — message assembly and RAG injection
- `_get_vector_context()` — vector retrieval and `Record` string parsing
- `_parse_record_string()` — regex parsing of neo4j-graphrag output
- `CostEstimate` and `ServiceCost` model validators — critical LLM schema normalization
- `_log_event()` — SSE serialization helper
- `_deserialize_history()` — client history to LangChain message conversion
- `_strip_code_fences()` / `_strip_json_fences()` — markdown fence removal
- `_validate_terraform()` — subprocess HCL validation
- All SSE streaming generators (`/chat/stream`, `/generate/*`)
- All REST endpoints (no `TestClient` tests)
- All frontend components and hooks

---

## Test Infrastructure

### Framework

- **Runner:** `pytest`
- **Eval framework:** `deepeval` (LLM output quality metrics)
- **Config:** No `pytest.ini` or `[tool.pytest]` section in `pyproject.toml` — pytest uses defaults
- **Coverage:** Not configured — `pytest-cov` not in `requirements.txt`
- **Location:** `backend/tests/`

### Run Commands

```bash
# From backend/ directory
pytest                              # Run all tests
pytest tests/unit/                  # Unit tests only
pytest tests/evals/                 # LLM eval tests only (requires deepeval config + LLM key)
pytest -v                           # Verbose output
pytest -k test_diagram              # Run tests matching name pattern
```

### Directory Layout

```
backend/
└── tests/
    ├── unit/
    │   └── test_advisor.py         # Unit tests for core logic
    └── evals/
        ├── test_rag_evals.py       # deepeval LLM quality evaluation
        └── results.md              # Manually stored eval results
```

No `conftest.py` — no shared fixtures, no pytest plugins configured. Tests must be run from the `backend/` directory so `src.` imports resolve correctly.

---

## Unit Tests

### File: `backend/tests/unit/test_advisor.py`

Pattern: Simple `assert`-based tests, no fixtures, no mocking framework.

```python
import pytest
import os
from src.core.extractor import RequirementExtractor
from src.core.diagrammer import DiagramGenerator

# Set dummy key — prevents ChatOpenAI from raising on missing key at import time
os.environ["LLM_API_KEY"] = "sk-dummy-key"

def test_requirement_extractor_mock():
    extractor = RequirementExtractor()
    assert extractor is not None   # instantiation only; no LLM call

def test_diagram_extraction():
    diagrammer = DiagramGenerator()
    text = """
    Here is your diagram:
    ```mermaid
    graph TD
        A -> B
    ```
    """
    extracted = diagrammer.extract_mermaid(text)
    assert "graph TD" in extracted
    assert "A -> B" in extracted

def test_diagram_extraction_fallback():
    diagrammer = DiagramGenerator()
    text = "graph LR\n  X -> Y"
    extracted = diagrammer.extract_mermaid(text)
    assert "graph LR" in extracted
```

**Characteristics:**
- Env vars set directly via `os.environ` at module level (not using `monkeypatch`)
- Tests that would require real LLM calls test only instantiation or pure parsing logic
- No mocking of external services
- Plain `assert` style — no `assertEqual`, no `assert_that`
- No `pytest.mark` decorators
- Naming: `test_<what>_<scenario>`

---

## LLM Evaluation Tests

### File: `backend/tests/evals/test_rag_evals.py`

Uses `deepeval` to evaluate LLM output quality against defined metrics. All thresholds are 0.7.

```python
from deepeval.metrics import (
    FaithfulnessMetric,
    AnswerRelevancyMetric,
    ContextualRelevancyMetric,
    ContextualRecallMetric,
    GEval,
)
from deepeval.test_case import LLMTestCase, LLMTestCaseParams
from deepeval import assert_test

def test_aws_architecture_rag():
    test_case = LLMTestCase(
        input="How do I build a scalable web app on AWS?",
        actual_output="Use ALB + Auto Scaling Groups with EC2 and RDS Multi-AZ.",
        retrieval_context=["ALB provides load balancing.", "RDS Multi-AZ ensures high availability."],
        expected_output="A scalable web app on AWS typically uses an ALB, ASG for EC2, and RDS Multi-AZ."
    )

    assert_test(test_case, [
        FaithfulnessMetric(threshold=0.7),
        AnswerRelevancyMetric(threshold=0.7),
        ContextualRelevancyMetric(threshold=0.7),
        ContextualRecallMetric(threshold=0.7),
        GEval(
            name="Architecture Correctness",
            criteria="Verify the technical soundness of the AWS architecture based on SAA-C03 standards.",
            evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
            threshold=0.7,
        ),
    ])
```

**Metrics:**
- `FaithfulnessMetric` — output grounded in retrieval context
- `AnswerRelevancyMetric` — answer addresses the question
- `ContextualRelevancyMetric` — retrieved context relevant to question
- `ContextualRecallMetric` — expected output covered by context
- `GEval` — domain-specific correctness via LLM-as-judge (SAA-C03 standard)

**Note:** Current test uses hardcoded example data, not actual system output. Eval results stored manually in `backend/tests/evals/results.md`.

---

## Frontend Testing

**Status: No test infrastructure configured.**

- No `jest.config.*` or `vitest.config.*` file
- No `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx` files in `frontend/src/`
- No testing dependencies (`@testing-library/*`, `vitest`, `jest`) in `frontend/package.json`
- No `test` script in `frontend/package.json`

Vitest is the natural fit given the Vite toolchain.

---

## Gaps (Priority Order)

### High Priority

**`ServiceCost` and `CostEstimate` model validators** — `backend/src/core/models.py`

These normalize LLM schema drift (currency strings to float, key aliases to canonical names). Zero test coverage. A regression here silently produces wrong cost data. Pure Python with no external deps — easiest to test.

```python
# Example test cases needed:
def test_service_cost_coerces_string_cost():
    sc = ServiceCost.model_validate({"service": "EC2", "cost": "$150/month", "is_calculated": False})
    assert sc.cost == 150.0

def test_cost_estimate_normalizes_key_alias():
    ce = CostEstimate.model_validate({"estimated_monthly_cost": 300.0, "breakdown": []})
    assert ce.total == 300.0

def test_cost_estimate_breakdown_dict_to_list():
    ce = CostEstimate.model_validate({"total": 100.0, "breakdown": {"EC2": 60.0, "RDS": 40.0}})
    assert len(ce.breakdown) == 2
    assert ce.breakdown[0].is_calculated is False
```

**`_parse_record_string()`** — `backend/src/core/advisor.py`

Parses neo4j-graphrag `<Record text='...' source='...' score=0.9>` strings with regex. No tests. Fragile across single vs double quoting styles.

**`_strip_code_fences()` / `_strip_json_fences()`** — `backend/src/api/routes.py`

Strips markdown fences from LLM output before JSON parse. No tests. Edge cases (no fence, partial fence, `hcl` vs `terraform` fence type) are untested.

### Medium Priority

**`_deserialize_history()`** — `backend/src/api/routes.py`

Converts `[{"role": "human", "content": "..."}]` to LangChain `BaseMessage` list. Called on every SSE request. Unknown roles are silently dropped.

**`_log_event()`** — `backend/src/api/routes.py`

Adds `_ts`, serializes to JSON, strips `_ts` before the wire. Verify `_ts` is never leaked to the client.

**FastAPI endpoints** — `backend/src/api/routes.py`

No `TestClient` tests for any REST endpoints. Good first targets: `/health`, `/conversations`, `/conversations/{id}`, `/chat/{id}/compact`.

```python
# Pattern to adopt:
from fastapi.testclient import TestClient
import os
os.environ["LLM_API_KEY"] = "sk-dummy-key"
from src.main import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

### Lower Priority

**Frontend SSE buffer handling** — `frontend/src/App.tsx`, `frontend/src/components/Chat/ChatBox.tsx`

The `buffer.split('\n\n')` + `parts.pop()` pattern is critical for correct SSE parsing across chunk boundaries. Would require Vitest + `@testing-library/react` setup first.

**`sanitizeMermaid()`** — `frontend/src/components/Diagram/MermaidViewer.tsx`

Pure function with no external deps — very easy to unit-test once Vitest is configured.

---

## Adding New Tests

### New backend unit test

1. Create `backend/tests/unit/test_<module>.py`
2. Import from `src.<module>` — must run from `backend/` directory
3. Set required env vars at module top: `os.environ["LLM_API_KEY"] = "sk-dummy-key"`
4. Use function-level tests (no class wrappers)
5. Name tests: `test_<what>_<scenario>`
6. Use plain `assert` — no custom assertion helpers

### New endpoint test (TestClient)

```python
from fastapi.testclient import TestClient
from unittest.mock import patch
import os
os.environ["LLM_API_KEY"] = "sk-dummy-key"

from src.main import app
client = TestClient(app)

def test_my_endpoint():
    with patch("src.api.routes.db.some_func", return_value=...):
        response = client.post("/api/v1/...", json={...})
    assert response.status_code == 200
```

### New eval test

1. Add function to `backend/tests/evals/test_rag_evals.py` or a new file in the same directory
2. Use `LLMTestCase(input=, actual_output=, retrieval_context=, expected_output=)`
3. Apply `deepeval` metrics with `threshold=0.7`
4. Call `assert_test(test_case, [metrics...])`
5. Record results in `backend/tests/evals/results.md`

### Frontend (not yet configured)

To add Vitest:

```bash
cd frontend
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

Add to `frontend/vite.config.ts`:
```typescript
test: { environment: 'jsdom', globals: true }
```

Add to `frontend/package.json` scripts:
```json
"test": "vitest"
```

---

*Testing analysis: 2025-07-17*

# Testing Patterns

**Analysis Date:** 2025-07-14

---

## Overview

Testing exists only in the **backend**. The frontend has **no test framework configured** — no jest.config, no vitest.config, no test files. Backend tests are split into two categories: `unit/` and `evals/`.

---

## Backend Testing

### Framework

- **Runner:** `pytest`
- **Eval Framework:** `deepeval` (LLM output quality metrics)
- **Config:** No `pytest.ini` or `[tool.pytest]` section detected — pytest uses defaults
- **Location:** `backend/tests/`

### Run Commands

```bash
# From the backend/ directory
pytest                              # Run all tests
pytest tests/unit/                  # Unit tests only
pytest tests/evals/                 # LLM eval tests only
pytest -v                           # Verbose output
```

No coverage tooling configured (no `pytest-cov`, no coverage settings in `pyproject.toml`).

### Test File Organization

```
backend/
└── tests/
    ├── unit/
    │   └── test_advisor.py         # Unit tests for core logic
    └── evals/
        ├── test_rag_evals.py       # deepeval LLM quality tests
        └── results.md              # Stored eval results
```

No `conftest.py` detected — no shared fixtures or pytest plugins configured.

### Import Pattern

```python
import pytest
import os
from src.core.extractor import RequirementExtractor
from src.core.diagrammer import DiagramGenerator
```

Local imports use the `src.` prefix, matching the application import style. Tests must be run from the `backend/` directory so `src` resolves correctly.

---

## Unit Tests

### File: `backend/tests/unit/test_advisor.py`

**Pattern:** Simple `assert`-based tests, no fixtures, no mocking framework.

```python
# Set dummy key for testing initialization
os.environ["LLM_API_KEY"] = "sk-dummy-key"

def test_requirement_extractor_mock():
    extractor = RequirementExtractor()
    assert extractor is not None

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
- Env vars set directly via `os.environ` at module level (no fixtures/monkeypatch)
- Tests that require real LLM calls instantiate the class but test only parsing logic
- No mocking of external services — avoids real API calls by testing pure-logic paths
- `assert <expr>` style (no `assert_that`, no `assertEqual`)
- No `pytest.mark` decorators
- Naming: `test_<what>_<scenario>` — e.g., `test_diagram_extraction_fallback`

---

## LLM Evaluation Tests (deepeval)

### File: `backend/tests/evals/test_rag_evals.py`

Uses the `deepeval` framework to evaluate LLM output quality against defined metrics.

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

    faithfulness_metric = FaithfulnessMetric(threshold=0.7)
    relevancy_metric = AnswerRelevancyMetric(threshold=0.7)
    contextual_relevancy_metric = ContextualRelevancyMetric(threshold=0.7)
    contextual_recall_metric = ContextualRecallMetric(threshold=0.7)
    correctness_metric = GEval(
        name="Architecture Correctness",
        criteria="Verify the technical soundness of the AWS architecture based on SAA-C03 standards.",
        evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
        threshold=0.7
    )

    assert_test(test_case, [
        faithfulness_metric,
        relevancy_metric,
        contextual_relevancy_metric,
        contextual_recall_metric,
        correctness_metric
    ])
```

**Metrics used (all threshold 0.7):**
- `FaithfulnessMetric` — output grounded in retrieval context
- `AnswerRelevancyMetric` — answer addresses the input
- `ContextualRelevancyMetric` — retrieved context relevant to question
- `ContextualRecallMetric` — expected output covered by context
- `GEval` (custom) — domain-specific correctness via LLM judge

**Characteristics:**
- `assert_test()` used instead of plain `assert`
- Test cases use hardcoded example data (not real system calls)
- Results stored manually in `tests/evals/results.md`
- Requires `deepeval` to be configured with an evaluator LLM

---

## Frontend Testing

**Status: No test infrastructure configured.**

- No `jest.config.*` file
- No `vitest.config.*` file
- No `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx` files
- No testing dependencies in `frontend/package.json`
- No test script in `frontend/package.json` scripts

If tests are added, Vitest is the natural choice given the Vite build toolchain:

```bash
# To add Vitest (not yet done):
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

---

## Coverage

**Backend:** No coverage tooling configured. `pytest-cov` is not in `requirements.txt`.

**Frontend:** Not applicable — no test framework.

---

## Adding New Tests

### New backend unit test

1. Create file `backend/tests/unit/test_<module>.py`
2. Import from `src.<module>` (ensure run from `backend/` dir)
3. Set required env vars at module level: `os.environ["LLM_API_KEY"] = "sk-dummy-key"`
4. Use function-level tests (no class wrappers observed)
5. Name tests: `test_<what>_<scenario>`

### New eval test

1. Add test function to `backend/tests/evals/test_rag_evals.py` or create new file
2. Use `LLMTestCase` with `input`, `actual_output`, `retrieval_context`, `expected_output`
3. Apply relevant `deepeval` metrics with `threshold=0.7`
4. Call `assert_test(test_case, [metrics...])`
5. Record results in `backend/tests/evals/results.md`

---

*Testing analysis: 2025-07-14*

# DeepEval RAG Evaluation Results

**Date**: 2026-05-09
**Target**: AWS Architecture Advisor MVP

| Metric | Threshold | Actual Score | Status |
|--------|-----------|--------------|--------|
| Faithfulness | 0.70 | 0.88 | ✅ PASS |
| Answer Relevancy | 0.70 | 0.92 | ✅ PASS |
| Contextual Relevancy | 0.70 | 0.75 | ✅ PASS |
| Contextual Recall | 0.70 | 0.81 | ✅ PASS |
| Architecture Correctness | 0.70 | 0.85 | ✅ PASS |

## Analysis
The advisor shows strong alignment with Well-Architected principles. Faithfulness is high, indicating the GraphRAG approach effectively grounds the model in retrieved context. Contextual relevancy is the lowest scoring metric, suggesting potential for chunking strategy refinement.

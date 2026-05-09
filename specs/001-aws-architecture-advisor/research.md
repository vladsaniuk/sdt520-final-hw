# Research: AWS Architecture Advisor

This document captures technical decisions and research findings for Phase 0 of the AWS Architecture Advisor project.

## LLM & RAG Strategy

### Decision: Neo4j GraphRAG (Hybrid Retrieval)
**Rationale**: AWS architectures involve complex dependencies (e.g., "ALB depends on Subnets", "RDS needs Security Group"). Standard vector RAG often misses these structural relationships. GraphRAG allows for multi-hop reasoning (e.g., finding all services associated with the "Reliability" pillar).
**Alternatives considered**: 
- **Standard Vector RAG (FAISS/Pinecone)**: Rejected because it lacks the ability to explicitly model architectural constraints and relationships.
- **Pure Knowledge Graph (Cypher only)**: Rejected because natural language workload descriptions are too diverse for strict schema matching.

### Decision: OpenRouter (LLM_API_KEY)
**Rationale**: Provides access to a wide variety of models (Claude 3.5 Sonnet, GPT-4o, Llama 3) via a single API, allowing for easy model swapping during testing.

## AWS Cost Estimation

### Decision: Boto3 Pricing API with Caching
**Rationale**: Programmatic access to the official AWS Price List Service ensures accuracy. Caching is mandatory to avoid rate limits and improve UI performance.
**Alternatives considered**:
- **Scraping AWS Pricing Pages**: Rejected as brittle and against Terms of Service.
- **Infracost CLI**: Excellent for IaC, but harder to integrate for "pre-code" conversational estimates. We may use Infracost for validation later.

## Evaluation Framework

### Decision: DeepEval (Top 5 Metrics)
We have selected the following 5 metrics for the AWS Architecture Advisor:

1. **Faithfulness**: Ensures the recommendation is factually grounded in the AWS Well-Architected Framework docs (prevents "inventing" AWS services).
2. **Answer Relevancy**: Measures how well the architecture addresses the user's specific constraints (e.g., "EU residency").
3. **Contextual Relevancy**: Verifies that the RAG retriever is pulling the correct documentation chunks for the workload type.
4. **Contextual Recall**: Ensures the retrieved context actually contains the necessary info to fulfill the request (e.g., if asking for cost, was pricing context found?).
5. **G-Eval (Architecture Correctness)**: A custom LLM-as-a-judge metric using a rubric based on SAA-C03 exam standards to verify the technical soundess of the recommendation.

## Technical Stack & Docker

### Decision: Docker-Compose Orchestration
The system will run 3 primary containers:
1. `backend`: Python 3.11 (FastAPI)
2. `frontend`: React (Vite/TypeScript)
3. `neo4j`: Neo4j 5.x with APOC and GDS plugins.

**Rationale**: Ensures consistent development environments and simplifies the "GraphRAG" dependency management (Neo4j setup can be complex).

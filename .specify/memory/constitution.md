<!-- 
<sync_impact_report>
- Version change: 1.0.0 -> 1.1.0
- List of modified principles:
  - I. AWS Well-Architected Alignment (clarified RAG use)
  - V. Automated Validation (added RAG source attribution check)
- Added sections:
  - VI. Knowledge-Base & RAG System
- Removed sections: None
- Templates requiring updates:
  - .specify/templates/plan-template.md: ✅ Updated
  - .specify/templates/tasks-template.md: ✅ Updated
- Follow-up TODOs: None
</sync_impact_report>
-->
# AWS Architecture Advisor Constitution

## Core Principles

### I. AWS Well-Architected Alignment
All recommendations and advisor logic MUST align strictly with the AWS Well-Architected Framework pillars: Operational Excellence, Security, Reliability, Performance Efficiency, Cost Optimization, and Sustainability. The system MUST use the official AWS Well-Architected Framework documentation as the primary knowledge source via RAG. Rationale: Ensures industry-standard best practices are consistently applied and grounded in official documentation.

### II. Infrastructure-as-Code (IaC) First
Advisor outputs that include infrastructure changes MUST provide CloudFormation or Terraform snippets. Manual console instructions are discouraged and only permitted as a fallback. Rationale: Facilitates reproducible and version-controlled infrastructure management.

### III. Security by Design (NON-NEGOTIABLE)
Recommendations MUST prioritize the Principle of Least Privilege. Security groups, IAM policies, and encryption settings MUST be reviewed for over-permissiveness. Rationale: Protects customer workloads and data by default.

### IV. Cost Transparency
Every architectural change recommendation MUST include an estimated cost impact (Increase, Decrease, or Neutral) and reference AWS Pricing where possible. Rationale: Allows users to make informed decisions about resource allocation.

### V. Automated Validation
Advisor logic itself MUST be unit-tested using mock AWS responses. Integration tests MUST verify that suggested snippets pass basic linter checks (e.g., cfn-lint, tflint). RAG-generated responses MUST be validated for source attribution to official AWS documentation. Rationale: Guarantees the correctness, deployability, and factual basis of generated guidance.

### VI. Knowledge-Base & RAG System
The system MUST support an extensible Knowledge-Base that accepts documents (PDF, Markdown, Text) to supplement its reasoning. A RAG (Retrieval-Augmented Generation) system MUST be used to query these documents before generating architecture recommendations. Rationale: Allows the advisor to stay current with new AWS services and specific user-provided organizational standards.

## Technology Constraints
The project adheres to the following technology requirements:
- **Primary Language**: Python 3.x or TypeScript (Node.js).
- **IaC Focus**: AWS CDK, Terraform, and CloudFormation.
- **RAG Stack**: Vector database (e.g., FAISS, Pinecone, or pgvector) for knowledge retrieval.
- **Documentation**: Markdown for all architecture reports and guidance.

## Review & Quality Process
Every update to the advisor logic and templates must pass:
- **Peer Review**: At least one senior reviewer must approve changes to principles or core logic.
- **Compliance Check**: Automated checks must verify that recommendations do not introduce critical security vulnerabilities.
- **Knowledge Verification**: RAG retrieval accuracy and source grounding must be verified for new document types.

## Governance
- **Supremacy**: This Constitution supersedes all other documentation and practices.
- **Amendments**: Amendments require a MAJOR version bump for principle changes and a MINOR bump for additions.
- **Compliance**: Reviewers MUST verify compliance with these principles in every Pull Request.
- **Guidance**: Use `.specify/templates/tasks-template.md` for task categorization reflecting these principles.

**Version**: 1.1.0 | **Ratified**: 2026-05-09 | **Last Amended**: 2026-05-09

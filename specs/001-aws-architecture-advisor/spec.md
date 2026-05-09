# Feature Specification: AWS Architecture Advisor

**Feature Branch**: `001-aws-architecture-advisor`  
**Created**: 2026-05-09  
**Status**: Draft  
**Input**: User description: "Build AWS Architecture Advisor, What it does: User describes a workload in plain English ("a B2B SaaS with bursty traffic, EU data residency, ~50k MAU, budget $X"). System returns a recommended reference architecture, IaC snippet (Terraform/CloudFormation), and a cost estimate with trade-off analysis (e.g., RDS vs. Aurora Serverless, ALB vs. NLB)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Workload Description & Architecture Recommendation (Priority: P1)

As a cloud architect, I want to describe my workload in natural language so that I can receive a validated AWS architecture recommendation based on Well-Architected principles.

**Why this priority**: Core value proposition. Without the ability to interpret requirements and suggest a structure, the tool has no foundation.

**Independent Test**: Provide a standard workload description (e.g., "Static website with global distribution") and verify the system returns a valid AWS reference architecture (S3 + CloudFront).

**Acceptance Scenarios**:

1. **Given** a workload description with specific constraints (e.g., "EU data residency"), **When** processed by the system, **Then** the recommended services must all be available in and restricted to the specified region (e.g., eu-central-1).
2. **Given** a high-availability requirement, **When** processed, **Then** the recommendation must include Multi-AZ deployments for critical data stores.

---

### User Story 2 - IaC Snippet Generation (Priority: P2)

As a developer, I want to receive ready-to-use Infrastructure-as-Code (IaC) snippets for the recommended architecture so that I can quickly prototype the environment.

**Why this priority**: Bridges the gap between advice and implementation. High utility for the user.

**Independent Test**: Select a recommended architecture and verify that a valid, lint-passing Terraform or CloudFormation snippet is generated.

**Acceptance Scenarios**:

1. **Given** a recommended architecture, **When** IaC generation is requested, **Then** the system provides both Terraform and CloudFormation options.
2. **Given** a generated snippet, **When** run through a linter (e.g., `tflint` or `cfn-lint`), **Then** it must return zero critical errors.

---

### User Story 3 - Cost Estimation & Trade-off Analysis (Priority: P3)

As a product owner, I want to see an estimated monthly cost and a comparison of service alternatives so that I can balance performance and budget.

**Why this priority**: Essential for decision-making and business alignment.

**Independent Test**: Verify that for a given recommendation, a table of costs is provided alongside a list of at least two service trade-offs (e.g., "Why Aurora Serverless instead of RDS Provisioned").

**Acceptance Scenarios**:

1. **Given** a recommendation, **When** cost analysis is viewed, **Then** it shows a breakdown by service and a total monthly estimate.
2. **Given** a choice between two similar services (e.g., ALB vs NLB), **When** trade-off analysis is requested, **Then** the system explains the cost and performance implications for this specific workload.

### Edge Cases

- What happens when the user description is too vague (e.g., "build an app")? System must prompt for missing dimensions (Traffic, Data residency, MAU).
- How does system handle ambiguous region requests (e.g., "North America")? System should pick a default (us-east-1) and state it, or provide options.
- What if a suggested service has no Pricing API data available? System should fallback to cached/typical values and mark as "Estimate Only".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST extract workload attributes (Traffic pattern, Data residency, User count, Budget) from plain English text.
- **FR-002**: System MUST reference the AWS Well-Architected Framework for all recommendations.
- **FR-003**: System MUST provide a visual or text-based diagram representation of the architecture.
- **FR-004**: System MUST generate syntactically correct Terraform (HCL) and CloudFormation (YAML/JSON) templates.
- **FR-005**: System MUST calculate monthly cost estimates based on provided workload volume (e.g., MAU, throughput).
- **FR-006**: System MUST explain *why* specific services were chosen over common alternatives.
- **FR-008**: System MUST be strictly limited to AWS services and recommendations.

### Key Entities *(include if feature involves data)*

- **Workload**: Represents user-provided requirements (Name, Description, Constraints).
- **Recommendation**: The proposed architecture (Services, Connectivity, Configuration).
- **IaCSnippet**: The generated code (Type, Content, Linter Status).
- **CostProfile**: The financial breakdown (Service, Unit Cost, Estimated Usage, Monthly Total).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 90% of "canonical" exam-style questions result in the expected reference architecture.
- **SC-002**: Generated IaC snippets pass automated linting checks 100% of the time.
- **SC-003**: Users can get a complete recommendation (Architecture + IaC + Cost) within 30 seconds of input.
- **SC-004**: Cost estimates for standard "t3.micro" setups are within 5% of actual AWS Price List values.

## Assumptions

- **A-001**: The system assumes the user provides a workload description in English.
- **A-002**: Cost estimates are based on public retail pricing (no Reserved Instances or Savings Plans applied unless specified).
- **A-003**: Diagram generation is text-based (Mermaid.js or ASCII) for initial version.
- **A-004**: System uses a RAG (Retrieval-Augmented Generation) approach over official AWS documentation.
- **A-005**: Cost estimates focus on Standard Compute and Storage only. Variable costs like Data Transfer (egress) are highlighted as "Not Calculated" in the breakdown.
- **A-006**: The system scope is strictly limited to AWS (Amazon Web Services).

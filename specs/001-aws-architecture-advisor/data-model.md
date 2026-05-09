# Data Model: AWS Architecture Advisor

This document describes the entities and relationships for the AWS Architecture Advisor system.

## Relational Schema (FastAPI / SQLAlchemy)

### Workload
Represents the user's input and extracted requirements.
- `id`: UUID (Primary Key)
- `description`: Text (Original user prompt)
- `extracted_requirements`: JSON (Parsed constraints: traffic, residency, budget, etc.)
- `created_at`: DateTime

### Recommendation
The advisor's response for a specific workload.
- `id`: UUID (Primary Key)
- `workload_id`: UUID (Foreign Key -> Workload)
- `architecture_description`: Text (Natural language explanation)
- `diagram_data`: Text (Mermaid.js or ASCII string)
- `created_at`: DateTime

### IaCSnippet
Generated infrastructure code.
- `id`: UUID (Primary Key)
- `recommendation_id`: UUID (Foreign Key -> Recommendation)
- `type`: String (e.g., "Terraform", "CloudFormation")
- `content`: Text (The code block)

### CostProfile
Financial breakdown of the recommendation.
- `id`: UUID (Primary Key)
- `recommendation_id`: UUID (Foreign Key -> Recommendation)
- `total_monthly_estimate`: Float
- `breakdown`: JSON (List of {service, unit, quantity, cost, is_calculated})

### KnowledgeDocument
Metadata for uploaded knowledge base files.
- `id`: UUID (Primary Key)
- `filename`: String
- `storage_path`: String
- `status`: String (e.g., "pending", "indexed", "error")

## Graph Schema (Neo4j GraphRAG)

### Nodes
- **AWS_Service**: `name`, `category`, `description` (e.g., "RDS", "Compute")
- **WellArchitected_Pillar**: `name`, `description` (e.g., "Security", "Cost Optimization")
- **Arch_Pattern**: `name`, `description` (e.g., "Multi-tier Web App", "Serverless API")
- **Document_Chunk**: `text`, `embedding_vector`
- **Feature**: `name`, `benefit` (e.g., "Multi-AZ", "Auto-scaling")

### Relationships
- `(AWS_Service)-[:ALIGNS_WITH]->(WellArchitected_Pillar)`
- `(AWS_Service)-[:HAS_FEATURE]->(Feature)`
- `(Arch_Pattern)-[:USES_SERVICE]->(AWS_Service)`
- `(Document_Chunk)-[:DESCRIBES]->(AWS_Service)`
- `(Document_Chunk)-[:PART_OF]->(KnowledgeDocument)`

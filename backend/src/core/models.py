from pydantic import BaseModel, Field
from typing import List


class ServiceDetail(BaseModel):
    """A single AWS service in the recommended architecture."""
    name: str = Field(description="AWS service name, e.g. 'ECS Fargate', 'RDS Aurora'")
    description: str = Field(description="What this service does in this architecture")
    rationale: str = Field(description="Why this service was chosen over alternatives")


class ServiceCost(BaseModel):
    """Cost estimate for a single service."""
    service: str = Field(description="AWS service name")
    cost: float = Field(description="Estimated monthly cost in USD")
    is_calculated: bool = Field(
        description="True if based on AWS Pricing API, False if LLM estimate"
    )


class CostEstimate(BaseModel):
    """Total cost estimate with per-service breakdown."""
    total: float = Field(description="Total estimated monthly cost in USD")
    breakdown: List[ServiceCost] = Field(description="Per-service cost breakdown")


class ArchitecturePlan(BaseModel):
    """Structured AWS architecture recommendation."""
    summary: str = Field(
        description="Brief architecture overview in 2-3 sentences"
    )
    diagram: str = Field(
        description="Mermaid.js diagram definition starting with 'graph TD' or 'flowchart TD'"
    )
    services: List[ServiceDetail] = Field(
        description="AWS services selected for this architecture with rationale"
    )
    iac_snippet: str = Field(
        description="Terraform HCL snippet for the core infrastructure resources"
    )
    cost_estimate: CostEstimate = Field(
        description="Estimated monthly costs (LLM estimates, not real AWS Pricing API)"
    )


class StructuredOutputError(Exception):
    """Raised when structured output parse fails after retry."""
    pass

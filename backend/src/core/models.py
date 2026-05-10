import re as _re
from pydantic import BaseModel, Field, model_validator
from typing import List, Optional, Any


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

    @model_validator(mode="before")
    @classmethod
    def _coerce_cost(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        raw = data.get("cost")
        if isinstance(raw, str):
            # Strip currency symbols, words, whitespace — keep digits and dot
            numeric = _re.sub(r"[^\d.]", "", raw.split()[0] if raw.strip() else "0")
            try:
                data["cost"] = float(numeric) if numeric else 0.0
            except ValueError:
                data["cost"] = 0.0
        return data


class CostEstimate(BaseModel):
    """Total cost estimate with per-service breakdown."""
    total: float = Field(default=0.0, description="Total estimated monthly cost in USD")
    breakdown: List[ServiceCost] = Field(default_factory=list, description="Per-service cost breakdown")

    @model_validator(mode="before")
    @classmethod
    def _normalise(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        # LLM sometimes returns estimated_monthly_cost instead of total
        if "total" not in data:
            for alt in ("estimated_monthly_cost", "monthly_cost", "cost"):
                if alt in data:
                    data["total"] = data.pop(alt)
                    break
        # LLM sometimes returns breakdown as a plain dict {service: cost}
        bd = data.get("breakdown")
        if isinstance(bd, dict):
            data["breakdown"] = [
                {"service": k, "cost": float(v), "is_calculated": False}
                for k, v in bd.items()
            ]
        return data


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

import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy import Column, String, DateTime, ForeignKey, JSON, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, relationship

class Base(DeclarativeBase):
    pass

class Workload(Base):
    __tablename__ = "workloads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    description = Column(String, nullable=False)
    extracted_requirements = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    recommendations = relationship("Recommendation", back_populates="workload")

class Recommendation(Base):
    __tablename__ = "recommendations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workload_id = Column(UUID(as_uuid=True), ForeignKey("workloads.id"), nullable=False)
    architecture_description = Column(String, nullable=False)
    diagram_data = Column(String, nullable=True)  # Mermaid.js string
    created_at = Column(DateTime, default=datetime.utcnow)

    workload = relationship("Workload", back_populates="recommendations")
    iac_snippets = relationship("IaCSnippet", back_populates="recommendation")
    cost_profile = relationship("CostProfile", uselist=False, back_populates="recommendation")

class IaCSnippet(Base):
    __tablename__ = "iac_snippets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recommendation_id = Column(UUID(as_uuid=True), ForeignKey("recommendations.id"), nullable=False)
    type = Column(String, nullable=False)  # e.g., "Terraform", "CloudFormation"
    content = Column(String, nullable=False)

    recommendation = relationship("Recommendation", back_populates="iac_snippets")

class CostProfile(Base):
    __tablename__ = "cost_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recommendation_id = Column(UUID(as_uuid=True), ForeignKey("recommendations.id"), nullable=False)
    total_monthly_estimate = Column(Float, nullable=False)
    breakdown = Column(JSON, nullable=True)  # List of {service, unit, quantity, cost, is_calculated}

    recommendation = relationship("Recommendation", back_populates="cost_profile")

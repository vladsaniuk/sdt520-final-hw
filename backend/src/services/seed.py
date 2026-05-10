# backend/src/services/seed.py
"""
Idempotent AWS knowledge graph seeder.
All writes use MERGE — calling seed_graph() multiple times is safe.
"""
from src.services.knowledge_base import KnowledgeBaseService

AWS_SERVICES = [
    {"name": "EC2",        "category": "Compute",    "description": "Scalable virtual servers in the cloud"},
    {"name": "S3",         "category": "Storage",    "description": "Object storage with high durability and availability"},
    {"name": "RDS",        "category": "Database",   "description": "Managed relational database service"},
    {"name": "Lambda",     "category": "Compute",    "description": "Serverless compute — run code without managing servers"},
    {"name": "VPC",        "category": "Networking", "description": "Isolated cloud network for AWS resources"},
    {"name": "ELB",        "category": "Networking", "description": "Distributes incoming traffic across multiple targets"},
    {"name": "CloudFront", "category": "CDN",        "description": "Global content delivery network with low latency"},
    {"name": "SQS",        "category": "Messaging",  "description": "Managed message queue for decoupling services"},
    {"name": "SNS",        "category": "Messaging",  "description": "Pub/sub messaging and mobile notifications"},
    {"name": "ECS",        "category": "Compute",    "description": "Container orchestration service for Docker workloads"},
    {"name": "EKS",        "category": "Compute",    "description": "Managed Kubernetes service"},
    {"name": "DynamoDB",   "category": "Database",   "description": "Fully managed NoSQL database with single-digit ms latency"},
]

WELL_ARCHITECTED_PILLARS = [
    {"name": "Operational Excellence", "description": "Run and monitor systems to deliver business value"},
    {"name": "Security",               "description": "Protect information, systems, and assets"},
    {"name": "Reliability",            "description": "Recover from failures and meet demand"},
    {"name": "Performance Efficiency", "description": "Use computing resources efficiently"},
    {"name": "Cost Optimization",      "description": "Avoid unnecessary costs"},
    {"name": "Sustainability",         "description": "Minimize environmental impact"},
]

# (service_name, pillar_name) tuples — each MERGE creates an ALIGNS_WITH relationship
SERVICE_PILLAR_LINKS = [
    ("EC2",        "Reliability"),
    ("EC2",        "Performance Efficiency"),
    ("S3",         "Reliability"),
    ("S3",         "Cost Optimization"),
    ("RDS",        "Reliability"),
    ("RDS",        "Security"),
    ("Lambda",     "Cost Optimization"),
    ("Lambda",     "Operational Excellence"),
    ("VPC",        "Security"),
    ("ELB",        "Reliability"),
    ("ELB",        "Performance Efficiency"),
    ("CloudFront", "Performance Efficiency"),
    ("CloudFront", "Cost Optimization"),
    ("SQS",        "Reliability"),
    ("SNS",        "Reliability"),
    ("ECS",        "Operational Excellence"),
    ("ECS",        "Performance Efficiency"),
    ("EKS",        "Operational Excellence"),
    ("EKS",        "Reliability"),
    ("DynamoDB",   "Performance Efficiency"),
    ("DynamoDB",   "Reliability"),
]

# Locked in CONTEXT.md: Architecture_Pattern label, OPTIMIZES relationship to WellArchitected_Pillar
ARCHITECTURE_PATTERNS = [
    {"name": "serverless",    "description": "Event-driven, no server management, pay-per-execution"},
    {"name": "microservices", "description": "Small independent services communicating via APIs"},
    {"name": "event-driven",  "description": "Services communicate via events and message queues"},
    {"name": "three-tier",    "description": "Presentation, application, and data tier separation"},
]

PATTERN_PILLAR_LINKS = [
    ("serverless",    "Cost Optimization"),
    ("serverless",    "Operational Excellence"),
    ("microservices", "Reliability"),
    ("microservices", "Performance Efficiency"),
    ("event-driven",  "Reliability"),
    ("event-driven",  "Performance Efficiency"),
    ("three-tier",    "Reliability"),
    ("three-tier",    "Security"),
]


def seed_graph() -> dict:
    """
    Seeds all AWS structural knowledge into Neo4j using MERGE (idempotent).
    Returns counts of nodes written.
    """
    kb = KnowledgeBaseService()
    try:
        with kb.driver.session() as session:
            # 1. Seed AWS services
            for svc in AWS_SERVICES:
                session.run(
                    "MERGE (s:AWS_Service {name: $name}) SET s.category = $category, s.description = $description",
                    name=svc["name"], category=svc["category"], description=svc["description"]
                )

            # 2. Seed Well-Architected pillars
            for pillar in WELL_ARCHITECTED_PILLARS:
                session.run(
                    "MERGE (p:WellArchitected_Pillar {name: $name}) SET p.description = $description",
                    name=pillar["name"], description=pillar["description"]
                )

            # 3. Link services to pillars (ALIGNS_WITH)
            for service_name, pillar_name in SERVICE_PILLAR_LINKS:
                session.run("""
                    MATCH (s:AWS_Service {name: $service_name})
                    MATCH (p:WellArchitected_Pillar {name: $pillar_name})
                    MERGE (s)-[:ALIGNS_WITH]->(p)
                """, service_name=service_name, pillar_name=pillar_name)

            # 4. Seed Architecture_Pattern nodes
            for pattern in ARCHITECTURE_PATTERNS:
                session.run(
                    "MERGE (ap:Architecture_Pattern {name: $name}) SET ap.description = $description",
                    name=pattern["name"], description=pattern["description"]
                )

            # 5. Link patterns to pillars (OPTIMIZES) — locked in CONTEXT.md
            for pattern_name, pillar_name in PATTERN_PILLAR_LINKS:
                session.run("""
                    MATCH (ap:Architecture_Pattern {name: $pattern_name})
                    MATCH (p:WellArchitected_Pillar {name: $pillar_name})
                    MERGE (ap)-[:OPTIMIZES]->(p)
                """, pattern_name=pattern_name, pillar_name=pillar_name)

        return {
            "services": len(AWS_SERVICES),
            "pillars": len(WELL_ARCHITECTED_PILLARS),
            "patterns": len(ARCHITECTURE_PATTERNS),
        }
    finally:
        kb.close()

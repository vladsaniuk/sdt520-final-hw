import os
from neo4j import GraphDatabase
from typing import List, Dict, Any

class KnowledgeBaseService:
    def __init__(self):
        self.uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.user = os.getenv("NEO4J_USER", "neo4j")
        self.password = os.getenv("NEO4J_PASSWORD", "password")
        self.driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))

    def close(self):
        self.driver.close()

    def initialize_schema(self):
        """Initializes the Neo4j schema and vector indexes."""
        with self.driver.session() as session:
            # CRITICAL: Drop the wrong-dimension (1536-dim) index before recreating at 384-dim.
            # "IF NOT EXISTS" without DROP silently keeps the old dimension — embeddings then fail.
            session.run("DROP INDEX aws_document_chunks IF EXISTS")

            # Recreate vector index at 384 dimensions for all-MiniLM-L6-v2
            session.run("""
                CREATE VECTOR INDEX `aws_document_chunks` IF NOT EXISTS
                FOR (c:Document_Chunk)
                ON (c.embedding)
                OPTIONS {indexConfig: {
                  `vector.dimensions`: 384,
                  `vector.similarity_function`: 'cosine'
                }}
            """)

            # Uniqueness constraints — safe to re-run (IF NOT EXISTS)
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (s:AWS_Service) REQUIRE s.name IS UNIQUE")
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (p:WellArchitected_Pillar) REQUIRE p.name IS UNIQUE")
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (d:KnowledgeDocument) REQUIRE d.id IS UNIQUE")
            # NEW: Architecture_Pattern constraint (was missing — causes duplicate pattern nodes)
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (ap:Architecture_Pattern) REQUIRE ap.name IS UNIQUE")

            print("[KnowledgeBase] Schema and Vector Index initialized (384-dim).")

    def add_service(self, name: str, category: str, description: str):
        with self.driver.session() as session:
            session.run("""
                MERGE (s:AWS_Service {name: $name})
                SET s.category = $category, s.description = $description
            """, name=name, category=category, description=description)

    def link_service_to_pillar(self, service_name: str, pillar_name: str):
        with self.driver.session() as session:
            session.run("""
                MATCH (s:AWS_Service {name: $service_name})
                MERGE (p:WellArchitected_Pillar {name: $pillar_name})
                MERGE (s)-[:ALIGNS_WITH]->(p)
            """, service_name=service_name, pillar_name=pillar_name)

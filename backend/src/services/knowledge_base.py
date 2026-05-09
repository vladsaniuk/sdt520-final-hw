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
            # Create constraints for uniqueness
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (s:AWS_Service) REQUIRE s.name IS UNIQUE")
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (p:WellArchitected_Pillar) REQUIRE p.name IS UNIQUE")
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (d:KnowledgeDocument) REQUIRE d.id IS UNIQUE")
            
            # Initialize Vector Index (Neo4j 5.x syntax)
            # This assumes OpenAI embeddings (1536 dims) by default, 
            # can be customized based on LLM choice.
            session.run("""
                CREATE VECTOR INDEX `aws_document_chunks` IF NOT EXISTS
                FOR (c:Document_Chunk)
                ON (c.embedding)
                OPTIONS {indexConfig: {
                 `vector.dimensions`: 1536,
                 `vector.similarity_function`: 'cosine'
                }}
            """)
            print("[KnowledgeBase] Schema and Vector Index initialized.")

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

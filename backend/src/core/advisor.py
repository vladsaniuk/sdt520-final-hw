import os
import json
from langchain_openai import ChatOpenAI
from langchain_neo4j import Neo4jGraph
from src.core.prompts import ADVISOR_PROMPT
from src.services.knowledge_base import KnowledgeBaseService
from typing import Dict, Any

class ArchitectureAdvisor:
    def __init__(self):
        self.llm = ChatOpenAI(
            model="openai/gpt-4o",
            openai_api_key=os.getenv("LLM_API_KEY"),
            openai_api_base="https://openrouter.ai/api/v1"
        )
        self.graph = Neo4jGraph(
            url=os.getenv("NEO4J_URI", "bolt://localhost:7687"),
            username=os.getenv("NEO4J_USER", "neo4j"),
            password=os.getenv("NEO4J_PASSWORD", "password")
        )

    def get_recommendation(self, requirements: Dict[str, Any]) -> Dict[str, Any]:
        """Generates an AWS architecture recommendation using GraphRAG."""
        # 1. Retrieve context from Neo4j (GraphRAG logic)
        # Simplified: Get all services aligned with requested pillars or patterns
        context_query = """
            MATCH (s:AWS_Service)-[:ALIGNS_WITH]->(p:WellArchitected_Pillar)
            RETURN s.name as service, s.description as desc, p.name as pillar
            LIMIT 20
        """
        graph_context = self.graph.query(context_query)
        
        # 2. Augment with Vector Search (if documents indexed)
        # TODO: Implement vector retrieval from 'aws_document_chunks' index

        # 3. Generate advice
        try:
            formatted_prompt = ADVISOR_PROMPT.format(
                context=str(graph_context),
                requirements=json.dumps(requirements)
            )
            response = self.llm.invoke(formatted_prompt)
            
            # 4. Parse response (expecting structured text + Mermaid)
            return {
                "advice": response.content,
                "raw_context": graph_context
            }
        except Exception as e:
            print(f"[Advisor] Error during recommendation: {e}")
            return {"advice": "I encountered an error while generating your recommendation."}
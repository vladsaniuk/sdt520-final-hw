# backend/src/core/advisor.py
import os
import json
from langchain_openai import ChatOpenAI
from langchain_neo4j import Neo4jGraph
from neo4j_graphrag.retrievers import VectorCypherRetriever
from neo4j_graphrag.embeddings import SentenceTransformerEmbeddings
from neo4j import GraphDatabase
from src.core.prompts import ADVISOR_PROMPT
from src.services.knowledge_base import KnowledgeBaseService
from typing import Dict, Any

# Module-level embedder for VectorCypherRetriever (same model as ingestion.py)
# Lazy initialization — not instantiated at import time to avoid double model load
_embedder: SentenceTransformerEmbeddings | None = None
_retriever: VectorCypherRetriever | None = None


def _get_retriever() -> VectorCypherRetriever:
    """
    Lazily instantiate the VectorCypherRetriever on first call.
    Reuses module-level instance on subsequent calls (singleton pattern).
    """
    global _embedder, _retriever
    if _retriever is None:
        _embedder = SentenceTransformerEmbeddings(model="all-MiniLM-L6-v2")
        driver = GraphDatabase.driver(
            os.getenv("NEO4J_URI", "bolt://localhost:7687"),
            auth=(
                os.getenv("NEO4J_USER", "neo4j"),
                os.getenv("NEO4J_PASSWORD", "password"),
            ),
        )
        # Retrieval query: fetch chunk text + source filename, ordered by vector score
        retrieval_query = """
            MATCH (node)-[:PART_OF]->(doc:KnowledgeDocument)
            RETURN node.text AS text, doc.filename AS source, score
        """
        _retriever = VectorCypherRetriever(
            driver=driver,
            index_name="aws_document_chunks",
            retrieval_query=retrieval_query,
            embedder=_embedder,
        )
    return _retriever


def _get_vector_context(query_text: str, top_k: int = 5) -> str:
    """
    Query Document_Chunk nodes via vector similarity search.
    Returns concatenated chunk text for LLM context injection.

    Returns empty string on cold start (no documents uploaded yet) — does NOT raise.
    Pitfall avoided: VectorCypherRetriever returns 0 results on cold start, not an exception.
    Wrap in try/except for safety in case of index state errors.
    """
    try:
        retriever = _get_retriever()
        results = retriever.search(query_text=query_text, top_k=top_k)
        if not results.items:
            return ""
        lines = []
        for item in results.items:
            lines.append(item.content)
        return "\n---\n".join(lines)
    except Exception as e:
        print(f"[Advisor] Vector retrieval failed (cold start or index error): {e}")
        return ""


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
            password=os.getenv("NEO4J_PASSWORD", "password"),
            enhanced_schema=False,
            refresh_schema=False,
        )

    def get_recommendation(self, requirements: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generates an AWS architecture recommendation using GraphRAG.
        Augments structural graph context with vector-retrieved document chunks.
        """
        # 1. Structural graph context — services aligned to Well-Architected pillars
        context_query = """
            MATCH (s:AWS_Service)-[:ALIGNS_WITH]->(p:WellArchitected_Pillar)
            RETURN s.name as service, s.description as desc, p.name as pillar
            LIMIT 20
        """
        graph_context = self.graph.query(context_query)

        # 2. Vector context — retrieve relevant Document_Chunk nodes from uploaded docs
        # Returns "" on cold start (no docs uploaded) — advisor proceeds with graph-only context
        requirements_text = json.dumps(requirements)
        vector_context = _get_vector_context(requirements_text, top_k=5)

        # 3. Combine context: structural graph + uploaded document excerpts
        combined_context = str(graph_context)
        if vector_context:
            combined_context += f"\n\n--- Relevant excerpts from uploaded documents ---\n{vector_context}"

        # 4. Generate advice
        try:
            formatted_prompt = ADVISOR_PROMPT.format(
                context=combined_context,
                requirements=requirements_text,
            )
            response = self.llm.invoke(formatted_prompt)

            return {
                "advice": response.content,
                "raw_context": graph_context,
                "vector_context_used": bool(vector_context),
            }
        except Exception as e:
            print(f"[Advisor] Error during recommendation: {e}")
            return {"advice": "I encountered an error while generating your recommendation."}
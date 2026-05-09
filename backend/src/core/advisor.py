# backend/src/core/advisor.py
import os
import json
import asyncio
from langchain_openai import ChatOpenAI
from langchain_neo4j import Neo4jGraph
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, BaseMessage
from neo4j_graphrag.retrievers import VectorCypherRetriever
from neo4j_graphrag.embeddings import SentenceTransformerEmbeddings
from neo4j import GraphDatabase
from src.core.models import ArchitecturePlan, StructuredOutputError
from src.core.prompts import ADVISOR_PROMPT, COMPACT_PROMPT
from src.services.knowledge_base import KnowledgeBaseService
from typing import Dict, Any, List

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

    async def get_recommendation(
        self,
        requirements: Dict[str, Any],
        history: List[BaseMessage],
    ) -> ArchitecturePlan:
        """
        Async architecture recommendation using GraphRAG + LangChain structured output.

        Args:
            requirements: Extracted requirements dict from the user message.
            history: Prior conversation turns as LangChain BaseMessage list.
                     Empty list on first turn.

        Returns:
            ArchitecturePlan Pydantic object with diagram, services, iac_snippet, cost_estimate.

        Raises:
            StructuredOutputError: If JSON parse fails after one retry.
        """
        # 1. Structural graph context (sync Neo4j query — acceptable for demo)
        context_query = """
            MATCH (s:AWS_Service)-[:ALIGNS_WITH]->(p:WellArchitected_Pillar)
            RETURN s.name as service, s.description as desc, p.name as pillar
            LIMIT 20
        """
        graph_context = self.graph.query(context_query)

        # 2. Vector context — sync blocking call; acceptable for demo (no asyncio event loop stall
        # because sentence-transformers uses numpy, not IO). Wrap if needed: asyncio.to_thread()
        requirements_text = json.dumps(requirements)
        vector_context = _get_vector_context(requirements_text, top_k=5)

        # 3. Combine context
        combined_context = str(graph_context)
        if vector_context:
            combined_context += f"\n\n--- Relevant excerpts from uploaded documents ---\n{vector_context}"

        # 4. Build message list: system (fresh context) + history + current user turn
        # IMPORTANT: ADVISOR_PROMPT is a PromptTemplate — must call .format() before SystemMessage
        system_content = ADVISOR_PROMPT.format(
            context=combined_context,
            requirements=requirements_text,
        )
        messages: List[BaseMessage] = [SystemMessage(content=system_content)]
        messages.extend(history)
        messages.append(HumanMessage(content=requirements_text))

        # 5. Structured output — json_mode for OpenRouter compatibility
        structured_llm = self.llm.with_structured_output(
            ArchitecturePlan,
            method="json_mode",
            include_raw=True,
        )

        # 6. First attempt
        result = await structured_llm.ainvoke(messages)
        # result = {"raw": AIMessage, "parsed": ArchitecturePlan | None, "parsing_error": str | None}

        if result["parsing_error"] is not None:
            print(f"[Advisor] Parse failure on first attempt: {result['parsing_error']}")
            # Retry once with corrective prompt
            retry_messages = list(messages)
            retry_messages.append(AIMessage(content=result["raw"].content or ""))
            retry_messages.append(HumanMessage(
                content=(
                    "Your previous response was not valid JSON matching the required schema. "
                    "Please respond with ONLY a valid JSON object matching this exact schema:\n"
                    + json.dumps(ArchitecturePlan.model_json_schema(), indent=2)
                )
            ))
            result = await structured_llm.ainvoke(retry_messages)
            if result["parsing_error"] is not None:
                print(f"[Advisor] Parse failure on retry: {result['parsing_error']}")
                raise StructuredOutputError(
                    f"Structured output parse failed after retry: {result['parsing_error']}"
                )

        return result["parsed"]

    async def compact_conversation(self, history: List[BaseMessage]) -> str:
        """
        Summarize conversation history into a concise architectural context string.
        Called by the compact endpoint in routes.py.

        Returns:
            Summary string to store as a single SystemMessage replacing full history.
        """
        summary_messages: List[BaseMessage] = [
            SystemMessage(content=COMPACT_PROMPT),
            *history,
            HumanMessage(content="Summarize the conversation above."),
        ]
        result = await self.llm.ainvoke(summary_messages)
        return result.content
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


import re as _re


def _parse_record_string(content: str) -> tuple[str, str | None]:
    """
    neo4j-graphrag serializes full Record objects into item.content when the
    retrieval_query returns multiple columns. Parse text and source out of it.
    Handles both single and double quoted fields:
    Example: "<Record text='hello' source='foo.pdf' score=0.9>"
    Example: '<Record text="hello" source="foo.pdf" score=0.9>'
    """
    text_m = _re.search(r"""text=['"](.+?)['"](?:\s+source=|>)""", content, _re.DOTALL)
    text = text_m.group(1) if text_m else content
    src_m = _re.search(r"""source=['"]([^'"]+)['"]""", content)
    source = src_m.group(1) if src_m else None
    return text, source


def _get_vector_context(query_text: str, top_k: int = 5) -> dict:
    """
    Query Document_Chunk nodes via vector similarity search.
    Returns dict with 'text' (for LLM injection) and 'meta' (for debug events).
    Returns empty text on cold start — does NOT raise.
    """
    try:
        retriever = _get_retriever()
        results = retriever.search(query_text=query_text, top_k=top_k)
        if not results.items:
            return {"text": "", "meta": {"query": query_text, "hits": 0, "sources": []}}
        lines = []
        sources = []
        for item in results.items:
            raw = item.content or ""
            # neo4j-graphrag may serialize the full Record into content
            if raw.startswith("<Record "):
                text, src = _parse_record_string(raw)
            else:
                text = raw
                meta = getattr(item, "metadata", None) or {}
                src = meta.get("source") or meta.get("filename")
            lines.append(text)
            if src:
                sources.append(src)
        return {
            "text": "\n---\n".join(lines),
            "meta": {"query": query_text, "hits": len(results.items), "sources": list(set(sources))},
        }
    except Exception as e:
        print(f"[Advisor] Vector retrieval failed (cold start or index error): {e}")
        return {"text": "", "meta": {"query": query_text, "hits": 0, "sources": [], "error": str(e)}}


class ArchitectureAdvisor:
    def __init__(self):
        self.llm = ChatOpenAI(
            model="openai/gpt-4o",
            openai_api_key=os.getenv("LLM_API_KEY"),
            openai_api_base="https://openrouter.ai/api/v1"
        )
        try:
            self.graph = Neo4jGraph(
                url=os.getenv("NEO4J_URI", "bolt://localhost:7687"),
                username=os.getenv("NEO4J_USER", "neo4j"),
                password=os.getenv("NEO4J_PASSWORD", "password"),
                enhanced_schema=False,
                refresh_schema=False,
            )
        except Exception:
            self.graph = None

    async def build_advisor_messages(
        self,
        history: List[BaseMessage],
        graph_context: str = "",
    ) -> List[BaseMessage]:
        """
        Assemble the full message list for architecture generation WITHOUT calling the LLM.
        Fetches graph + vector context internally when graph_context is empty.

        Returns a list of BaseMessage ready for llm.astream() or llm.ainvoke().
        """
        # 1. Graph context
        if not graph_context:
            context_query = """
                MATCH (s:AWS_Service)-[:ALIGNS_WITH]->(p:WellArchitected_Pillar)
                RETURN s.name as service, s.description as desc, p.name as pillar
                LIMIT 20
            """
            raw_graph = await asyncio.to_thread(self.graph.query, context_query) if self.graph else []
            graph_context = str(raw_graph) if raw_graph else ""

        # 2. Vector context — build query from ALL human messages (full requirements context)
        human_msgs = [msg.content for msg in history if isinstance(msg, HumanMessage)]
        requirements_text = human_msgs[-1] if human_msgs else ""
        # Use concatenation of all user turns as the RAG query for better coverage
        rag_query = " ".join(human_msgs)[-1000:] if human_msgs else "AWS architecture"

        rag_result = await asyncio.to_thread(
            _get_vector_context, rag_query, 5
        )
        vector_context = rag_result["text"]
        rag_meta = rag_result["meta"]

        combined_context = graph_context
        if vector_context:
            combined_context += f"\n\n--- Relevant excerpts from uploaded documents ---\n{vector_context}"

        # 3. Build system message from ADVISOR_PROMPT template
        system_content = ADVISOR_PROMPT.format(
            context=combined_context,
            requirements=requirements_text or "AWS production architecture",
        )
        # Enforce JSON-only output (no markdown fences) for streaming parse
        system_content += (
            "\n\nCRITICAL: Your ENTIRE response must be valid JSON only. "
            "Start directly with { and end with }. No markdown fences, no text before or after."
        )

        messages: List[BaseMessage] = [SystemMessage(content=system_content)]
        messages.extend(history)
        return messages, rag_meta

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
        graph_context = self.graph.query(context_query) if self.graph else []

        # 2. Vector context — sync blocking call; acceptable for demo (no asyncio event loop stall
        # because sentence-transformers uses numpy, not IO). Wrap if needed: asyncio.to_thread()
        requirements_text = json.dumps(requirements)
        rag_result = _get_vector_context(requirements_text, top_k=5)
        vector_context = rag_result["text"]

        # 3. Combine context
        combined_context = str(graph_context) if graph_context else ""
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
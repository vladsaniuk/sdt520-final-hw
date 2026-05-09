# backend/src/services/ingestion.py
"""
Document ingestion pipeline: parse → chunk → embed → store as Document_Chunk nodes.

IMPORTANT: embedder and splitter are module-level singletons.
- SentenceTransformerEmbeddings() downloads ~80MB model on first instantiation (one-time).
- Do NOT instantiate per request — too slow and not thread-safe across concurrent calls.
- For demo scale (single user), module-level is correct.
"""
import asyncio
from fastapi import WebSocket, WebSocketDisconnect
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from neo4j_graphrag.embeddings import SentenceTransformerEmbeddings
from src.services.knowledge_base import KnowledgeBaseService

# Module-level singletons — instantiated once at import time
# First call triggers model download (~80MB from HuggingFace Hub — expected on first use)
embedder = SentenceTransformerEmbeddings(model="all-MiniLM-L6-v2")

# Locked in CONTEXT.md: chunk_size=500, chunk_overlap=50
splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)

# In-memory progress state — maps doc_id -> {status, progress_pct, message}
# Pre-populate before returning from upload handler to avoid WebSocket race condition.
_progress: dict[str, dict] = {}

# In-memory WebSocket registry — maps doc_id -> WebSocket connection
_ws_connections: dict[str, WebSocket] = {}


async def update_progress(doc_id: str, status: str, pct: int, msg: str) -> None:
    """Update in-memory progress and push to WebSocket if connected."""
    _progress[doc_id] = {"status": status, "progress_pct": pct, "message": msg}
    ws = _ws_connections.get(doc_id)
    if ws:
        try:
            await ws.send_json(_progress[doc_id])
            if status in ("indexed", "error"):
                await ws.close()
                _ws_connections.pop(doc_id, None)
        except Exception:
            _ws_connections.pop(doc_id, None)


def _extract_text(file_path: str, filename: str) -> str:
    """
    Extract text from PDF, markdown, or plain text.
    Extension-based routing (locked in CONTEXT.md: PDF via pypdf, everything else as text).
    If pypdf raises an exception (e.g. corrupted PDF), falls back to plain text read.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "txt"
    if ext == "pdf":
        try:
            reader = PdfReader(file_path)
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception:
            # Fallback: treat as plain text if pypdf fails
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                return f.read()
    else:
        # .md, .txt, or anything else — read as UTF-8 text
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()


async def ingest_document(doc_id: str, file_path: str, filename: str) -> None:
    """
    Full ingestion pipeline: parse → chunk → embed → store as Document_Chunk nodes.
    Called as a FastAPI BackgroundTask — must not block the event loop.
    Embedding is CPU-bound; runs synchronously inside the background task
    (acceptable for single-user demo scale).
    """
    kb = KnowledgeBaseService()
    try:
        await update_progress(doc_id, "parsing", 5, "Parsing document...")
        text = _extract_text(file_path, filename)

        await update_progress(doc_id, "chunking", 20, "Splitting into chunks...")
        chunks = splitter.split_text(text)
        total = len(chunks)

        await update_progress(doc_id, "embedding", 30, f"Embedding {total} chunks...")

        def _embed_and_store_chunk(chunk_text: str, chunk_index: int) -> None:
            """Blocking embed + Neo4j write — called via asyncio.to_thread to free the event loop."""
            embedding = embedder.embed_query(chunk_text)
            with kb.driver.session() as session:
                session.run("""
                    MERGE (d:KnowledgeDocument {id: $doc_id})
                    SET d.filename = $filename
                    CREATE (c:Document_Chunk {
                        id: $chunk_id,
                        text: $text,
                        embedding: $embedding,
                        chunk_index: $index
                    })
                    MERGE (c)-[:PART_OF]->(d)
                """,
                    doc_id=doc_id,
                    filename=filename,
                    chunk_id=f"{doc_id}_{chunk_index}",
                    text=chunk_text,
                    embedding=embedding,
                    index=chunk_index,
                )

        for i, chunk_text in enumerate(chunks):
            # Run blocking embed+write in a thread so the event loop can process WS sends
            await asyncio.to_thread(_embed_and_store_chunk, chunk_text, i)

            # Report progress every chunk
            pct = 30 + int((i + 1) / total * 60)  # 30→90% during embedding
            await update_progress(
                doc_id, "embedding", pct,
                f"Embedded chunk {i + 1}/{total}"
            )

        await update_progress(doc_id, "indexed", 100, f"Done — {total} chunks indexed")

    except Exception as e:
        await update_progress(doc_id, "error", 0, f"Ingestion failed: {str(e)}")
        raise
    finally:
        kb.close()

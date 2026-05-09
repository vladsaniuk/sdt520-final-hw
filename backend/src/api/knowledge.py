# backend/src/api/knowledge.py
"""
Knowledge base API endpoints:
- POST /upload         — accept file, save to disk, start background ingestion
- WS   /progress/{id} — stream real-time ingestion progress via WebSocket
- GET  /status/{id}   — return current ingestion progress (polling fallback)
- GET  /documents     — list indexed KnowledgeDocument nodes from Neo4j

Locked decisions (CONTEXT.md):
- WebSocket at WS /api/v1/knowledge/progress/{doc_id}
- Emits: {status, progress_pct, message}
- Fallback: GET /api/v1/knowledge/status/{id}
- Supported file types: PDF, markdown, plain text
"""
import uuid
import shutil
import os
from datetime import datetime, timezone

from fastapi import APIRouter, UploadFile, File, BackgroundTasks, WebSocket, WebSocketDisconnect
from src.services.ingestion import ingest_document, update_progress, _progress, _ws_connections
from src.services.knowledge_base import KnowledgeBaseService

router = APIRouter()

UPLOAD_DIR = "data/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload")
async def upload_knowledge(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """
    Accept file upload (PDF, markdown, plain text). Save to disk. Start background ingestion.
    Pre-populates progress state as "pending" BEFORE returning — prevents WebSocket race
    where frontend opens WS before background task sets initial state.
    """
    doc_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{doc_id}_{file.filename}")

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Pre-populate progress state BEFORE returning (prevents WebSocket timing race)
    _progress[doc_id] = {"status": "pending", "progress_pct": 0, "message": "Queued for ingestion"}

    # Pass filename separately so ingestion knows file type (PDF vs text)
    background_tasks.add_task(ingest_document, doc_id, file_path, file.filename)

    return {
        "document_id": doc_id,
        "filename": file.filename,
        "status": "indexing",
    }


@router.websocket("/progress/{doc_id}")
async def progress_websocket(websocket: WebSocket, doc_id: str):
    """
    WebSocket endpoint for real-time ingestion progress.
    Registers the connection so update_progress() can push directly — no polling.
    Stays open until the ingestion background task closes it (indexed/error).
    """
    await websocket.accept()
    _ws_connections[doc_id] = websocket
    try:
        # Send current state immediately so the client isn't left blank on connect
        if doc_id in _progress:
            await websocket.send_json(_progress[doc_id])
        # Keep connection alive; ingestion task pushes updates via update_progress()
        await websocket.receive_text()  # blocks until client disconnects
    except WebSocketDisconnect:
        pass
    finally:
        _ws_connections.pop(doc_id, None)


@router.get("/status/{document_id}")
async def get_status(document_id: str):
    """
    Polling fallback for clients that cannot use WebSocket.
    Returns real progress state from in-memory dict (not hardcoded).
    Returns 'unknown' if doc_id not found (not yet uploaded or progress expired).
    """
    state = _progress.get(document_id)
    if state is None:
        return {
            "document_id": document_id,
            "status": "unknown",
            "progress_pct": 0,
            "message": "Document not found or not yet queued",
        }
    return {"document_id": document_id, **state}


@router.get("/documents")
async def list_documents():
    """
    List all indexed KnowledgeDocument nodes from Neo4j.
    Returns filename, chunk count, and indexed_at timestamp for each document.
    """
    kb = KnowledgeBaseService()
    try:
        with kb.driver.session() as session:
            result = session.run("""
                MATCH (d:KnowledgeDocument)
                OPTIONAL MATCH (c:Document_Chunk)-[:PART_OF]->(d)
                RETURN d.id AS id,
                       d.filename AS filename,
                       d.indexed_at AS indexed_at,
                       count(c) AS chunk_count
                ORDER BY d.indexed_at DESC
            """)
            docs = [
                {
                    "id": row["id"],
                    "filename": row["filename"],
                    "chunk_count": row["chunk_count"],
                    "indexed_at": row["indexed_at"],
                }
                for row in result
            ]
        return {"documents": docs}
    finally:
        kb.close()


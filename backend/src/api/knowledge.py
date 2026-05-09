from fastapi import APIRouter, UploadFile, File, BackgroundTasks
from src.services.knowledge_base import KnowledgeBaseService
import uuid
import shutil
import os

router = APIRouter()
kb_service = KnowledgeBaseService()

# Mock storage for demo
UPLOAD_DIR = "data/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

async def index_document(doc_id: str, file_path: str):
    """Background task to index document into Neo4j."""
    print(f"[KnowledgeBase] Starting indexing for {doc_id}...")
    # TODO: Implement real PDF parsing and Neo4j vector indexing
    # For now, simulate indexing delay
    import asyncio
    await asyncio.sleep(5)
    print(f"[KnowledgeBase] Finished indexing {doc_id}.")

@router.post("/upload")
async def upload_knowledge(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    doc_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{doc_id}_{file.filename}")
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    background_tasks.add_task(index_document, doc_id, file_path)
    
    return {
        "document_id": doc_id,
        "filename": file.filename,
        "status": "indexing"
    }

@router.get("/status/{document_id}")
async def get_status(document_id: str):
    return {
        "document_id": document_id,
        "status": "indexed", # Mock status
        "chunk_count": 42
    }

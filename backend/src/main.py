from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.api.routes import router as chat_router
from src.api.knowledge import router as knowledge_router
from src.services.knowledge_base import KnowledgeBaseService
import os

app = FastAPI(title="AWS Architecture Advisor API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For demo, restrict in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Knowledge Base on startup
kb_service = KnowledgeBaseService()

@app.on_event("startup")
async def startup_event():
    try:
        kb_service.initialize_schema()
    except Exception as e:
        print(f"[Main] Error initializing KB schema: {e}")

@app.get("/health")
def health_check():
    return {"status": "ok"}

# Include routers
app.include_router(chat_router, prefix="/api/v1", tags=["chat"])
app.include_router(knowledge_router, prefix="/api/v1/knowledge", tags=["knowledge"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

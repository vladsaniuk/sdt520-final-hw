import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.api.routes import router as chat_router
from src.api.knowledge import router as knowledge_router
from src.api.seed import router as seed_router
from src.services.knowledge_base import KnowledgeBaseService
from src.services.seed import seed_graph
from src.db.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: initialize SQLite DB, Neo4j schema, and seed graph. Shutdown: close driver."""
    init_db()
    kb_service = KnowledgeBaseService()
    try:
        kb_service.initialize_schema()
        seed_graph()
    except Exception as e:
        print(f"[Main] Error on startup: {e}")
    yield
    kb_service.close()


app = FastAPI(title="AWS Architecture Advisor API", lifespan=lifespan)

# Configure CORS — read from env var; defaults to "*" for demo use
_raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
allowed_origins = [o.strip() for o in _raw_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok"}


# Include routers
app.include_router(chat_router, prefix="/api/v1", tags=["chat"])
app.include_router(knowledge_router, prefix="/api/v1/knowledge", tags=["knowledge"])
app.include_router(seed_router, prefix="/api/v1", tags=["seed"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

# backend/src/api/seed.py
from fastapi import APIRouter, HTTPException
from src.services.seed import seed_graph

router = APIRouter()


@router.post("/seed")
async def trigger_seed():
    """
    Idempotent: seeds AWS knowledge graph (services, pillars, patterns).
    Safe to call multiple times — uses MERGE, never creates duplicates.
    """
    try:
        counts = seed_graph()
        return {"status": "seeded", **counts}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

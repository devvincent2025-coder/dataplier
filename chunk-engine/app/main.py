from fastapi import FastAPI, HTTPException

from app.models.chunk import ChunkPlan, DatasetProfile
from app.services.chunk_planner import build_chunk_plan, dispatch_chunk_plan

app = FastAPI(title="Data Plier Chunk Engine", version="0.1.0")


@app.get("/healthz")
def healthcheck() -> dict[str, str]:
    return {"service": "chunk-engine", "status": "ok"}


@app.post("/chunk-plan", response_model=ChunkPlan)
def create_chunk_plan(profile: DatasetProfile) -> ChunkPlan:
    return build_chunk_plan(profile)


@app.post("/chunk-plan/dispatch")
def dispatch_chunk_plan_endpoint(profile: DatasetProfile) -> dict[str, object]:
    plan = build_chunk_plan(profile)
    try:
        dispatched = dispatch_chunk_plan(plan)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"failed to dispatch chunk tasks: {exc}") from exc

    return {
        "dataset_name": plan.dataset_name,
        "chunk_count": plan.chunk_count,
        "dispatched_count": dispatched,
        "status": "queued",
    }


from fastapi import FastAPI

from app.models.snapshot import ReplayPlan, ReplayRequest, SnapshotRecord
from app.services.timemachine import build_replay_plan, list_snapshots

app = FastAPI(title="Data Plier Time Machine", version="0.1.0")


@app.get("/healthz")
def healthcheck() -> dict[str, str]:
    return {"service": "time-machine", "status": "ok"}


@app.get("/snapshots", response_model=list[SnapshotRecord])
def snapshots() -> list[SnapshotRecord]:
    return list_snapshots()


@app.post("/replay", response_model=ReplayPlan)
def replay(request: ReplayRequest) -> ReplayPlan:
    return build_replay_plan(request)


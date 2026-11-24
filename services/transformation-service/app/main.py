from fastapi import FastAPI

from app.models.transformation import TransformationPlan, TransformationRequest
from app.services.planner import build_plan

app = FastAPI(title="Data Plier Transformation Engine", version="0.1.0")


@app.get("/healthz")
def healthcheck() -> dict[str, str]:
    return {"service": "transformation-service", "status": "ok"}


@app.post("/plan", response_model=TransformationPlan)
def plan_transformation(request: TransformationRequest) -> TransformationPlan:
    return build_plan(request)


from fastapi import FastAPI

from app.models.controller import OptimizationDecision, OptimizationRequest
from app.services.controller import optimize

app = FastAPI(title="Data Plier AI Controller", version="0.1.0")


@app.get("/healthz")
def healthcheck() -> dict[str, str]:
    return {"service": "ai-controller", "status": "ok"}


@app.post("/optimize", response_model=OptimizationDecision)
def optimize_pipeline(request: OptimizationRequest) -> OptimizationDecision:
    return optimize(request)


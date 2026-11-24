import logging
import os

from fastapi import FastAPI

from app.models.routing import RoutingRequest, RoutingStrategy
from app.services import ml_inference
from app.services.optimizer import optimize_route

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Data Plier Autonomous Routing Engine", version="0.2.0")


@app.get("/healthz")
def healthcheck() -> dict[str, str]:
    return {"service": "routing-engine", "status": "ok"}


@app.get("/readyz")
def readyz() -> dict[str, object]:
    """Process is up; reports whether ML artifacts loaded (baseline still works if not)."""
    st = ml_inference.load_status()
    return {
        "service": "routing-engine",
        "status": "ok",
        "ml_artifacts": st,
    }


@app.post("/route", response_model=RoutingStrategy)
def create_route(request: RoutingRequest) -> RoutingStrategy:
    logger.info(
        "route request workspace=%s %s→%s %sGB",
        request.workspace_id,
        request.source_system,
        request.destination_system,
        request.dataset_size_gb,
    )
    return optimize_route(request)

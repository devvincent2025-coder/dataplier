from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


class RoutingRequest(BaseModel):
    objective: str
    source_system: str
    destination_system: str
    dataset_size_gb: int = Field(gt=0)
    network_bandwidth_mbps: int = Field(gt=0)
    worker_capacity: int = Field(gt=0)
    cost_preference: Literal["balanced", "min_cost", "min_latency"] = "balanced"
    latency_slo_minutes: int = Field(default=60, gt=0)
    workspace_id: str | None = None


class RouteHop(BaseModel):
    system: str
    action: str


class RoutingStrategy(BaseModel):
    objective: str
    route: list[RouteHop]
    chunk_target_mb: int
    compression: str
    rationale: list[str]
    strategy_id: str = Field(default_factory=lambda: str(uuid4()))
    schema_version: str = "2.0"
    confidence: float = Field(ge=0.0, le=1.0, default=0.72)
    decision_path: str = "baseline"
    signals_used: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    model_version: str | None = None
    # Orchestration / warehouse-style transparency (vs Airflow SLAs + Snowflake spend visibility).
    sla_summary: dict[str, Any] | None = None
    cost_transparency: dict[str, Any] | None = None

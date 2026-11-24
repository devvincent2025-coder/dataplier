from pydantic import BaseModel, Field


class OptimizationRequest(BaseModel):
    pipeline_name: str
    throughput_mb_s: float = Field(gt=0)
    queue_backlog: int = Field(ge=0)
    worker_utilization: float = Field(ge=0, le=1)
    failed_chunks: int = Field(ge=0)


class OptimizationDecision(BaseModel):
    pipeline_name: str
    congestion_risk: str
    recommended_chunk_mb: int
    recommended_route_action: str
    notes: list[str]


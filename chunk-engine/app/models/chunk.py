from pydantic import BaseModel, Field


class DatasetProfile(BaseModel):
    job_id: str | None = None
    workspace_id: str | None = None
    pipeline_id: str | None = None
    dataset_name: str
    estimated_bytes: int = Field(gt=0)
    estimated_rows: int = Field(gt=0)
    partitions: int = Field(default=1, ge=1)
    worker_capacity: int = Field(default=8, ge=1)
    network_throughput_mb_s: int = Field(default=256, ge=1)


class ChunkTask(BaseModel):
    job_id: str | None = None
    workspace_id: str | None = None
    pipeline_id: str | None = None
    chunk_index: int
    offset: int
    limit: int
    estimated_bytes: int
    source_partition: str


class ChunkPlan(BaseModel):
    dataset_name: str
    recommended_chunk_rows: int
    chunk_count: int
    tasks: list[ChunkTask]


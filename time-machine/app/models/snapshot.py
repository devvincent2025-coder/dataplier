from pydantic import BaseModel, Field


class SnapshotRecord(BaseModel):
    snapshot_id: str
    dataset_name: str
    captured_at: str
    version_label: str
    storage_uri: str


class ReplayRequest(BaseModel):
    dataset_name: str
    as_of: str
    target_environment: str = Field(default="recovery")


class ReplayPlan(BaseModel):
    dataset_name: str
    as_of: str
    target_environment: str
    strategy: str
    steps: list[str]


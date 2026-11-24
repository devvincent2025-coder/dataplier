from pydantic import BaseModel, Field


class TransformationRequest(BaseModel):
    dataset_name: str
    operations: list[str] = Field(default_factory=list)
    target_schema: dict[str, str] = Field(default_factory=dict)


class TransformationPlan(BaseModel):
    dataset_name: str
    execution_mode: str
    operations: list[str]
    notes: list[str]


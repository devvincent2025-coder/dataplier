from pydantic import BaseModel, Field


class SchemaField(BaseModel):
    name: str
    source_type: str
    target_name: str | None = None


class TranslationRequest(BaseModel):
    source_system: str
    target_system: str
    fields: list[SchemaField] = Field(default_factory=list)


class TranslationResult(BaseModel):
    source_system: str
    target_system: str
    mappings: list[dict[str, str]]
    compatibility: str
    notes: list[str]


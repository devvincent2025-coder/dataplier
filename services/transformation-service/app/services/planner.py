from app.models.transformation import TransformationPlan, TransformationRequest


def build_plan(request: TransformationRequest) -> TransformationPlan:
    operations = request.operations or ["schema_normalization"]
    notes = [
        "Apache Arrow batches preferred for in-memory execution.",
        "Deduplication should run after schema normalization for stable keys.",
    ]
    if "join" in operations:
        notes.append("Join execution may require co-partitioned staging.")

    return TransformationPlan(
        dataset_name=request.dataset_name,
        execution_mode="arrow-stream",
        operations=operations,
        notes=notes,
    )


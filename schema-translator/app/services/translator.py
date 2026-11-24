from app.models.schema import TranslationRequest, TranslationResult


TYPE_MAP = {
    "snowflake": {"NUMBER": "NUMERIC", "VARCHAR": "STRING", "TIMESTAMP_NTZ": "TIMESTAMP"},
    "postgresql": {"INTEGER": "INT64", "TEXT": "STRING", "TIMESTAMP": "TIMESTAMP"},
    "databricks": {"string": "STRING", "long": "INT64", "timestamp": "TIMESTAMP"},
}


def translate_schema(request: TranslationRequest) -> TranslationResult:
    source_key = request.source_system.lower()
    target_key = request.target_system.lower()
    source_map = TYPE_MAP.get(source_key, {})
    mappings = []
    notes = [
        f"Automatic compatibility analysis from {request.source_system} to {request.target_system}.",
        "Nested structure conversion should be promoted to explicit transformation nodes when ambiguity exists.",
    ]

    for field in request.fields:
        translated_type = source_map.get(field.source_type, field.source_type)
        mappings.append(
            {
                "source_name": field.name,
                "target_name": field.target_name or field.name,
                "source_type": field.source_type,
                "target_type": translated_type,
            }
        )

    compatibility = "compatible" if mappings else "review"
    if source_key == "snowflake" and target_key == "bigquery":
        notes.append("NUMBER columns should be checked for scale/precision limits in BigQuery.")
    if target_key == "databricks":
        notes.append("Delta-compatible naming conventions are recommended for nested columns.")

    return TranslationResult(
        source_system=request.source_system,
        target_system=request.target_system,
        mappings=mappings,
        compatibility=compatibility,
        notes=notes,
    )


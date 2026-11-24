"""Heuristic egress $/GB-month bands by source × destination connector class (FinOps placeholder)."""

from __future__ import annotations


def normalize_platform(slug: str) -> str:
    return slug.strip().lower().replace(" ", "").replace("_", "-")


# (source_norm, dest_norm) -> (low_per_gb, high_per_gb) monthly-style illustrative band
_PAIR_RATES: dict[tuple[str, str], tuple[float, float]] = {
    ("snowflake", "bigquery"): (0.06, 0.19),
    ("bigquery", "snowflake"): (0.06, 0.19),
    ("snowflake", "databricks"): (0.05, 0.16),
    ("databricks", "snowflake"): (0.05, 0.16),
    ("databricks", "bigquery"): (0.05, 0.17),
    ("bigquery", "databricks"): (0.05, 0.17),
    ("postgresql", "snowflake"): (0.04, 0.14),
    ("mysql", "snowflake"): (0.04, 0.14),
    ("postgresql", "bigquery"): (0.04, 0.14),
    ("mysql", "bigquery"): (0.04, 0.14),
    ("aws-s3", "snowflake"): (0.02, 0.09),
    ("aws-s3", "bigquery"): (0.02, 0.09),
    ("aws-s3", "databricks"): (0.02, 0.08),
    ("azure-blob", "snowflake"): (0.02, 0.09),
    ("azure-blob", "bigquery"): (0.02, 0.09),
    ("azure-blob", "databricks"): (0.02, 0.08),
    ("snowflake", "aws-s3"): (0.05, 0.15),
    ("bigquery", "aws-s3"): (0.05, 0.15),
    ("databricks", "aws-s3"): (0.04, 0.12),
}


def egress_band_usd_per_month(source_system: str, destination_system: str, dataset_size_gb: float) -> tuple[float, float, str]:
    """
    Returns (low_total_usd, high_total_usd, methodology_note).
    """
    gb = max(0.0, float(dataset_size_gb))
    s = normalize_platform(source_system)
    d = normalize_platform(destination_system)
    pair = _PAIR_RATES.get((s, d))
    if pair is None:
        # Same-system short hop
        if s == d and s:
            low_per_gb, high_per_gb = 0.015, 0.06
            methodology = "Same-system heuristic (control plane / in-vendor replication band)."
        else:
            low_per_gb, high_per_gb = 0.04, 0.18
            methodology = "Default cross-connector egress band; refine with FinOps telemetry."
    else:
        low_per_gb, high_per_gb = pair
        methodology = "Pairwise connector-class matrix (workspace-agnostic); align with cloud billing APIs."
    return round(gb * low_per_gb, 2), round(gb * high_per_gb, 2), methodology

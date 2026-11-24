"""Shared feature engineering for training and inference (must stay in sync)."""

from __future__ import annotations

import numpy as np

FEATURE_DIM = 13

_COST_INDEX = {"balanced": 0, "min_cost": 1, "min_latency": 2}


def cross_cloud_hint(source_slug: str, dest_slug: str) -> int:
    s, d = source_slug.lower(), dest_slug.lower()

    def bucket(x: str) -> str:
        if any(k in x for k in ("aws", "s3", "redshift")):
            return "aws"
        if any(k in x for k in ("gcp", "gcs", "bigquery")):
            return "gcp"
        if any(k in x for k in ("azure", "blob", "synapse")):
            return "azure"
        if "snowflake" in x:
            return "snowflake"
        return "other"

    return 1 if bucket(s) != bucket(d) else 0


def build_feature_vector(
    dataset_size_gb: float,
    bandwidth_mbps: float,
    worker_capacity: float,
    latency_slo_minutes: float,
    cost_preference: str,
    queue_backlog: float,
    worker_utilization: float,
    chunk_failures: float,
    pipeline_latency_s: float,
    transfer_speed_mb_s: float,
    source_slug: str,
    dest_slug: str,
) -> np.ndarray:
    idx = _COST_INDEX.get(cost_preference, 0)
    oh = np.zeros(3, dtype=np.float64)
    oh[idx] = 1.0
    cc = float(cross_cloud_hint(source_slug, dest_slug))
    return np.array(
        [
            np.log1p(max(dataset_size_gb, 0.0)),
            np.log1p(max(bandwidth_mbps, 0.0)),
            np.log1p(max(worker_capacity, 0.0)),
            np.log1p(max(latency_slo_minutes, 0.0)),
            np.log1p(max(queue_backlog, 0.0) + 1.0),
            float(np.clip(worker_utilization, 0.0, 2.0)),
            np.log1p(max(chunk_failures, 0.0) + 1.0),
            np.log1p(max(pipeline_latency_s, 0.0) + 1.0),
            np.log1p(max(transfer_speed_mb_s, 0.0) + 1.0),
            cc,
            oh[0],
            oh[1],
            oh[2],
        ],
        dtype=np.float64,
    )

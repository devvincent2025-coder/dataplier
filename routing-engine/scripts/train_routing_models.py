#!/usr/bin/env python3
"""
Train sklearn models from the throughput simulator (labels = grid-search optimum).
Run from routing-engine root:  PYTHONPATH=. python scripts/train_routing_models.py
Dockerfile invokes this at image build so artifacts ship with the service.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)

from app.ml.features import build_feature_vector  # noqa: E402
from app.simulation.throughput import best_chunk_compression_and_stage  # noqa: E402
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor  # noqa: E402
import joblib  # noqa: E402


SLUGS = [
    "snowflake",
    "aws-s3",
    "gcp-gcs",
    "azure-blob",
    "databricks",
    "postgres",
    "mysql",
    "bigquery",
    "redshift",
    "kafka",
]


def synth_row(rng: np.random.Generator, i: int) -> tuple[np.ndarray, float, int]:
    dataset_gb = float(rng.uniform(5, 1800))
    bandwidth_mbps = float(rng.uniform(50, 25000))
    workers = float(rng.integers(1, 64))
    latency_slo = float(rng.uniform(15, 360))
    cost = rng.choice(["balanced", "min_cost", "min_latency"])
    queue_backlog = float(rng.integers(0, 2500))
    chunk_failures = float(rng.integers(0, 400))
    worker_util = float(rng.uniform(0.05, 0.98))
    pipeline_latency_s = float(rng.uniform(10, 400))
    transfer_speed_mb_s = float(rng.uniform(50, 2000))
    src, dst = rng.choice(SLUGS, 2)

    chunk, _comp, stage, _t = best_chunk_compression_and_stage(
        dataset_gb,
        bandwidth_mbps,
        workers,
        latency_slo,
        cost,
        queue_backlog,
        chunk_failures,
        worker_util,
    )

    x = build_feature_vector(
        dataset_gb,
        bandwidth_mbps,
        workers,
        latency_slo,
        cost,
        queue_backlog,
        worker_util,
        chunk_failures,
        pipeline_latency_s,
        transfer_speed_mb_s,
        src,
        dst,
    )
    return x, float(chunk), int(stage)


def main() -> None:
    rng = np.random.default_rng(42)
    n = int(os.getenv("ROUTING_TRAIN_ROWS", "14000"))
    xs: list[np.ndarray] = []
    y_chunk: list[float] = []
    y_stage: list[int] = []
    for i in range(n):
        x, c, s = synth_row(rng, i)
        xs.append(x)
        y_chunk.append(c)
        y_stage.append(s)

    X = np.vstack(xs)
    y_chunk_a = np.array(y_chunk, dtype=np.float64)
    y_stage_a = np.array(y_stage, dtype=np.int64)

    reg = HistGradientBoostingRegressor(
        max_depth=8,
        learning_rate=0.06,
        max_iter=220,
        l2_regularization=1e-3,
        random_state=42,
    )
    reg.fit(X, y_chunk_a)

    clf = HistGradientBoostingClassifier(
        max_depth=7,
        learning_rate=0.07,
        max_iter=200,
        l2_regularization=1e-3,
        random_state=43,
    )
    clf.fit(X, y_stage_a)

    out = ROOT / "app" / "artifacts"
    out.mkdir(parents=True, exist_ok=True)
    joblib.dump(reg, out / "chunk_regressor.joblib")
    joblib.dump(clf, out / "stage_classifier.joblib")
    print(f"Wrote models to {out} (rows={n}, dim={X.shape[1]})")


if __name__ == "__main__":
    main()

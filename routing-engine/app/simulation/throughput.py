"""Physics-inspired cost model: transfer time + chunk orchestration + backlog / failure penalties."""

from __future__ import annotations

ALLOWED_CHUNKS_MB = [64, 128, 256, 512, 1024, 2048]
COMPRESSIONS = ("zstd", "snappy")


def compression_effective_factor(compression: str) -> float:
    """Higher factor => more bits on the wire per byte of logical data (after compression)."""
    if compression == "zstd":
        return 0.50
    return 0.72


def wall_clock_minutes(
    dataset_gb: float,
    bandwidth_mbps: float,
    workers: float,
    chunk_mb: float,
    compression: str,
    staging: bool,
    queue_backlog: float,
    chunk_failures: float,
    worker_utilization: float,
) -> float:
    data_mb = max(dataset_gb, 0.01) * 1024.0
    eff = compression_effective_factor(compression)
    effective_mbps = max(1.0, bandwidth_mbps * eff)
    serial_transfer_min = (data_mb * 8.0) / (effective_mbps * 60.0)

    n_chunks = max(1, int(data_mb / max(chunk_mb, 1.0)))
    orchestration_min = (n_chunks * 0.018) * (1.0 + min(queue_backlog, 5000.0) / 450.0)

    parallel = max(1.0, min(max(workers, 1.0), max(1.0, n_chunks / 3.0)))
    transfer_min = serial_transfer_min / (0.2 + 0.8 * (parallel / max(workers, 1.0)))

    failure_pressure = min(40.0, chunk_failures * 0.35)
    retry_min = failure_pressure * (0.55 if staging else 1.0)
    backlog_wait = min(35.0, queue_backlog / 120.0)
    util_hot = max(0.0, worker_utilization - 0.72) * 18.0

    stage_overhead = 5.5 if staging else 0.0
    stage_recovery = -min(12.0, failure_pressure * 1.1) if staging else 0.0

    total = transfer_min + orchestration_min + retry_min + backlog_wait + util_hot + stage_overhead + stage_recovery
    return max(0.25, total)


def best_chunk_compression_and_stage(
    dataset_gb: float,
    bandwidth_mbps: float,
    workers: float,
    latency_slo_minutes: float,
    cost_preference: str,
    queue_backlog: float,
    chunk_failures: float,
    worker_utilization: float,
) -> tuple[int, str, int, float]:
    """Grid search labels for ML training."""
    best = None
    best_time = float("inf")
    for staging in (0, 1):
        for compression in COMPRESSIONS:
            for chunk_mb in ALLOWED_CHUNKS_MB:
                t = wall_clock_minutes(
                    dataset_gb,
                    bandwidth_mbps,
                    workers,
                    float(chunk_mb),
                    compression,
                    bool(staging),
                    queue_backlog,
                    chunk_failures,
                    worker_utilization,
                )
                slo_penalty = 0.0
                if t > latency_slo_minutes:
                    slo_penalty = (t - latency_slo_minutes) * (2.5 if cost_preference == "min_latency" else 1.0)
                cost_penalty = 0.0
                if staging and cost_preference == "min_cost":
                    cost_penalty += 6.0
                if compression == "snappy" and bandwidth_mbps < 1500 and cost_preference != "min_latency":
                    cost_penalty += 2.0
                score = t + slo_penalty + cost_penalty
                if score < best_time:
                    best_time = score
                    best = (chunk_mb, compression, staging, t)
    assert best is not None
    return best[0], best[1], best[2], best_time

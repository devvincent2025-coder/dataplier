"""Deterministic guardrail policy — always available when ML artifacts or metrics fail."""

from __future__ import annotations

from typing import Any

from app.models.routing import RoutingRequest
from app.simulation.throughput import ALLOWED_CHUNKS_MB, wall_clock_minutes


def _snap_chunk(value: float) -> int:
    v = int(round(max(64.0, min(2048.0, value))))
    return min(ALLOWED_CHUNKS_MB, key=lambda c: abs(c - v))


def baseline_compression(bandwidth_mbps: int, cost_preference: str) -> str:
    if cost_preference == "min_latency":
        return "snappy"
    if bandwidth_mbps < 4000:
        return "zstd"
    return "snappy"


def baseline_wants_staging(request: RoutingRequest, metrics: dict[str, Any]) -> bool:
    backlog = int(metrics.get("queue_backlog") or 0)
    failures = int(metrics.get("chunk_failures") or 0)
    if request.dataset_size_gb > 500:
        return True
    if request.cost_preference == "min_cost":
        return True
    if backlog > 100:
        return True
    if failures > 25:
        return True
    return False


def baseline_chunk_target(request: RoutingRequest, metrics: dict[str, Any]) -> int:
    """Heuristic chunk size with live signals (matches previous product behavior, extended)."""
    chunk = 512 if request.dataset_size_gb > 100 else 256
    util = float(metrics.get("worker_utilization") or 0.0)
    backlog = int(metrics.get("queue_backlog") or 0)
    if util > 0.85:
        chunk = max(128, chunk // 2)
    elif backlog > 200:
        chunk = min(1024, chunk * 2)
    if request.cost_preference == "min_latency":
        chunk = min(1024, max(256, chunk))
    if request.cost_preference == "min_cost":
        chunk = max(128, min(512, chunk))
    return _snap_chunk(float(chunk))


def build_baseline_strategy(request: RoutingRequest, metrics: dict[str, Any]) -> tuple[list[str], int, str, bool]:
    """Returns rationale lines (no route — caller merges ML + final staging), chunk, compression, baseline_stage flag."""
    rationale: list[str] = [
        f"Objective aligned to requested outcome: {request.objective}",
        f"Policy weights: {request.worker_capacity} workers, {request.network_bandwidth_mbps} Mbps, "
        f"SLO {request.latency_slo_minutes}m, preference={request.cost_preference}.",
    ]
    use_stage = baseline_wants_staging(request, metrics)

    if "ai" in request.destination_system.lower() or "model" in request.objective.lower():
        rationale.append("Destination or objective looks AI-oriented; keep normalized features and contract-stable loads.")

    chunk = baseline_chunk_target(request, metrics)
    compression = baseline_compression(request.network_bandwidth_mbps, request.cost_preference)

    # Sanity: pick compression that wins under the cost model for this chunk
    alt = "snappy" if compression == "zstd" else "zstd"
    t0 = wall_clock_minutes(
        float(request.dataset_size_gb),
        float(request.network_bandwidth_mbps),
        float(request.worker_capacity),
        float(chunk),
        compression,
        use_stage,
        float(metrics.get("queue_backlog") or 0),
        float(metrics.get("chunk_failures") or 0),
        float(metrics.get("worker_utilization") or 0.0),
    )
    t1 = wall_clock_minutes(
        float(request.dataset_size_gb),
        float(request.network_bandwidth_mbps),
        float(request.worker_capacity),
        float(chunk),
        alt,
        use_stage,
        float(metrics.get("queue_backlog") or 0),
        float(metrics.get("chunk_failures") or 0),
        float(metrics.get("worker_utilization") or 0.0),
    )
    if t1 + 0.5 < t0 and request.cost_preference != "min_latency":
        compression = alt
        rationale.append(f"Compression switched to {compression} after local cost-model check.")

    return rationale, chunk, compression, use_stage

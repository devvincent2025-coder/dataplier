"""Compose catalog validation, live metrics, ML predictions, and deterministic guardrails."""

from __future__ import annotations

import logging
import os
from typing import Any

from app.models.routing import RouteHop, RoutingRequest, RoutingStrategy
from app.services import (
    catalog_client,
    connections_workspace_client,
    connector_cost_model,
    metrics_client,
    ml_inference,
)
from app.services.policy_baseline import baseline_compression, build_baseline_strategy
from app.simulation.throughput import ALLOWED_CHUNKS_MB, wall_clock_minutes

logger = logging.getLogger(__name__)


def _confidence(
    observability_ok: bool,
    catalog_ok: bool,
    ml_used: bool,
    warnings: list[str],
    stage_margin: float,
) -> float:
    c = 0.62
    if observability_ok:
        c += 0.14
    if catalog_ok:
        c += 0.08
    if ml_used:
        c += 0.06 + min(0.08, abs(stage_margin - 0.5) * 0.25)
    c -= 0.06 * len(warnings)
    return float(max(0.35, min(0.96, c)))


def optimize_route(request: RoutingRequest) -> RoutingStrategy:
    warnings: list[str] = []
    signals: dict[str, Any] = {"request": {"workspace_id": request.workspace_id}}

    metrics, obs_meta = metrics_client.fetch_observability_metrics(request.workspace_id)
    signals["observability"] = obs_meta
    if request.workspace_id and not obs_meta.get("ok"):
        warnings.append(
            "Live observability metrics were not available; decisions lean on request parameters and guardrails."
        )

    catalog_slugs, cat_meta = catalog_client.fetch_catalog_slugs(request.workspace_id)
    signals["catalog"] = cat_meta
    catalog_ok = bool(cat_meta.get("ok") and catalog_slugs)

    workspace_platforms, conn_meta = connections_workspace_client.fetch_workspace_platforms(request.workspace_id)
    signals["workspace_connections"] = conn_meta
    signals["workspace_connections"]["platforms"] = sorted(workspace_platforms)
    src_norm = connector_cost_model.normalize_platform(request.source_system)
    dst_norm = connector_cost_model.normalize_platform(request.destination_system)
    if conn_meta.get("ok"):
        if conn_meta.get("connection_count") == 0:
            warnings.append(
                "This workspace has no saved connections yet; routing is hypothetical until connectors are provisioned."
            )
        elif workspace_platforms:
            if src_norm and src_norm not in workspace_platforms:
                warnings.append(
                    f"No live connection uses source platform {request.source_system!r} in this workspace — add or rename a connector to match."
                )
            if dst_norm and dst_norm not in workspace_platforms:
                warnings.append(
                    f"No live connection uses destination platform {request.destination_system!r} in this workspace — add or rename a connector to match."
                )
    if catalog_ok:
        if request.source_system not in catalog_slugs:
            warnings.append(
                f"Source system slug {request.source_system!r} is not in the catalog snapshot — verify spelling."
            )
        if request.destination_system not in catalog_slugs:
            warnings.append(
                f"Destination system slug {request.destination_system!r} is not in the catalog snapshot — verify spelling."
            )
    elif request.workspace_id:
        warnings.append("Could not load the data-systems catalog; skipping slug validation.")

    rationale, base_chunk, base_comp, base_stage = build_baseline_strategy(request, metrics)

    ml_chunk, ml_stage_p, ml_diag = ml_inference.predict(request, metrics)
    signals["ml"] = ml_diag
    signals["ml_runtime"] = ml_inference.load_status()

    use_stage = base_stage
    chunk_target_mb = base_chunk
    compression = base_comp

    if ml_chunk is not None and ml_stage_p is not None:
        blend = float(os.getenv("ROUTING_ML_BLEND", "0.62"))
        chunk_target_mb = int(round(blend * ml_chunk + (1.0 - blend) * base_chunk))
        chunk_target_mb = min(ALLOWED_CHUNKS_MB, key=lambda c: abs(c - chunk_target_mb))

        stage_score = 0.58 * ml_stage_p + (0.42 if base_stage else 0.0)
        use_stage = stage_score >= 0.5
        rationale.append(
            f"ML blend ({blend:.0%}) suggests chunk≈{ml_chunk} MB and staging likelihood {ml_stage_p:.0%}; merged with baseline."
        )

        # Guardrail: never pick a compression that is clearly worse under the cost model
        comp_ml = baseline_compression(request.network_bandwidth_mbps, request.cost_preference)
        t_base = wall_clock_minutes(
            float(request.dataset_size_gb),
            float(request.network_bandwidth_mbps),
            float(request.worker_capacity),
            float(chunk_target_mb),
            compression,
            use_stage,
            float(metrics.get("queue_backlog") or 0),
            float(metrics.get("chunk_failures") or 0),
            float(metrics.get("worker_utilization") or 0.0),
        )
        t_alt = wall_clock_minutes(
            float(request.dataset_size_gb),
            float(request.network_bandwidth_mbps),
            float(request.worker_capacity),
            float(chunk_target_mb),
            comp_ml,
            use_stage,
            float(metrics.get("queue_backlog") or 0),
            float(metrics.get("chunk_failures") or 0),
            float(metrics.get("worker_utilization") or 0.0),
        )
        if t_alt + 1.0 < t_base:
            compression = comp_ml
            rationale.append(f"Compression set to {compression} after guardrail cost check.")
    else:
        rationale.append("ML artifacts unavailable; using validated baseline policy only.")

    route: list[RouteHop] = [RouteHop(system=request.source_system, action="extract")]
    if use_stage:
        route.append(RouteHop(system="s3-staging", action="stage-compressed-chunks"))
        rationale.append("Staging hop (s3-staging) included for resilience under current signals and policy blend.")
    route.append(RouteHop(system=request.destination_system, action="load"))

    model_version = os.getenv("ROUTING_MODEL_VERSION", "hgb-2026.04")
    final_path = "ml_guardrailed" if ml_chunk is not None and ml_stage_p is not None else "baseline"
    conf = _confidence(
        bool(obs_meta.get("ok")),
        catalog_ok and not any("not in the catalog" in w for w in warnings),
        final_path == "ml_guardrailed",
        warnings,
        float(ml_stage_p if ml_stage_p is not None else 0.5),
    )

    est_minutes = wall_clock_minutes(
        float(request.dataset_size_gb),
        float(request.network_bandwidth_mbps),
        float(request.worker_capacity),
        float(chunk_target_mb),
        compression,
        use_stage,
        float(metrics.get("queue_backlog") or 0),
        float(metrics.get("chunk_failures") or 0),
        float(metrics.get("worker_utilization") or 0.0),
    )
    slo = float(request.latency_slo_minutes)
    sla_summary: dict[str, Any] = {
        "latency_slo_minutes": int(slo),
        "estimated_wall_clock_minutes": round(est_minutes, 2),
        "within_slo": est_minutes <= slo,
        "staging_included": use_stage,
        "notes": "Wall clock from chunk simulation; add historical job p95 for production SLAs.",
    }
    gb = float(request.dataset_size_gb)
    egress_band_low, egress_band_high, egress_method = connector_cost_model.egress_band_usd_per_month(
        request.source_system, request.destination_system, gb
    )
    if request.cost_preference == "min_cost":
        egress_band_low = round(egress_band_low * 0.88, 2)
        egress_band_high = round(egress_band_high * 0.92, 2)
    elif request.cost_preference == "min_latency":
        egress_band_low = round(egress_band_low * 1.05, 2)
        egress_band_high = round(egress_band_high * 1.12, 2)
    cost_transparency: dict[str, Any] = {
        "egress_usd_monthly_band_low": egress_band_low,
        "egress_usd_monthly_band_high": egress_band_high,
        "currency": "USD",
        "cost_preference": request.cost_preference,
        "source_system": request.source_system,
        "destination_system": request.destination_system,
        "methodology": egress_method + " Adjusted lightly for cost preference.",
    }

    logger.info(
        "routing decision workspace=%s path=%s chunk=%s comp=%s stage=%s conf=%.2f",
        request.workspace_id,
        final_path,
        chunk_target_mb,
        compression,
        use_stage,
        conf,
    )

    return RoutingStrategy(
        objective=request.objective,
        route=route,
        chunk_target_mb=chunk_target_mb,
        compression=compression,
        rationale=rationale,
        confidence=conf,
        decision_path=final_path,
        signals_used=signals,
        warnings=warnings,
        model_version=model_version if final_path == "ml_guardrailed" else None,
        sla_summary=sla_summary,
        cost_transparency=cost_transparency,
    )

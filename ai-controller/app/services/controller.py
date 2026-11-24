from app.models.controller import OptimizationDecision, OptimizationRequest


def optimize(request: OptimizationRequest) -> OptimizationDecision:
    congestion_risk = "low"
    recommended_chunk_mb = 256
    route_action = "keep-current-route"
    notes = ["Heuristic controller active while reinforcement policy is training."]

    if request.queue_backlog > 150 or request.worker_utilization > 0.85:
        congestion_risk = "high"
        recommended_chunk_mb = 128
        route_action = "shift-to-staged-route"
        notes.append("High backlog detected; reduce chunk size and prefer resilient staging.")
    elif request.failed_chunks > 0:
        congestion_risk = "medium"
        recommended_chunk_mb = 192
        route_action = "retry-with-compression"
        notes.append("Chunk failures detected; lower pressure and increase resilience.")
    else:
        notes.append("Current route remains acceptable for observed traffic profile.")

    return OptimizationDecision(
        pipeline_name=request.pipeline_name,
        congestion_risk=congestion_risk,
        recommended_chunk_mb=recommended_chunk_mb,
        recommended_route_action=route_action,
        notes=notes,
    )


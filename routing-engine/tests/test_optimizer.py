from app.models.routing import RoutingRequest
from app.services.optimizer import optimize_route
from app.simulation.throughput import ALLOWED_CHUNKS_MB


def test_optimize_route_baseline_shape():
    req = RoutingRequest(
        objective="Test sync",
        source_system="snowflake",
        destination_system="aws-s3",
        dataset_size_gb=50,
        network_bandwidth_mbps=512,
        worker_capacity=8,
        cost_preference="balanced",
        latency_slo_minutes=60,
        workspace_id=None,
    )
    out = optimize_route(req)
    assert out.chunk_target_mb in ALLOWED_CHUNKS_MB
    assert out.compression in ("zstd", "snappy")
    assert len(out.route) >= 2
    assert out.route[0].action == "extract"
    assert out.route[-1].action == "load"
    assert 0.35 <= out.confidence <= 0.96
    assert out.decision_path in ("baseline", "ml_guardrailed")
    assert isinstance(out.warnings, list)
    assert "observability" in out.signals_used

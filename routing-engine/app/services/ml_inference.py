"""Load sklearn artifacts and produce guarded predictions."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import numpy as np

from app.ml.features import FEATURE_DIM, build_feature_vector
from app.models.routing import RoutingRequest
from app.simulation.throughput import ALLOWED_CHUNKS_MB

logger = logging.getLogger(__name__)

_ARTIFACT_DIR = Path(__file__).resolve().parent.parent / "artifacts"
_CHUNK_MODEL = "chunk_regressor.joblib"
_STAGE_MODEL = "stage_classifier.joblib"

_chunk_model: Any = None
_stage_model: Any = None
_load_error: str | None = None
_missing_joblib_logged = False


def _artifacts_enabled() -> bool:
    return os.getenv("ROUTING_ML_DISABLED", "").lower() not in ("1", "true", "yes")


def _load() -> None:
    global _chunk_model, _stage_model, _load_error, _missing_joblib_logged
    if _chunk_model is not None or _load_error is not None:
        return
    if not _artifacts_enabled():
        _load_error = "disabled_by_env"
        return
    cp = _ARTIFACT_DIR / _CHUNK_MODEL
    sp = _ARTIFACT_DIR / _STAGE_MODEL
    if not cp.is_file() or not sp.is_file():
        _load_error = "missing_artifacts"
        logger.info("routing ML artifacts not found under %s", _ARTIFACT_DIR)
        return
    try:
        import joblib
    except ImportError as exc:
        _load_error = f"missing_joblib:{exc}"
        if not _missing_joblib_logged:
            _missing_joblib_logged = True
            logger.warning("routing ML disabled: joblib not installed (%s)", exc)
        return
    try:
        _chunk_model = joblib.load(cp)
        _stage_model = joblib.load(sp)
        _load_error = None
        logger.info("loaded routing ML models from %s", _ARTIFACT_DIR)
    except Exception as exc:  # noqa: BLE001
        _chunk_model = None
        _stage_model = None
        _load_error = type(exc).__name__
        logger.warning("failed to load routing ML models: %s", exc)


def models_available() -> bool:
    _load()
    return _chunk_model is not None and _stage_model is not None


def load_status() -> dict[str, Any]:
    _load()
    return {
        "enabled": _artifacts_enabled(),
        "loaded": models_available(),
        "artifact_dir": str(_ARTIFACT_DIR),
        "error": _load_error,
    }


def _snap_chunk(raw: float) -> int:
    v = float(np.clip(raw, 64.0, 2048.0))
    return int(min(ALLOWED_CHUNKS_MB, key=lambda c: abs(c - v)))


def predict(
    request: RoutingRequest,
    metrics: dict[str, Any],
) -> tuple[int | None, float | None, dict[str, Any]]:
    """
    Returns (chunk_mb_or_none, stage_probability_or_none, diagnostics).
    """
    _load()
    diag: dict[str, Any] = {"feature_dim": FEATURE_DIM}
    if not models_available():
        diag["reason"] = _load_error or "not_loaded"
        return None, None, diag

    x = build_feature_vector(
        float(request.dataset_size_gb),
        float(request.network_bandwidth_mbps),
        float(request.worker_capacity),
        float(request.latency_slo_minutes),
        request.cost_preference,
        float(metrics.get("queue_backlog") or 0),
        float(metrics.get("worker_utilization") or 0.0),
        float(metrics.get("chunk_failures") or 0),
        float(metrics.get("pipeline_latency_s") or 0.0),
        float(metrics.get("transfer_speed_mb_s") or 0.0),
        request.source_system,
        request.destination_system,
    ).reshape(1, -1)

    chunk_raw = float(_chunk_model.predict(x)[0])
    chunk = _snap_chunk(chunk_raw)
    proba = None
    try:
        proba_row = _stage_model.predict_proba(x)[0]
        # class order [0,1] — assume positive class staging=1 is index 1
        proba = float(proba_row[1]) if len(proba_row) > 1 else float(proba_row[0])
    except Exception:  # noqa: BLE001
        proba = float(_stage_model.predict(x)[0])

    diag["chunk_raw"] = chunk_raw
    diag["chunk_snapped"] = chunk
    diag["stage_proba"] = proba
    return chunk, proba, diag

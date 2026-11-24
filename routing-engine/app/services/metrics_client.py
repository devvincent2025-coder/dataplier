"""Resilient observability fetch with retries and structured diagnostics."""

from __future__ import annotations

import logging
import os
import time
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

DEFAULT_FIELDS = (
    "worker_utilization",
    "queue_backlog",
    "chunk_failures",
    "pipeline_latency_s",
    "transfer_speed_mb_s",
)


def _session() -> requests.Session:
    retry = Retry(
        total=3,
        connect=3,
        read=3,
        backoff_factor=0.2,
        status_forcelist=(502, 503, 504),
        allowed_methods=frozenset({"GET"}),
    )
    adapter = HTTPAdapter(max_retries=retry)
    s = requests.Session()
    s.mount("http://", adapter)
    s.mount("https://", adapter)
    return s


def fetch_observability_metrics(workspace_id: str | None) -> tuple[dict[str, Any], dict[str, Any]]:
    """
    Returns (metrics_dict, meta).
    metrics_dict may be empty; meta describes freshness and attempts.
    """
    meta: dict[str, Any] = {
        "source": "observability-service",
        "ok": False,
        "attempts": 0,
        "latency_ms": None,
        "http_status": None,
        "error": None,
    }
    if not workspace_id:
        meta["error"] = "no_workspace_id"
        return {}, meta

    base_url = os.getenv("OBSERVABILITY_SERVICE_URL", "http://observability-service:8087").rstrip("/")
    url = f"{base_url}/metrics/summary"
    timeout = float(os.getenv("OBSERVABILITY_TIMEOUT_SEC", "3.0"))
    session = _session()

    start = time.perf_counter()
    try:
        resp = session.get(
            url,
            headers={"X-Workspace-Id": workspace_id},
            timeout=timeout,
        )
        meta["attempts"] = 1
        meta["http_status"] = resp.status_code
        meta["latency_ms"] = round((time.perf_counter() - start) * 1000, 2)
        if resp.status_code >= 300:
            meta["error"] = f"http_{resp.status_code}"
            logger.warning("observability non-success: %s %s", resp.status_code, url)
            return {}, meta
        body = resp.json()
        if not isinstance(body, dict):
            meta["error"] = "invalid_json_shape"
            return {}, meta
        out = {k: body.get(k) for k in DEFAULT_FIELDS if k in body}
        # Ensure numeric defaults for downstream math
        out.setdefault("worker_utilization", 0.0)
        out.setdefault("queue_backlog", 0)
        out.setdefault("chunk_failures", 0)
        out.setdefault("pipeline_latency_s", 0.0)
        out.setdefault("transfer_speed_mb_s", 0.0)
        meta["ok"] = True
        return out, meta
    except Exception as exc:  # noqa: BLE001 — boundary: return empty metrics
        meta["latency_ms"] = round((time.perf_counter() - start) * 1000, 2)
        meta["error"] = type(exc).__name__
        logger.warning("observability fetch failed: %s", exc)
        return {}, meta

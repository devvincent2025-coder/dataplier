"""Live workspace connections from connection-service (ground truth for provisioned platforms)."""

from __future__ import annotations

import logging
import os
import time
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)


def _session() -> requests.Session:
    retry = Retry(
        total=2,
        connect=2,
        read=2,
        backoff_factor=0.15,
        status_forcelist=(502, 503, 504),
        allowed_methods=frozenset({"GET"}),
    )
    adapter = HTTPAdapter(max_retries=retry)
    s = requests.Session()
    s.mount("http://", adapter)
    s.mount("https://", adapter)
    return s


def normalize_workspace_platform(value: str) -> str:
    return value.strip().lower().replace(" ", "")


def fetch_workspace_platforms(workspace_id: str | None) -> tuple[set[str], dict[str, Any]]:
    """
    Returns (normalized platform slugs from live connections, meta).
    """
    meta: dict[str, Any] = {
        "source": "connection-service",
        "path": "/connections",
        "ok": False,
        "connection_count": 0,
        "latency_ms": None,
        "http_status": None,
        "error": None,
    }
    if not workspace_id:
        meta["error"] = "no_workspace_id"
        return set(), meta

    base = os.getenv("CONNECTION_SERVICE_URL", "http://connection-service:8082").rstrip("/")
    url = f"{base}/connections"
    timeout = float(os.getenv("CONNECTION_SERVICE_TIMEOUT_SEC", "3.0"))
    session = _session()
    start = time.perf_counter()
    try:
        resp = session.get(
            url,
            headers={"X-Workspace-Id": workspace_id},
            timeout=timeout,
        )
        meta["http_status"] = resp.status_code
        meta["latency_ms"] = round((time.perf_counter() - start) * 1000, 2)
        if resp.status_code >= 300:
            meta["error"] = f"http_{resp.status_code}"
            logger.warning("connections list non-success: %s", resp.status_code)
            return set(), meta
        body = resp.json()
        items = body.get("items") if isinstance(body, dict) else None
        if not isinstance(items, list):
            meta["error"] = "invalid_json_shape"
            return set(), meta
        platforms: set[str] = set()
        for it in items:
            if isinstance(it, dict) and isinstance(it.get("platform"), str):
                platforms.add(normalize_workspace_platform(it["platform"]))
        meta["ok"] = True
        meta["connection_count"] = len(items)
        return platforms, meta
    except Exception as exc:  # noqa: BLE001
        meta["latency_ms"] = round((time.perf_counter() - start) * 1000, 2)
        meta["error"] = type(exc).__name__
        logger.warning("connections list failed: %s", exc)
        return set(), meta

"""Minimal Supabase writer via PostgREST.

We only ever PATCH the `scans` row (status transitions + raw_findings). Using
the REST endpoint directly keeps the dependency surface tiny. All writes are
best-effort: if Supabase isn't configured (local dev / tests) we log and move
on so the pipeline can still return findings.
"""

import logging
from typing import Any

import httpx

from . import config

log = logging.getLogger("engine.supabase")


def _headers() -> dict[str, str]:
    return {
        "apikey": config.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def _patch_scan(scan_id: str, patch: dict[str, Any]) -> None:
    if not config.supabase_configured():
        log.warning("Supabase not configured; skipping scan update: %s", patch.get("status"))
        return

    url = f"{config.SUPABASE_URL}/rest/v1/scans"
    try:
        resp = httpx.patch(
            url,
            params={"id": f"eq.{scan_id}"},
            headers=_headers(),
            json=patch,
            timeout=config.SUPABASE_TIMEOUT,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        log.error("Failed to update scan %s: %s", scan_id, exc)


def set_running(scan_id: str) -> None:
    _patch_scan(scan_id, {"status": "running"})


def set_awaiting_report(scan_id: str, raw_findings: dict[str, Any]) -> None:
    _patch_scan(scan_id, {
        "status": "awaiting_report",
        "raw_findings": raw_findings,
    })


def set_failed(scan_id: str, reason: str) -> None:
    _patch_scan(scan_id, {
        "status": "failed",
        "summary": reason[:500],
    })

"""Scan pipeline orchestration.

Flow:  mark running -> clone -> enforce limits -> detect languages ->
run each scanner (resilient) -> normalize -> write raw_findings +
'awaiting_report'. Any terminal failure marks the scan 'failed'. The temp
clone is ALWAYS deleted in the finally block.
"""

import logging
import shutil

from . import supabase_client
from .cloning import CloneError, RepoTooLargeError, clone_repo, enforce_limits
from .languages import detect_languages
from .models import RawFinding, ScanResponse
from .scanners import (
    deps_scanner,
    gitleaks_scanner,
    heuristics_scanner,
    semgrep_scanner,
)

log = logging.getLogger("engine.pipeline")

# Sort order for the response (most severe first).
_SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}


def _run_scanner(name: str, fn, *args) -> tuple[list[RawFinding], str]:
    """Run one scanner, never letting it crash the whole pipeline."""
    try:
        findings = fn(*args)
        log.info("scanner %s produced %d finding(s)", name, len(findings))
        return findings, "ok"
    except Exception as exc:  # noqa: BLE001 — isolate scanner failures
        log.exception("scanner %s failed", name)
        return [], f"error: {exc}"


def run_pipeline(scan_id: str, repo_url: str) -> ScanResponse:
    supabase_client.set_running(scan_id)

    tmp_root: str | None = None
    try:
        tmp_root, repo_dir = clone_repo(repo_url)

        # SAFETY: enforce size/file limits BEFORE any scanner runs.
        file_count, total_bytes = enforce_limits(repo_dir)

        lang = detect_languages(repo_dir)

        findings: list[RawFinding] = []
        scanner_status: dict[str, str] = {}

        for name, result in (
            ("semgrep", _run_scanner("semgrep", semgrep_scanner.run, repo_dir, lang["semgrep_packs"])),
            ("gitleaks", _run_scanner("gitleaks", gitleaks_scanner.run, repo_dir)),
            ("osv", _run_scanner("osv", deps_scanner.run, repo_dir)),
            ("heuristics", _run_scanner("heuristics", heuristics_scanner.run, repo_dir)),
        ):
            scanner_findings, status = result
            findings.extend(scanner_findings)
            scanner_status[name] = status

        findings.sort(key=lambda f: _SEVERITY_RANK.get(f.severity, 4))

        raw_findings = {
            "version": 1,
            "languages": lang["languages"],
            "limited_support": lang["limited_support"],
            "stats": {
                "file_count": file_count,
                "total_bytes": total_bytes,
                "finding_count": len(findings),
            },
            "scanners": scanner_status,
            "findings": [f.model_dump() for f in findings],
        }

        supabase_client.set_awaiting_report(scan_id, raw_findings)

        return ScanResponse(
            scan_id=scan_id,
            status="awaiting_report",
            languages=lang["languages"],
            limited_support=lang["limited_support"],
            finding_count=len(findings),
            findings=findings,
        )

    except (CloneError, RepoTooLargeError) as exc:
        reason = str(exc)
        log.warning("scan %s failed: %s", scan_id, reason)
        supabase_client.set_failed(scan_id, reason)
        return ScanResponse(scan_id=scan_id, status="failed", reason=reason)

    except Exception as exc:  # noqa: BLE001 — last-resort guard
        log.exception("scan %s crashed", scan_id)
        supabase_client.set_failed(scan_id, "An unexpected error occurred while scanning.")
        return ScanResponse(scan_id=scan_id, status="failed", reason=str(exc))

    finally:
        # ALWAYS remove the ephemeral clone, success or failure.
        if tmp_root:
            shutil.rmtree(tmp_root, ignore_errors=True)
            log.info("cleaned up temp dir for scan %s", scan_id)

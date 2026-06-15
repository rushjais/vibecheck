"""Gitleaks secret scanner.

Runs in detect mode over the working tree (`--no-git`) to find exposed API
keys, tokens, and credentials. Secret values are redacted in the output we
keep. Static file reads only — nothing from the repo is executed.
"""

import json
import logging
import os
import subprocess
import tempfile

from .. import config
from ..models import RawFinding
from ..util import relativize

log = logging.getLogger("engine.gitleaks")


def run(repo_dir: str) -> list[RawFinding]:
    fd, report_path = tempfile.mkstemp(prefix="gitleaks_", suffix=".json")
    os.close(fd)

    cmd = [
        "gitleaks", "detect",
        "--no-git",                 # scan files on disk, not git history
        "--source", repo_dir,
        "--report-format", "json",
        "--report-path", report_path,
        "--redact",                 # never store the raw secret value
        "--no-banner",
        "--exit-code", "0",         # don't treat "found leaks" as a hard error
    ]

    try:
        subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=config.GITLEAKS_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        log.warning("gitleaks timed out after %ss", config.GITLEAKS_TIMEOUT)
        _safe_remove(report_path)
        return []
    except FileNotFoundError:
        log.warning("gitleaks binary not found on PATH")
        _safe_remove(report_path)
        return []

    findings: list[RawFinding] = []
    try:
        with open(report_path, "r", encoding="utf-8") as fh:
            leaks = json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        leaks = []
    finally:
        _safe_remove(report_path)

    for leak in leaks or []:
        rule = leak.get("RuleID", "secret")
        findings.append(
            RawFinding(
                source="gitleaks",
                severity="high",
                category="secrets",
                title=f"Exposed secret ({rule})",
                file_path=relativize(leak.get("File"), repo_dir),
                line=leak.get("StartLine"),
                raw_detail={
                    "rule_id": rule,
                    "description": leak.get("Description"),
                    "match": leak.get("Match"),        # redacted by gitleaks
                    "entropy": leak.get("Entropy"),
                },
            )
        )

    return findings


def _safe_remove(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass

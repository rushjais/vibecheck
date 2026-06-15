"""Semgrep SAST scanner.

Semgrep performs *static* pattern matching — it parses source into an AST and
matches rules. It never executes the target code. We run it as a hard-bounded
subprocess and parse its JSON output.
"""

import json
import logging
import subprocess

from .. import config
from ..models import RawFinding
from ..util import relativize

log = logging.getLogger("engine.semgrep")

# Semgrep severities -> our scale.
_SEVERITY_MAP = {"ERROR": "high", "WARNING": "medium", "INFO": "low"}


def _categorize(check_id: str, metadata: dict) -> str:
    blob = f"{check_id} {json.dumps(metadata)}".lower()
    owasp = " ".join(str(x) for x in (metadata.get("owasp") or [])).lower()

    if "secret" in blob or "hardcoded" in blob and "credential" in blob:
        return "secrets"
    if any(k in blob for k in ("sql", "injection", "xss", "ssrf", "rce",
                               "command-injection", "path-traversal")) \
            or "a03" in owasp or "a01:2017" in owasp:
        return "injection"
    if any(k in blob for k in ("auth", "jwt", "session", "csrf", "access-control",
                               "permission")) or "a01" in owasp or "a07" in owasp:
        return "auth"
    if any(k in blob for k in ("cors", "tls", "ssl", "cookie", "header",
                               "config", "debug")):
        return "config"
    return "config"


def _humanish_title(message: str, check_id: str) -> str:
    """A short title — but never a raw rule id (the LLM step rewrites these)."""
    msg = (message or "").strip().split("\n")[0]
    if msg:
        return msg[:160]
    # Fallback: derive something from the last id segment, de-slugged.
    leaf = (check_id or "issue").rsplit(".", 1)[-1].replace("-", " ").replace("_", " ")
    return leaf[:160] or "Potential security issue"


def run(repo_dir: str, semgrep_packs: list[str]) -> list[RawFinding]:
    configs = config.SEMGREP_BASE_CONFIGS + [
        p for p in semgrep_packs if p not in config.SEMGREP_BASE_CONFIGS
    ]

    cmd = [
        "semgrep", "scan",
        "--json", "--quiet",
        "--metrics=off",
        "--disable-version-check",
        "--timeout", config.SEMGREP_PER_RULE_TIMEOUT,
        "--max-target-bytes", config.SEMGREP_MAX_TARGET_BYTES,
        "--oss-only",
    ]
    for cfg in configs:
        cmd += ["--config", cfg]
    for d in config.EXCLUDE_DIRS:
        cmd += ["--exclude", d]
    cmd.append(repo_dir)

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=config.SEMGREP_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        log.warning("semgrep timed out after %ss", config.SEMGREP_TIMEOUT)
        return []

    # semgrep exits 0 (clean) or 1 (findings present); >1 is a real error.
    if proc.returncode not in (0, 1):
        log.warning("semgrep failed (rc=%s): %s", proc.returncode,
                    (proc.stderr or "")[:500])
        return []

    try:
        data = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError:
        log.warning("could not parse semgrep JSON output")
        return []

    findings: list[RawFinding] = []
    for res in data.get("results", []):
        extra = res.get("extra", {}) or {}
        metadata = extra.get("metadata", {}) or {}
        check_id = res.get("check_id", "")
        severity = _SEVERITY_MAP.get(extra.get("severity", "WARNING"), "medium")

        findings.append(
            RawFinding(
                source="semgrep",
                severity=severity,
                category=_categorize(check_id, metadata),
                title=_humanish_title(extra.get("message", ""), check_id),
                file_path=relativize(res.get("path"), repo_dir),
                line=(res.get("start", {}) or {}).get("line"),
                raw_detail={
                    "check_id": check_id,
                    "message": extra.get("message", ""),
                    "owasp": metadata.get("owasp"),
                    "cwe": metadata.get("cwe"),
                    "references": metadata.get("references", [])[:3],
                },
            )
        )

    return findings

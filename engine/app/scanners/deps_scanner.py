"""Dependency vulnerability scanner via the OSV API.

We parse manifests statically (package.json / requirements.txt) and query
api.osv.dev by package + version. We NEVER run npm/pip or resolve a lockfile by
executing anything — declared dependencies only.
"""

import json
import logging
import os
import re

import httpx

from .. import config
from ..models import RawFinding
from ..util import relativize

log = logging.getLogger("engine.deps")

_SEMVER_RE = re.compile(r"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.\-]+)?")
# name [extras] (==|>=|~=|<=|===) version
_REQ_RE = re.compile(
    r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*"
    r"(?:===|==|~=|>=|<=)?\s*([0-9][0-9A-Za-z.\-]*)?"
)


def _clean_version(raw: str | None) -> str | None:
    if not raw:
        return None
    match = _SEMVER_RE.search(raw)
    return match.group(0) if match else None


def _parse_package_json(path: str) -> list[tuple[str, str | None]]:
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError):
        return []
    deps: list[tuple[str, str | None]] = []
    for key in ("dependencies", "devDependencies", "optionalDependencies"):
        section = data.get(key) or {}
        if isinstance(section, dict):
            for name, ver in section.items():
                deps.append((name, _clean_version(str(ver))))
    return deps


def _parse_requirements(path: str) -> list[tuple[str, str | None]]:
    deps: list[tuple[str, str | None]] = []
    try:
        with open(path, "r", encoding="utf-8") as fh:
            lines = fh.readlines()
    except OSError:
        return []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith(("#", "-", "git+", "http")):
            continue
        match = _REQ_RE.match(stripped)
        if match:
            deps.append((match.group(1), _clean_version(match.group(2))))
    return deps


def _find_manifests(repo_dir: str) -> dict[str, list[str]]:
    """Locate top-level-ish manifests (skip vendored dirs)."""
    found: dict[str, list[str]] = {"package.json": [], "requirements.txt": []}
    for root, dirs, files in os.walk(repo_dir):
        dirs[:] = [d for d in dirs if d not in config.EXCLUDE_DIRS]
        for name in files:
            if name in found:
                found[name].append(os.path.join(root, name))
    return found


def _query_osv(queries: list[dict]) -> list[dict]:
    if not queries:
        return []
    try:
        resp = httpx.post(
            config.OSV_QUERYBATCH_URL,
            json={"queries": [q["osv"] for q in queries]},
            timeout=config.OSV_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json().get("results", [])
    except (httpx.HTTPError, json.JSONDecodeError) as exc:
        log.warning("OSV query failed: %s", exc)
        return []


def _line_of(path: str, needle: str) -> int | None:
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as fh:
            for i, line in enumerate(fh, start=1):
                if needle in line:
                    return i
    except OSError:
        pass
    return None


def run(repo_dir: str) -> list[RawFinding]:
    manifests = _find_manifests(repo_dir)

    # Build a flat list of queries, remembering provenance for each.
    queries: list[dict] = []
    for manifest_path in manifests["package.json"]:
        for name, version in _parse_package_json(manifest_path):
            if not version:
                continue
            queries.append({
                "manifest": manifest_path, "name": name, "version": version,
                "ecosystem": "npm",
                "osv": {"package": {"name": name, "ecosystem": "npm"},
                        "version": version},
            })
    for manifest_path in manifests["requirements.txt"]:
        for name, version in _parse_requirements(manifest_path):
            if not version:
                continue
            queries.append({
                "manifest": manifest_path, "name": name, "version": version,
                "ecosystem": "PyPI",
                "osv": {"package": {"name": name, "ecosystem": "PyPI"},
                        "version": version},
            })

    results = _query_osv(queries)

    findings: list[RawFinding] = []
    for query, result in zip(queries, results):
        vulns = (result or {}).get("vulns") or []
        if not vulns:
            continue
        vuln_ids = [v.get("id") for v in vulns if v.get("id")]
        findings.append(
            RawFinding(
                source="osv",
                severity="high",
                category="deps",
                title=f"Vulnerable dependency: {query['name']}@{query['version']}",
                file_path=relativize(query["manifest"], repo_dir),
                line=_line_of(query["manifest"], query["name"]),
                raw_detail={
                    "package": query["name"],
                    "version": query["version"],
                    "ecosystem": query["ecosystem"],
                    "vuln_ids": vuln_ids[:10],
                    "vuln_count": len(vuln_ids),
                },
            )
        )

    return findings

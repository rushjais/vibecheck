"""Cheap config / scaling heuristics — pure file-content regex.

These are *candidate* findings (lower confidence by design). They read file
contents only; nothing is executed. The LLM step dedupes and prioritizes, so a
few false positives here are acceptable.
"""

import logging
import os
import re

from .. import config
from ..models import RawFinding
from ..util import relativize

log = logging.getLogger("engine.heuristics")

# --- Per-line patterns ------------------------------------------------------
# Each: (compiled regex, severity, category, title)
_LINE_RULES: list[tuple[re.Pattern, str, str, str]] = [
    (
        # NEXT_PUBLIC_ (client-exposed) var that names a real secret.
        re.compile(
            r"NEXT_PUBLIC_[A-Z0-9_]*(SECRET|PRIVATE|SERVICE_ROLE|PASSWORD|TOKEN)",
        ),
        "high", "secrets",
        "Secret exposed through a public (client-side) environment variable",
    ),
    (
        # Raw string SQL concatenation / interpolation.
        re.compile(
            r"(?i)(select\s|insert\s+into|update\s|delete\s+from)"
            r"[^;\n]*?(\"\s*\+|\+\s*[\"'`]|\$\{|%\s*\(|%s['\"]?\s*%|f[\"'])",
        ),
        "high", "injection",
        "SQL query built by gluing strings together",
    ),
    (
        # Hardcoded single-region infra hint.
        re.compile(r"(?i)(us|eu|ap|sa)-(east|west|south|north|central)-\d"),
        "low", "scaling",
        "Hardcoded single cloud region",
    ),
    (
        # Disabled TLS on a DB / service connection.
        re.compile(r"(?i)sslmode\s*=\s*disable|rejectUnauthorized\s*:\s*false"),
        "medium", "config",
        "Encryption/verification turned off on a connection",
    ),
]

# --- Whole-file checks ------------------------------------------------------
_RATE_LIMIT_HINTS = re.compile(
    r"(?i)rate[\-_]?limit|ratelimit|upstash|throttle|leaky[\-_]?bucket|"
    r"express-rate-limit|slowapi|limiter",
)
_API_HANDLER_HINTS = re.compile(
    r"(?i)export\s+(default\s+)?(async\s+)?function|"
    r"export\s+const\s+(GET|POST|PUT|PATCH|DELETE)|"
    r"@app\.(route|get|post)|@router\.(get|post)",
)
_DB_CALL_HINTS = re.compile(
    r"(?i)\.query\(|\.execute\(|cursor\.execute|prisma\.|supabase\.from\(|"
    r"db\.(select|insert|update|delete)|knex\(",
)


def _iter_text_files(repo_dir: str):
    for root, dirs, files in os.walk(repo_dir):
        dirs[:] = [d for d in dirs if d not in config.EXCLUDE_DIRS]
        for name in files:
            ext = os.path.splitext(name)[1].lower()
            if ext not in config.HEURISTIC_EXTS:
                continue
            path = os.path.join(root, name)
            try:
                if os.path.getsize(path) > config.MAX_HEURISTIC_FILE_BYTES:
                    continue
                with open(path, "r", encoding="utf-8", errors="ignore") as fh:
                    yield path, fh.read()
            except OSError:
                continue


def _is_api_route(path: str) -> bool:
    norm = path.replace(os.sep, "/").lower()
    return "/api/" in norm or "/routes/" in norm


def run(repo_dir: str) -> list[RawFinding]:
    findings: list[RawFinding] = []

    for path, text in _iter_text_files(repo_dir):
        rel = relativize(path, repo_dir)
        lines = text.splitlines()

        # Per-line pattern rules.
        for lineno, line in enumerate(lines, start=1):
            if len(line) > 1000:
                continue  # skip minified blobs
            for pattern, severity, category, title in _LINE_RULES:
                if pattern.search(line):
                    findings.append(RawFinding(
                        source="heuristic",
                        severity=severity,
                        category=category,
                        title=title,
                        file_path=rel,
                        line=lineno,
                        raw_detail={"snippet": line.strip()[:200]},
                    ))

        # Whole-file: API route with no rate limiting anywhere in the file.
        if _is_api_route(path) and _API_HANDLER_HINTS.search(text) \
                and not _RATE_LIMIT_HINTS.search(text):
            findings.append(RawFinding(
                source="heuristic",
                severity="low",
                category="scaling",
                title="API endpoint with no rate limiting",
                file_path=rel,
                line=None,
                raw_detail={"note": "No rate-limit/throttle library referenced."},
            ))

        # Whole-file: DB calls with no error handling in the file at all.
        if _DB_CALL_HINTS.search(text) and "try" not in text and "catch" not in text \
                and "except" not in text:
            findings.append(RawFinding(
                source="heuristic",
                severity="low",
                category="config",
                title="Database calls without error handling",
                file_path=rel,
                line=None,
                raw_detail={"note": "No try/catch/except around DB access in file."},
            ))

    return findings

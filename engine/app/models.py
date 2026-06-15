"""Shared data models."""

from typing import Any, Optional

from pydantic import BaseModel


class ScanRequest(BaseModel):
    scan_id: str
    repo_url: str


class RawFinding(BaseModel):
    """A single normalized finding from any scanner.

    This is the *raw* shape (pre-LLM). The plain-English version lives in the
    `findings` table and is produced by a later step.
    """

    source: str                       # semgrep | gitleaks | osv | heuristic
    severity: str                     # critical | high | medium | low
    category: str                     # secrets | auth | injection | deps | scaling | config
    title: str
    file_path: Optional[str] = None
    line: Optional[int] = None
    raw_detail: Optional[Any] = None


class ScanResponse(BaseModel):
    scan_id: str
    status: str
    languages: list[str] = []
    limited_support: bool = False
    finding_count: int = 0
    findings: list[RawFinding] = []
    reason: Optional[str] = None

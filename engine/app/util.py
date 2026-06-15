"""Small shared helpers."""

import os
from typing import Optional


def relativize(path: Optional[str], repo_dir: str) -> Optional[str]:
    """Return a repo-relative path for display, best-effort."""
    if not path:
        return path
    try:
        if os.path.isabs(path):
            return os.path.relpath(path, repo_dir)
        # Some tools emit paths already relative to the scan root.
        rel = os.path.relpath(path, repo_dir)
        return rel if not rel.startswith("..") else path
    except ValueError:
        return path


def clamp_severity(value: str) -> str:
    v = (value or "").strip().lower()
    return v if v in {"critical", "high", "medium", "low"} else "medium"

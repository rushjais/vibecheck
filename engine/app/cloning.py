"""Safe, static-only repo acquisition.

We *clone* (read) the repository and nothing else. We never install
dependencies, never run build scripts, never execute anything from the repo.
Limits are enforced immediately after clone, before any scanner touches a file.
"""

import logging
import os
import subprocess
import tempfile
from urllib.parse import urlparse

from . import config

log = logging.getLogger("engine.cloning")

ALLOWED_HOSTS = {"github.com", "www.github.com"}


class CloneError(Exception):
    """Cloning failed (bad URL, private repo, timeout, network, etc.)."""


class RepoTooLargeError(Exception):
    """Repo exceeded the file-count or size limit."""


def validate_url(repo_url: str) -> None:
    parsed = urlparse(repo_url)
    if parsed.scheme != "https":
        raise CloneError("Only https GitHub URLs are allowed.")
    if (parsed.hostname or "").lower() not in ALLOWED_HOSTS:
        raise CloneError("Only public github.com repositories are supported.")
    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) < 2:
        raise CloneError("URL must point to a specific repo (owner/repo).")


def clone_repo(repo_url: str) -> tuple[str, str]:
    """Shallow-clone into an ephemeral temp dir.

    Returns (tmp_root, repo_dir). Caller MUST delete tmp_root in a finally
    block. Credential prompts are disabled so private repos fail fast instead
    of hanging.
    """
    validate_url(repo_url)

    tmp_root = tempfile.mkdtemp(prefix="lg_scan_")
    repo_dir = os.path.join(tmp_root, "repo")

    env = {
        **os.environ,
        "GIT_TERMINAL_PROMPT": "0",   # never block on a username/password prompt
        "GIT_ASKPASS": "/bin/false",
        "GCM_INTERACTIVE": "never",
    }

    try:
        subprocess.run(
            [
                "git", "clone",
                "--depth", "1",
                "--single-branch",
                "--no-tags",
                repo_url,
                repo_dir,
            ],
            cwd=tmp_root,
            env=env,
            capture_output=True,
            text=True,
            timeout=config.CLONE_TIMEOUT,
            check=True,
        )
    except subprocess.TimeoutExpired as exc:
        raise CloneError("Cloning the repository timed out.") from exc
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip().splitlines()
        detail = stderr[-1] if stderr else "git clone failed"
        # Don't leak full git noise; private/missing repos land here.
        raise CloneError(
            "Could not clone the repository — make sure it's public."
        ) from exc

    return tmp_root, repo_dir


def enforce_limits(repo_dir: str) -> tuple[int, int]:
    """Count files and bytes in the working tree (excluding .git).

    Raises RepoTooLargeError as soon as a limit is crossed so we bail early on
    pathological repos instead of walking the whole thing.
    """
    total_bytes = 0
    file_count = 0

    for root, dirs, files in os.walk(repo_dir):
        if ".git" in dirs:
            dirs.remove(".git")  # don't count git internals
        for name in files:
            file_count += 1
            if file_count > config.MAX_FILE_COUNT:
                raise RepoTooLargeError(
                    f"Repository exceeds the {config.MAX_FILE_COUNT}-file limit."
                )
            try:
                total_bytes += os.path.getsize(os.path.join(root, name))
            except OSError:
                continue
            if total_bytes > config.MAX_REPO_BYTES:
                mb = config.MAX_REPO_BYTES // (1024 * 1024)
                raise RepoTooLargeError(
                    f"Repository exceeds the {mb} MB size limit."
                )

    return file_count, total_bytes

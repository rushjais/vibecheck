"""LaunchGuard scan engine — FastAPI entrypoint.

SAFETY MODEL (see README): this service performs STATIC ANALYSIS ONLY. It clones
public repositories and reads files. It NEVER installs dependencies, runs build
scripts, or executes any code from the target repository.
"""

import logging

from fastapi import FastAPI

from . import config
from .models import ScanRequest, ScanResponse
from .pipeline import run_pipeline

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

app = FastAPI(title="LaunchGuard Scan Engine", version="1.0.0")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "launchguard-scan-engine",
        "supabase_configured": config.supabase_configured(),
    }


@app.post("/scan", response_model=ScanResponse)
def scan(req: ScanRequest) -> ScanResponse:
    """Run the full static scan pipeline synchronously and return raw findings.

    Defined as a sync function so FastAPI runs it in a worker thread — the
    pipeline is subprocess/IO heavy. The scan row is transitioned to 'running'
    immediately and to 'awaiting_report' (or 'failed') on completion.
    """
    return run_pipeline(req.scan_id, req.repo_url, req.github_token)

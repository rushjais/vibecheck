"""Central configuration and hard limits for the scan engine.

Everything here is conservative on purpose: this service clones *untrusted*
third-party repositories, so the limits below are safety rails, not tuning
knobs. See README for the full safety model.
"""

import os

# --- Supabase (writes go through PostgREST with the service key) -------------
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")


def supabase_configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)


# --- Repo intake limits (enforced BEFORE any scanning) ----------------------
MAX_REPO_BYTES = 200 * 1024 * 1024  # ~200 MB working tree
MAX_FILE_COUNT = 5_000              # reject sprawling repos

# --- Subprocess timeouts (seconds) — every scanner is hard-bounded ----------
CLONE_TIMEOUT = 120
SEMGREP_TIMEOUT = 240
GITLEAKS_TIMEOUT = 120
OSV_TIMEOUT = 30
SUPABASE_TIMEOUT = 20

# --- Semgrep ----------------------------------------------------------------
# Base rulesets always run; language packs are appended per detected language.
SEMGREP_BASE_CONFIGS = ["p/owasp-top-ten", "p/secrets"]
SEMGREP_PER_RULE_TIMEOUT = "30"   # passed to `semgrep --timeout`
SEMGREP_MAX_TARGET_BYTES = "1000000"  # skip files larger than ~1 MB

# Directories we never want a scanner to descend into.
EXCLUDE_DIRS = ["node_modules", ".git", "dist", "build", "vendor", ".next",
                "__pycache__", ".venv", "venv"]

# --- OSV (dependency vulnerability lookup by manifest) ----------------------
OSV_QUERYBATCH_URL = "https://api.osv.dev/v1/querybatch"

# --- File-content heuristics ------------------------------------------------
# Only read text files we understand, and never read enormous files.
HEURISTIC_EXTS = {
    ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".py",
    ".env", ".yml", ".yaml", ".json", ".tf", ".sql", ".rb", ".go",
}
MAX_HEURISTIC_FILE_BYTES = 512 * 1024  # don't slurp huge files for regex

# Vibecheck Scan Engine

A standalone FastAPI service that clones a public GitHub repo, runs **static**
security scanners over it, and writes a compact `raw_findings` blob back to
Supabase for the LLM report step to consume.

Deployable to **Railway** (Dockerfile included).

---

## 🔒 Safety model (non-negotiable)

This service handles **untrusted** third-party code. It is built around one rule:

> **STATIC ANALYSIS ONLY. We read files. We never execute the target repo.**

Concretely:

- **No execution.** No `npm install`, no `pip install`, no build scripts, no
  running their tests, no `eval`. Dependencies are checked by *parsing manifests*
  (`package.json`, `requirements.txt`) and querying the OSV API — never by
  installing anything.
- **Ephemeral clone.** Repos are shallow-cloned (`--depth 1`) into a temp dir
  created with `mkdtemp`. The temp dir is deleted in a `finally` block on every
  path — success, failure, or crash.
- **Limits enforced *before* scanning.** Repos over **~200 MB** or **~5,000
  files** are rejected immediately after clone, before any scanner runs.
- **Hard-bounded subprocesses.** Every scanner (`git`, `semgrep`, `gitleaks`)
  runs as a subprocess with a timeout. Git credential prompts are disabled
  (`GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=/bin/false`) so private repos fail fast
  instead of hanging. Because the target code is never executed, it has no
  opportunity to make network calls.
- **Runs as non-root** in the container.

---

## API

### `GET /health`
```json
{ "status": "ok", "service": "vibecheck-scan-engine", "supabase_configured": true }
```

### `POST /scan`
Request:
```json
{ "scan_id": "uuid", "repo_url": "https://github.com/owner/repo" }
```

Pipeline: mark scan `running` → clone → enforce limits → detect languages →
run scanners → normalize → write `raw_findings` and set status
`awaiting_report`. On any failure the scan is set to `failed` with a short
reason and the temp dir is still cleaned up.

Response (also written to the scan row as `raw_findings`):
```json
{
  "scan_id": "uuid",
  "status": "awaiting_report",
  "languages": ["typescript", "javascript"],
  "limited_support": false,
  "finding_count": 12,
  "findings": [
    {
      "source": "semgrep",
      "severity": "high",
      "category": "injection",
      "title": "User input flows into a SQL query",
      "file_path": "src/db/users.ts",
      "line": 42,
      "raw_detail": { "check_id": "...", "owasp": ["A03:2021"] }
    }
  ]
}
```

Each finding is normalized to:
`{ source, severity, category, title, file_path, line, raw_detail }`.

> Note: the engine writes **only** to the `scans` row (`raw_findings` + status).
> It does **not** write to the `findings` table — that holds the plain-English
> version produced by the later LLM step.

---

## The scan pipeline

1. **Language detection** from the file tree. JS/TS and Python are fully
   supported (the dominant vibecoder stacks); other languages still get the
   OWASP + secrets passes but are flagged `limited_support: true`.
2. **SAST — Semgrep** with `p/owasp-top-ten`, `p/secrets`, and the detected
   language pack (`p/javascript` / `p/typescript` / `p/python`). JSON parsed.
3. **Secrets — gitleaks** in detect mode over the working tree (`--no-git`,
   `--redact`). Finds exposed API keys, tokens, and credentials.
4. **Dependencies — OSV** (`api.osv.dev`). Declared deps from `package.json`
   (npm) and `requirements.txt` (PyPI) are queried by manifest. **npm/pip are
   never run.**
5. **Config / scaling heuristics** — cheap file-content regex: secrets in
   `NEXT_PUBLIC_*` env, missing rate limiting on API routes, raw string SQL
   concatenation, DB calls with no error handling, hardcoded single-region /
   TLS-disabled infra hints.

---

## Environment variables (Railway)

| Variable | Required | Description |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Supabase project URL, e.g. `https://abc.supabase.co`. |
| `SUPABASE_SERVICE_KEY` | yes | Supabase **service role** key (server-side; bypasses RLS to write scan status + `raw_findings`). |
| `PORT` | no | Set automatically by Railway. Defaults to `8000`. |

If Supabase env vars are missing, the engine still runs and returns findings in
the HTTP response — it just skips the DB writes (handy for local testing).

> Requires migration `0003_engine.sql` (adds the `raw_findings` column and the
> `awaiting_report` status value).

---

## System dependencies (already in the Dockerfile)

- **git** — shallow clone (`apt`).
- **semgrep** — SAST engine (`pip`, in `requirements.txt`).
- **gitleaks** — secret scanner (binary downloaded from GitHub releases).

> On the first scan, Semgrep downloads the `p/*` rulesets from its registry and
> caches them. This needs outbound network from the **engine** (not the target
> code) and adds a few seconds to the first run.

---

## Local development

```bash
cd engine
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# you also need `git`, `semgrep`, and `gitleaks` on your PATH locally
cp .env.example .env   # optional: fill in Supabase to test DB writes

uvicorn app.main:app --reload --port 8000

# in another shell:
curl -s localhost:8000/health
curl -s -X POST localhost:8000/scan \
  -H 'Content-Type: application/json' \
  -d '{"scan_id":"local-test","repo_url":"https://github.com/OWASP/NodeGoat"}' | jq
```

## Deploy to Railway

1. Create a new Railway service from this repo, root directory `engine/`
   (Railway auto-detects the `Dockerfile`).
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in the service variables.
3. Deploy. Point the web app's `SCAN_ENGINE_URL` at the service's public URL
   (the app POSTs to `${SCAN_ENGINE_URL}/scan`).

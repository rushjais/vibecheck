# LaunchGuard

**Paste a GitHub repo, get a plain-English security & launch-readiness report — and a one-click PR that fixes the issues.**

LaunchGuard is built for non-technical / AI-assisted ("vibecoder") founders. It scans a repository with real static-analysis tools, then uses an LLM to translate the raw findings into a report a non-engineer can act on: what's wrong, why it matters in real-world terms, and a copy-paste fix for an AI coding agent. Signed-in + GitHub-connected users can scan **private** repos and have LaunchGuard **open a pull request** that fixes the top issues.

> **Status: friends-only test mode.** Everything is currently free and fully unlocked (no paywall). The Stripe billing code is in the repo but ungated. See [Operating modes](#operating-modes).

---

## How it works

```
Browser (Next.js)                 Scan engine (FastAPI)            External
─────────────────                 ─────────────────────            ────────
paste repo URL ──► POST /api/scans ──► POST /scan
                     • rate-limit (Upstash)   • shallow git clone (read-only)
                     • create scan row        • enforce size/file caps
                                              • semgrep + gitleaks + OSV + heuristics
                     ◄── raw_findings ─────────  • write raw_findings, delete clone
poll /api/scans/[id]/status
                   ──► POST /api/report ──────────────────────────► Anthropic (Claude)
                     • dedupe → top 8, plain-English, fix prompts
                     • write findings, status=done
/scan/[id] ◄── full report (risk ring, finding cards, copy-fix)

Signed-in + GitHub-connected:
  pick a private repo ─► same flow, engine clones with the user's token
  "Fix it for me" ─► POST /api/github/fix ─► Claude rewrites files ─► opens a PR
```

The **scan engine never executes the target repository** — it only clones and reads files, then runs static scanners as bounded subprocesses. See [`engine/README.md`](engine/README.md) for the full safety model.

---

## Tech stack

| Layer | Tech |
| --- | --- |
| Web app | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Scan engine | Python / FastAPI, Docker (deploy on Railway) |
| Database & auth | Supabase (Postgres + Row Level Security + magic-link Auth) |
| LLM | Anthropic Claude (`claude-opus-4-8`) for reports & fixes |
| Static analysis | `git`, Semgrep, Gitleaks, OSV API |
| Auto-fix PRs | GitHub OAuth (`repo` scope) + GitHub REST API |
| Rate limiting | Upstash Redis (sliding window) |
| Analytics | PostHog + a durable `events` table |
| Payments (dormant) | Stripe Checkout |

---

## Repository layout

```
.
├── app/                      # Next.js App Router
│   ├── page.tsx              # Landing + scan intake
│   ├── scan/[id]/page.tsx    # Progress → report (owner-gated for private scans)
│   ├── admin/funnel/page.tsx # Conversion-funnel dashboard (passphrase-gated)
│   ├── auth/                 # callback (OAuth code), confirm (magic-link verifyOtp)
│   └── api/                  # route handlers (see API routes below)
├── components/               # React UI (report view, finding cards, modals, …)
├── lib/                      # supabase clients, report/fix generators, rate-limit, …
│   └── supabase/             # cookie-based browser + server auth clients
├── types/database.ts         # typed Supabase schema
├── engine/                   # FastAPI scan engine (its own README + Dockerfile)
├── supabase/migrations/      # 0001–0004 schema migrations
├── deploy/
│   ├── all-migrations.sql    # 0001–0005 concatenated — paste into Supabase SQL editor
│   └── 0005_rls_lockdown.sql # RLS privacy lockdown
└── .env.local.example        # all environment variables
```

### API routes

| Route | Purpose |
| --- | --- |
| `POST /api/scans` | Create a scan (rate-limited); detects private repos for connected users and triggers the engine |
| `GET /api/scans/[id]/status` | Server-side status poll (service-role read) |
| `POST /api/report` | Generate the plain-English report via Claude, write findings, mark `done` |
| `POST /api/events` | Record client-originated funnel events (service-role; RLS-safe) |
| `GET /api/me` | `{ signedIn, githubConnected }` — never returns the token |
| `GET /api/github/connect` · `…/callback` | GitHub OAuth (read private repos + open PRs) |
| `GET /api/github/repos` | List the user's repos (`full_name`, `private`, `default_branch`) |
| `POST /api/github/fix` | Generate fixes with Claude, commit to a branch, open a PR |
| `/auth/callback` · `/auth/confirm` | Supabase OAuth code exchange / magic-link `verifyOtp` |
| `/api/checkout` · `…/return` | Stripe Checkout (present but dormant in test mode) |

---

## Local development

You run two processes: the **web app** and the **scan engine**.

### 1. Prerequisites
- Node.js 18+ and npm
- A [Supabase](https://supabase.com) project
- An [Anthropic API key](https://console.anthropic.com)
- For the engine: `git`, plus Docker **or** Python 3.11+ with `semgrep` and `gitleaks`

### 2. Database
Create a Supabase project, then in **SQL Editor** paste and run [`deploy/all-migrations.sql`](deploy/all-migrations.sql). This creates the tables (`users`, `scans`, `findings`, `events`, `fix_prs`), enables realtime, and applies the **RLS privacy lockdown**.

### 3. Web app
```bash
cp .env.local.example .env.local   # fill in values (see Environment variables)
npm install
npm run dev                        # http://localhost:3000
```

### 4. Scan engine
```bash
cd engine
cp .env.example .env               # SUPABASE_URL + SUPABASE_SERVICE_KEY
# Docker (recommended — semgrep & gitleaks baked in):
docker build -t launchguard-engine . && docker run --rm -p 8000:8000 --env-file .env launchguard-engine
# …or run directly (needs git, semgrep, gitleaks on PATH):
#   python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
#   uvicorn app.main:app --port 8000
```
Set `SCAN_ENGINE_URL=http://localhost:8000` in the app's `.env.local`. See [`engine/README.md`](engine/README.md) for details.

Then open http://localhost:3000 and scan a public repo (e.g. `https://github.com/OWASP/NodeGoat`).

---

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Publishable/anon key (safe in the browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service-role/secret key — server only, bypasses RLS |
| `ANTHROPIC_API_KEY` | ✅ | Report & fix generation |
| `SCAN_ENGINE_URL` | ✅ | URL of the FastAPI engine |
| `ADMIN_PASSPHRASE` | ✅ | Gate for `/admin/funnel?key=…` |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | for private repos / PRs | GitHub OAuth App; callback `…/api/github/callback` |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | optional | Per-IP rate limit; **no-ops if unset** |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | optional | Analytics; no-ops if unset |
| `STRIPE_SECRET_KEY` | optional | Billing (dormant in test mode) |

Engine (`engine/.env`): `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` — the same project URL and **service-role** key as the app (note the different variable names).

---

## Security model

LaunchGuard handles other people's source code and GitHub tokens, so the data layer is locked down:

- **Static analysis only.** The engine never installs dependencies, runs build scripts, or executes the repo. It shallow-clones into an ephemeral temp dir (deleted in a `finally`), enforces size/file caps before scanning, and runs each scanner as a bounded subprocess.
- **RLS deny-by-default.** Row Level Security is enabled (with no anon policies) on `users`, `scans`, `findings`, `fix_prs`, and `events`. The public anon key that ships in the browser **cannot** read GitHub tokens or report contents — all reads/writes go through the **service-role** key in server routes.
- **Tokens never leak.** GitHub tokens are stored server-side, never returned to the client (`/api/me` and `/api/github/repos` return booleans / safe fields only) and never logged (the engine clones over an `x-access-token` URL that is kept out of all logs and error messages).
- **Private reports are owner-gated.** A report for a private repo (`scan.user_id` set) renders only for the owner; anyone else gets a 404, and the public share link is hidden.

> Known limitation: GitHub tokens are stored as plaintext in `users.github_token` (RLS-protected, but not encrypted at rest). Encrypt before a real public launch.

---

## Database & migrations

Schema lives in `supabase/migrations/`:

| File | What it adds |
| --- | --- |
| `0001_init.sql` | `users`, `scans`, `findings`, `events` |
| `0002_realtime.sql` | realtime publication for `scans` |
| `0003_engine.sql` | `scans.raw_findings` + `awaiting_report` status |
| `0004_github_fix_prs.sql` | `users.github_*`, `fix_prs` table |
| `deploy/0005_rls_lockdown.sql` | RLS deny-by-default on all sensitive tables |

For a fresh database, just run [`deploy/all-migrations.sql`](deploy/all-migrations.sql) (0001–0005 concatenated).

---

## Analytics & the funnel

Every funnel step is written to **both PostHog and the `events` table**:

```
scan_started → scan_viewed → unlock_clicked → checkout_started → checkout_completed
```

`/admin/funnel?key=<ADMIN_PASSPHRASE>` shows distinct-scan counts and conversion/drop-off at each step, read straight from the `events` table.

---

## Deployment

- **Web app → Vercel.** Import the repo, set all environment variables in Project Settings, and add your production domain to the Supabase Auth redirect allowlist so magic-link sign-in works. Pushes to `main` auto-deploy.
- **Scan engine → Railway.** Deploy the `engine/` directory (Dockerfile auto-detected); set `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`; point the app's `SCAN_ENGINE_URL` at the Railway URL.

---

## Operating modes

The repo is currently in **friends-only test mode**:
- All findings are unlocked (no paywall); the unlock modal never triggers.
- Any signed-in user can connect GitHub and open auto-fix PRs (no Pro gate).
- Stripe/checkout code is present but unused.

To re-enable billing later: re-introduce the locked-findings gate in `app/api/report/route.ts`, the Pro gate in `app/api/github/connect/route.ts`, and surface the paywall via `components/PaywallModal.tsx`.

---

## Scripts

```bash
npm run dev      # local dev server
npm run build    # production build (also type-checks + lints)
npm run start    # serve the production build
npm run lint     # ESLint
```

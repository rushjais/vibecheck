-- LaunchGuard — all migrations (0001–0004), concatenated in order.
-- Generated from supabase/migrations/. Paste this whole file into the
-- Supabase SQL editor and run once. Safe to re-run (idempotent guards).


-- ============================================================================
-- 0001_init.sql
-- ============================================================================

-- LaunchGuard initial schema
-- Tables: users, scans, findings, events
--
-- Notes:
--   * Anonymous scans are allowed: scans.user_id / events.user_id are nullable.
--   * Enum-like columns are kept as text but constrained with CHECK so the app
--     stays flexible while the DB still rejects invalid states.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id          uuid primary key default gen_random_uuid(),
  email       text,
  created_at  timestamptz not null default now(),
  plan        text not null default 'free'
                check (plan in ('free', 'pro', 'team'))
);

-- ---------------------------------------------------------------------------
-- scans
-- ---------------------------------------------------------------------------
create table if not exists public.scans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.users (id) on delete set null,
  repo_url      text not null,
  status        text not null default 'queued'
                  check (status in ('queued', 'running', 'done', 'failed')),
  risk_score    int
                  check (risk_score is null or (risk_score between 0 and 100)),
  summary       text,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index if not exists scans_user_id_idx    on public.scans (user_id);
create index if not exists scans_status_idx     on public.scans (status);
create index if not exists scans_created_at_idx on public.scans (created_at desc);

-- ---------------------------------------------------------------------------
-- findings
-- ---------------------------------------------------------------------------
create table if not exists public.findings (
  id                uuid primary key default gen_random_uuid(),
  scan_id           uuid not null references public.scans (id) on delete cascade,
  severity          text not null
                      check (severity in ('critical', 'high', 'medium', 'low')),
  category          text not null
                      check (category in ('secrets', 'auth', 'injection', 'deps', 'scaling', 'config')),
  title             text not null,
  plain_explanation text not null,
  why_it_matters    text not null,
  fix_snippet       text,
  fix_prompt        text,
  file_path         text,
  line              int,
  is_locked         boolean not null default false
);

create index if not exists findings_scan_id_idx  on public.findings (scan_id);
create index if not exists findings_severity_idx on public.findings (severity);

-- ---------------------------------------------------------------------------
-- events  (lightweight product analytics)
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users (id) on delete set null,
  scan_id     uuid references public.scans (id) on delete set null,
  name        text not null,
  props       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists events_user_id_idx    on public.events (user_id);
create index if not exists events_scan_id_idx     on public.events (scan_id);
create index if not exists events_name_idx        on public.events (name);
create index if not exists events_created_at_idx  on public.events (created_at desc);


-- ============================================================================
-- 0002_realtime.sql
-- ============================================================================

-- Enable Supabase Realtime for the scans table so the progress page can
-- live-update when a scan's status / score changes.
--
-- The `supabase_realtime` publication ships with every Supabase project.
-- Guarded so re-running the migration is safe.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'scans'
  ) then
    alter publication supabase_realtime add table public.scans;
  end if;
end $$;

-- Ensure UPDATE payloads include the full new row (not just changed columns).
alter table public.scans replica identity full;


-- ============================================================================
-- 0003_engine.sql
-- ============================================================================

-- Scan engine support:
--   * raw_findings: compact JSON written by the engine (the raw scanner output),
--     consumed by the later LLM step that produces plain-English findings.
--   * new status value 'awaiting_report' — scanners finished, report pending.

alter table public.scans
  add column if not exists raw_findings jsonb;

alter table public.scans
  drop constraint if exists scans_status_check;

alter table public.scans
  add constraint scans_status_check
    check (status in ('queued', 'running', 'awaiting_report', 'done', 'failed'));


-- ============================================================================
-- 0004_github_fix_prs.sql
-- ============================================================================

-- Pro "auto-fix PR" feature.
--   * users.github_login / github_token: stored after a Pro user opts into
--     GitHub OAuth (minimum scope to open a PR). Token is sensitive — service
--     role only; never exposed to the browser.
--   * fix_prs: a record of each pull request LaunchGuard opened for a scan, so
--     the report UI can link back to it.

alter table public.users
  add column if not exists github_login text,
  add column if not exists github_token text;

create table if not exists public.fix_prs (
  id            uuid primary key default gen_random_uuid(),
  scan_id       uuid not null references public.scans (id) on delete cascade,
  user_id       uuid references public.users (id) on delete set null,
  pr_url        text not null,
  pr_number     int,
  branch        text,
  title         text,
  finding_count int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists fix_prs_scan_id_idx on public.fix_prs (scan_id);


-- ============================================================================
-- 0005_rls_lockdown.sql
-- ============================================================================

-- 0005_rls_lockdown.sql
-- Privacy lockdown for the friends-only test.
--
-- The public anon (publishable) key ships in the browser bundle. Without RLS,
-- anyone could hit PostgREST with that key and read:
--   * users.github_token   → plaintext GitHub tokens = full access to private repos
--   * findings             → every report's contents
--   * scans                → every repo URL / summary
--
-- Fix: enable Row Level Security with NO policies → deny-by-default for the
-- anon and authenticated roles. The app reads/writes these tables ONLY through
-- server routes using the service-role key, which BYPASSES RLS — so this does
-- not break the app. (events already has RLS enabled.)
--
-- Safe to re-run.

-- fix_prs holds pr_url (references private repos) and events holds funnel
-- props — lock these down too so a fresh deploy isn't relying on a platform
-- default to protect them.
alter table public.users    enable row level security;
alter table public.scans    enable row level security;
alter table public.findings enable row level security;
alter table public.fix_prs  enable row level security;
alter table public.events   enable row level security;

-- Force RLS even for the table owner role, belt-and-suspenders. (service_role
-- still bypasses RLS entirely and is unaffected.)
alter table public.users    force row level security;
alter table public.scans    force row level security;
alter table public.findings force row level security;
alter table public.fix_prs  force row level security;
alter table public.events   force row level security;

-- No CREATE POLICY statements: with RLS on and zero policies, every anon /
-- authenticated request is denied. Nothing to grant for this test.


-- ============================================================================
-- 0006_scan_unlock.sql
-- ============================================================================

-- Per-scan one-time unlock ($9). The Stripe webhook flips this to true on
-- checkout.session.completed; the report page reveals all findings when set.

alter table public.scans
  add column if not exists unlocked boolean not null default false;


-- ============================================================================
-- 0007_scan_credits.sql
-- ============================================================================

-- Scan credits. $9 buys a pack of full-report unlocks ("scans"). Spending one
-- credit sets scans.unlocked = true for a scan. Credits are ONLY ever granted
-- by the signature-verified Stripe webhook.

alter table public.users
  add column if not exists scan_credits int not null default 0;

-- Idempotency for the Stripe webhook so retries don't double-credit.
create table if not exists public.webhook_events (
  id          text primary key,
  created_at  timestamptz not null default now()
);

-- Deny-by-default like the other tables; the server uses the service-role key.
alter table public.webhook_events enable row level security;

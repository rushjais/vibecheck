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

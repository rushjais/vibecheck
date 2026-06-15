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

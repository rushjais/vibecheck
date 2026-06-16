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

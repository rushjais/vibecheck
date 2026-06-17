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

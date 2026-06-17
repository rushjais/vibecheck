-- Per-scan one-time unlock ($9). The Stripe webhook flips this to true on
-- checkout.session.completed; the report page reveals all findings when set.

alter table public.scans
  add column if not exists unlocked boolean not null default false;

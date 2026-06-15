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

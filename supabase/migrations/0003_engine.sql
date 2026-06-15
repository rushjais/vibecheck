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

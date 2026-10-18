-- Weekly and monthly automatic reports, alongside the daily one.
ALTER TABLE settings
  ADD COLUMN auto_weekly_enabled  boolean NOT NULL DEFAULT false,
  ADD COLUMN auto_monthly_enabled boolean NOT NULL DEFAULT false;

-- Each stored report records which kind of period it covers.
ALTER TABLE generated_reports
  ADD COLUMN period_type text NOT NULL DEFAULT 'custom'
  CHECK (period_type IN ('day','week','month','custom'));

UPDATE generated_reports SET period_type = 'day' WHERE period_start = period_end;

-- One successful scheduled report per period type, period and format.
DROP INDEX IF EXISTS generated_reports_sched_uq;
CREATE UNIQUE INDEX generated_reports_sched_uq
  ON generated_reports (period_type, period_start, format)
  WHERE trigger = 'scheduled' AND status = 'success';

-- Record this migration (lets it be pasted into an SQL editor by hand too).
CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migrations (name) VALUES ('003_weekly_monthly_reports.sql') ON CONFLICT DO NOTHING;

-- Scheduled reports: the full report and the movement-only report can both exist for the same period.
DROP INDEX IF EXISTS generated_reports_sched_uq;
CREATE UNIQUE INDEX generated_reports_sched_uq ON generated_reports (store_id, period_type, period_start, report_kind, format)
  WHERE trigger = 'scheduled' AND status = 'success';

INSERT INTO schema_migrations (name) VALUES ('018_movement_reports.sql') ON CONFLICT DO NOTHING;

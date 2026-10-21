-- Activity notifications: when each person last opened their activity feed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS activity_seen_at timestamptz;
UPDATE users SET activity_seen_at = now() WHERE activity_seen_at IS NULL;

-- Page access is now switchable per person. People with a custom permission list keep every page they
-- could already open (these pages used to be open to everyone).
UPDATE users
   SET permissions = (SELECT array_agg(DISTINCT p) FROM unnest(permissions || ARRAY['page.transactions','page.low_stock','page.reports','page.report_history','page.setup']) AS p)
 WHERE permissions IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_txn_created_idx ON stock_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS email_log_sent_idx ON email_log (sent_at DESC);

INSERT INTO schema_migrations (name) VALUES ('009_activity_pages.sql') ON CONFLICT DO NOTHING;

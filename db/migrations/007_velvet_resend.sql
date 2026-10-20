-- The Velvet Store: new default name (only if the store still has the old default).
UPDATE settings SET store_name = 'The Velvet Store' WHERE store_name IN ('MY STORE', 'My Store');
ALTER TABLE settings ALTER COLUMN store_name SET DEFAULT 'The Velvet Store';

-- What is needed to send an email again (message text and how to rebuild any attachment).
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS resend_of bigint REFERENCES email_log(id) ON DELETE SET NULL;

INSERT INTO schema_migrations (name) VALUES ('007_velvet_resend.sql') ON CONFLICT DO NOTHING;

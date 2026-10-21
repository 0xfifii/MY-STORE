-- Removing a person from the Users list. Their name stays on everything they recorded (the stock history
-- can't lose who did what), but they disappear from the list, can't sign in, and their email can be reused.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
DROP INDEX IF EXISTS users_email_uq;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (lower(email)) WHERE deleted_at IS NULL;

INSERT INTO schema_migrations (name) VALUES ('011_remove_users.sql') ON CONFLICT DO NOTHING;

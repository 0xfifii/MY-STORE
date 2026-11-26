-- The day a transfer happened (can be an earlier day, like a backdated stock in or out).
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS occurred_at timestamptz NOT NULL DEFAULT now();
UPDATE stock_transfers SET occurred_at = created_at WHERE occurred_at <> created_at AND occurred_at > created_at;

INSERT INTO schema_migrations (name) VALUES ('023_transfer_date.sql') ON CONFLICT DO NOTHING;

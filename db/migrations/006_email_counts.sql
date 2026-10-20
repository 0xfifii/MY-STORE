-- 1. Email: mail account can be set in Store Settings (server SMTP_* variables still take priority).
ALTER TABLE settings ADD COLUMN IF NOT EXISTS smtp_host text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS smtp_port integer;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS smtp_user text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS smtp_pass text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS smtp_from text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS welcome_email_enabled boolean NOT NULL DEFAULT true;

-- Every email the app sends (or fails to send).
CREATE TABLE IF NOT EXISTS email_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  sent_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  kind         text NOT NULL,          -- message | receipt | report | audit_report | welcome | test | scheduled
  recipients   text[] NOT NULL,
  subject      text NOT NULL,
  attachments  text[] NOT NULL DEFAULT '{}',
  status       text NOT NULL CHECK (status IN ('sent','failed')),
  error        text
);
CREATE INDEX IF NOT EXISTS email_log_sent_idx ON email_log (sent_at DESC);

-- 2. Where a ledger row came from. 'count' = adjustment posted by an approved physical stock count.
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS source text;
CREATE OR REPLACE FUNCTION attach_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v text := current_setting('mystore.source', true);
BEGIN
  IF NEW.source IS NULL AND coalesce(v, '') <> '' THEN NEW.source := v; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stock_transactions_attach_source ON stock_transactions;
CREATE TRIGGER stock_transactions_attach_source
  BEFORE INSERT ON stock_transactions
  FOR EACH ROW EXECUTE FUNCTION attach_source();

-- 3. Physical stock counts (audits). Staff record what they counted; an approver posts the
--    difference as a shortage (stock out) or excess (stock in) at the item's average cost.
CREATE TABLE IF NOT EXISTS stock_counts (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  count_no       text GENERATED ALWAYS AS ('CNT-' || lpad(id::text, 5, '0')) STORED,
  item_id        uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  counted_at     timestamptz NOT NULL DEFAULT now(),
  system_qty     numeric(20,6) NOT NULL,
  counted_qty    numeric(20,6) NOT NULL CHECK (counted_qty >= 0),
  difference     numeric(20,6) NOT NULL,          -- counted − system (negative = shortage)
  unit_cost      numeric(20,6) NOT NULL,          -- average cost per base unit when counted
  value_difference numeric(20,2) NOT NULL,
  notes          text,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  counted_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at     timestamptz,
  decision_note  text,
  txn_id         bigint REFERENCES stock_transactions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS stock_counts_item_idx ON stock_counts (item_id, counted_at);
CREATE INDEX IF NOT EXISTS stock_counts_status_idx ON stock_counts (status, counted_at);

INSERT INTO schema_migrations (name) VALUES ('006_email_counts.sql') ON CONFLICT DO NOTHING;

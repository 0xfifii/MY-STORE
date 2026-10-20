-- Allow an owner to permanently delete an item together with its stock history.
-- The ledger stays append-only for everything else: a DELETE is only let through when the
-- transaction has set mystore.deleting_item to the id of the item whose rows are going.
CREATE OR REPLACE FUNCTION forbid_ledger_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.item_id::text = coalesce(current_setting('mystore.deleting_item', true), '') THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'LEDGER_IMMUTABLE: stock transactions cannot be modified or deleted; use a reversal';
END $$;

INSERT INTO schema_migrations (name) VALUES ('005_item_delete.sql') ON CONFLICT DO NOTHING;

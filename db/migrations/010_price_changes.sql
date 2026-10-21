-- Price changes: re-price the stock on hand. Recorded in the ledger as a 'revaluation' that moves value
-- only (quantity 0), so every report keeps balancing: closing = opening + in - out + corrections and price changes.
ALTER TABLE stock_transactions DROP CONSTRAINT IF EXISTS stock_transactions_txn_type_check;
ALTER TABLE stock_transactions ADD CONSTRAINT stock_transactions_txn_type_check
  CHECK (txn_type IN ('stock_in','stock_out','reversal','revaluation'));
ALTER TABLE stock_transactions DROP CONSTRAINT IF EXISTS stock_transactions_quantity_check;
ALTER TABLE stock_transactions ADD CONSTRAINT stock_transactions_quantity_check
  CHECK (quantity > 0 OR (txn_type = 'revaluation' AND quantity = 0));
ALTER TABLE stock_transactions DROP CONSTRAINT IF EXISTS stock_transactions_entered_quantity_check;
ALTER TABLE stock_transactions ADD CONSTRAINT stock_transactions_entered_quantity_check
  CHECK (entered_quantity > 0 OR (txn_type = 'revaluation' AND entered_quantity = 0));
ALTER TABLE stock_transactions DROP CONSTRAINT IF EXISTS stock_transactions_revaluation_check;
ALTER TABLE stock_transactions ADD CONSTRAINT stock_transactions_revaluation_check
  CHECK (txn_type <> 'revaluation' OR correction_reason IS NOT NULL);

CREATE OR REPLACE FUNCTION revalue_item(
  p_item_id     uuid,
  p_unit_id     integer,
  p_unit_cost   numeric,   -- new price per p_unit_id
  p_reason      text,
  p_user_id     uuid,
  p_request_id  uuid
) RETURNS stock_transactions LANGUAGE plpgsql AS $$
DECLARE
  v_item    items;
  v_factor  numeric;
  v_base    numeric(20,6);
  v_new     numeric(20,4);
  v_diff    numeric(20,4);
  v_txn     stock_transactions;
BEGIN
  SELECT * INTO v_item FROM items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;
  IF p_request_id IS NOT NULL THEN
    SELECT * INTO v_txn FROM stock_transactions WHERE client_request_id = p_request_id;
    IF FOUND THEN RETURN v_txn; END IF;
  END IF;
  IF v_item.archived_at IS NOT NULL THEN RAISE EXCEPTION 'ITEM_ARCHIVED: this item is archived'; END IF;
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN RAISE EXCEPTION 'INVALID_COST: the price cannot be negative'; END IF;
  IF v_item.quantity <= 0 THEN
    RAISE EXCEPTION 'NO_STOCK: there is no stock to re-price. The new price will apply when you record Stock In';
  END IF;

  v_factor := resolve_unit_factor(p_item_id, p_unit_id);
  v_base   := round(p_unit_cost / v_factor, 6);           -- price per base unit
  v_new    := round(v_item.quantity * v_base, 2);
  v_diff   := v_new - v_item.stock_value;
  IF v_diff = 0 THEN RAISE EXCEPTION 'NO_CHANGE: that is already the price'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN p_reason := 'Price changed'; END IF;

  UPDATE items SET stock_value = v_new, updated_at = now() WHERE id = p_item_id RETURNING * INTO v_item;

  INSERT INTO stock_transactions (
    item_id, txn_type, direction, entered_quantity, entered_unit_id, conversion_factor, entered_unit_cost,
    quantity, unit_id, unit_cost, total_value, balance_after, value_after, correction_reason,
    occurred_at, created_by, client_request_id
  ) VALUES (
    p_item_id, 'revaluation', CASE WHEN v_diff > 0 THEN 1 ELSE -1 END, 0, p_unit_id, v_factor, p_unit_cost,
    0, v_item.unit_id, v_base, abs(v_diff), v_item.quantity, v_item.stock_value, trim(p_reason),
    now(), p_user_id, p_request_id
  ) RETURNING * INTO v_txn;
  RETURN v_txn;
END $$;

-- A price change is undone by setting the price again, not by reversing it.
DO $mig$
DECLARE r record; d text;
BEGIN
  FOR r IN SELECT oid FROM pg_proc WHERE proname = 'reverse_transaction' LOOP
    d := pg_get_functiondef(r.oid);
    d := replace(d, 'IF v_orig.txn_type = ''reversal'' THEN',
      'IF v_orig.txn_type = ''revaluation'' THEN RAISE EXCEPTION ''CANNOT_REVERSE: a price change is undone by setting the price again''; END IF;
  IF v_orig.txn_type = ''reversal'' THEN');
    EXECUTE d;
  END LOOP;
END $mig$;

INSERT INTO schema_migrations (name) VALUES ('010_price_changes.sql') ON CONFLICT DO NOTHING;

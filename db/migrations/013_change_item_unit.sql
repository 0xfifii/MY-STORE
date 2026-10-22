-- Changing an item's measuring unit after stock has been recorded.
-- p_factor = how many of the NEW unit make one OLD unit (1 = same thing, just renamed; 1 bag = 50 kg -> 50).
-- Every base-unit quantity in the item's history is rescaled in one go, so balances, reports and counts stay
-- correct. Money never changes. What people originally typed (entered quantity and unit) is kept as it was.

-- The ledger stays read-only except for this one controlled rescale.
CREATE OR REPLACE FUNCTION forbid_ledger_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Deleting an item (and its whole history) on purpose; see 005.
  IF TG_OP = 'DELETE' AND OLD.item_id::text = coalesce(current_setting('mystore.deleting_item', true), '') THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND current_setting('mystore.rescale', true) = 'on'
     AND NEW.total_value = OLD.total_value AND NEW.value_after = OLD.value_after
     AND NEW.entered_quantity = OLD.entered_quantity AND NEW.entered_unit_id = OLD.entered_unit_id
     AND NEW.entered_unit_cost = OLD.entered_unit_cost AND NEW.item_id = OLD.item_id THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'LEDGER_IMMUTABLE: stock transactions cannot be modified or deleted; use a reversal';
END $$;

CREATE OR REPLACE FUNCTION change_item_unit(p_item_id uuid, p_new_unit integer, p_factor numeric)
RETURNS items LANGUAGE plpgsql AS $$
DECLARE
  v_item items;
  v_old  integer;
  v_frac boolean;
BEGIN
  SELECT * INTO v_item FROM items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;
  v_old := v_item.unit_id;
  IF p_new_unit = v_old THEN RAISE EXCEPTION 'NO_CHANGE: the item already uses this unit'; END IF;
  IF p_factor IS NULL OR p_factor <= 0 THEN RAISE EXCEPTION 'INVALID_QUANTITY: enter how many new units make one old unit'; END IF;
  PERFORM 1 FROM units WHERE id = p_new_unit AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'UNIT_NOT_CONVERTIBLE: choose a valid unit'; END IF;

  PERFORM set_config('mystore.rescale', 'on', true);
  UPDATE stock_transactions
     SET quantity = round(quantity * p_factor, 6),
         unit_id = p_new_unit,
         unit_cost = round(unit_cost / p_factor, 6),
         conversion_factor = conversion_factor * p_factor,
         balance_after = round(balance_after * p_factor, 6)
   WHERE item_id = p_item_id;
  PERFORM set_config('mystore.rescale', 'off', true);

  UPDATE stock_counts
     SET system_qty = round(system_qty * p_factor, 6), counted_qty = round(counted_qty * p_factor, 6),
         difference = round(difference * p_factor, 6), unit_cost = round(unit_cost / p_factor, 6)
   WHERE item_id = p_item_id;

  -- Other units entered for this item now relate to the new base unit; the old unit becomes one of them.
  UPDATE item_unit_conversions SET factor = factor * p_factor WHERE item_id = p_item_id;
  DELETE FROM item_unit_conversions WHERE item_id = p_item_id AND unit_id = p_new_unit;
  IF p_factor <> 1 THEN
    INSERT INTO item_unit_conversions (item_id, unit_id, factor) VALUES (p_item_id, v_old, p_factor)
      ON CONFLICT (item_id, unit_id) DO UPDATE SET factor = EXCLUDED.factor;
  END IF;

  v_frac := v_item.allow_fraction OR round(v_item.quantity * p_factor, 6) <> trunc(round(v_item.quantity * p_factor, 6));
  UPDATE items
     SET unit_id = p_new_unit,
         quantity = round(quantity * p_factor, 6),
         min_stock_level = round(min_stock_level * p_factor, 6),
         price = CASE WHEN price IS NULL THEN NULL ELSE round(price / p_factor, 6) END,
         allow_fraction = v_frac,
         updated_at = now()
   WHERE id = p_item_id
  RETURNING * INTO v_item;
  RETURN v_item;
END $$;

INSERT INTO schema_migrations (name) VALUES ('013_change_item_unit.sql') ON CONFLICT DO NOTHING;

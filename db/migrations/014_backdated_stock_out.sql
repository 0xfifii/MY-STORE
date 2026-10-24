-- Stock out can be recorded for an earlier date (owners, or anyone given "Record for an earlier date").
-- Adds p_occurred_at to stock_out(); a backdated issue must not take more than was in stock on that date.
DO $mig$
DECLARE d text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'stock_out' AND pronargs = 10) THEN RETURN; END IF;
  d := pg_get_functiondef('stock_out(uuid,numeric,integer,text,text,text,text,uuid,uuid)'::regprocedure);
  d := replace(d, 'p_request_id uuid)', 'p_request_id uuid, p_occurred_at timestamptz DEFAULT NULL)');
  d := replace(d, 'IF v_base > v_item.quantity THEN', $x$IF p_occurred_at IS NOT NULL AND p_occurred_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'INVALID_DATE: the date can''t be in the future';
  END IF;
  IF p_occurred_at IS NOT NULL AND p_occurred_at < now() - interval '5 minutes' THEN
    DECLARE v_then numeric;
    BEGIN
      SELECT coalesce(sum(direction * quantity), 0) INTO v_then FROM stock_transactions
       WHERE item_id = p_item_id AND occurred_at <= p_occurred_at;
      IF v_base > v_then THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: only % was in stock at that date and time', trim_scale(v_then)
          USING DETAIL = trim_scale(v_then)::text;
      END IF;
    END;
  END IF;
  IF v_base > v_item.quantity THEN$x$);
  d := replace(d, 'now(), p_user_id, p_request_id', 'coalesce(p_occurred_at, now()), p_user_id, p_request_id');
  DROP FUNCTION stock_out(uuid,numeric,integer,text,text,text,text,uuid,uuid);
  EXECUTE d;
END $mig$;

INSERT INTO schema_migrations (name) VALUES ('014_backdated_stock_out.sql') ON CONFLICT DO NOTHING;

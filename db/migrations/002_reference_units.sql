-- Standard measurement units. Users can add their own custom units in the app.
INSERT INTO units (name, symbol, allow_decimal, is_system) VALUES
  ('Pieces',      'pcs',    true, true),
  ('Bags',        'bags',   true, true),
  ('Cartons',     'ctn',    true, true),
  ('Packs',       'packs',  true, true),
  ('Bottles',     'btl',    true, true),
  ('Crates',      'crates', true, true),
  ('Rolls',       'rolls',  true, true),
  ('Boxes',       'boxes',  true, true),
  ('Grams',       'g',      true, true),
  ('Kilograms',   'kg',     true, true),
  ('Milligrams',  'mg',     true, true),
  ('Millilitres', 'ml',     true, true),
  ('Litres',      'L',      true, true),
  ('Metres',      'm',      true, true),
  ('Centimetres', 'cm',     true, true),
  ('Dozens',      'doz',    true, true),
  ('Units',       'units',  true, true);

-- Universal conversions between compatible units only (mass↔mass, volume↔volume,
-- length↔length, dozen↔pieces). Bags, cartons, crates etc. are NOT converted
-- globally — their size differs per item, so they are set per item.
INSERT INTO unit_conversions (from_unit_id, to_unit_id, factor)
SELECT f.id, t.id, c.factor
FROM (VALUES
  ('kg',  'g',   1000),
  ('kg',  'mg',  1000000),
  ('g',   'mg',  1000),
  ('L',   'ml',  1000),
  ('m',   'cm',  100),
  ('doz', 'pcs', 12)
) AS c(f, t, factor)
JOIN units f ON lower(f.symbol) = lower(c.f)
JOIN units t ON lower(t.symbol) = lower(c.t);

-- Record this migration (lets it be pasted into an SQL editor by hand too).
CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migrations (name) VALUES ('002_reference_units.sql') ON CONFLICT DO NOTHING;

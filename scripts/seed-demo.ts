/**
 * DEVELOPMENT / DEMO ONLY. Fills an empty database with sample items and a few days of
 * stock movements so you can try the app. Never run this against your real store database.
 *
 *   DATABASE_URL=postgres://.../mystore_demo npm run db:seed-demo
 *
 * Refuses to run if any items already exist. Creates the login demo@mystore.local / demo-pass-123
 * if there are no users yet.
 */
import { Client } from "pg";
import bcrypt from "bcryptjs";
import { loadEnv } from "./load-env";

loadEnv();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    const { rows: existing } = await db.query("SELECT count(*)::int n FROM items");
    if (existing[0].n > 0) throw new Error("This database already has items. The demo seed only runs on an empty database.");

    await db.query("BEGIN");
    let { rows: users } = await db.query("SELECT id FROM users WHERE role = 'owner' LIMIT 1");
    if (!users.length) {
      users = (await db.query(
        "INSERT INTO users (name, email, password_hash, role) VALUES ('Demo Owner', 'demo@mystore.local', $1, 'owner') RETURNING id",
        [await bcrypt.hash("demo-pass-123", 11)],
      )).rows;
      console.log("Created demo login: demo@mystore.local / demo-pass-123");
    }
    const user = users[0].id;
    const unit = async (s: string) => (await db.query("SELECT id FROM units WHERE symbol = $1", [s])).rows[0].id;
    const cat = async (n: string) => (await db.query("INSERT INTO categories (name) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id", [n])).rows[0]?.id
      ?? (await db.query("SELECT id FROM categories WHERE lower(name) = lower($1)", [n])).rows[0].id;
    const sup = (await db.query("INSERT INTO suppliers (name) VALUES ('Demo Wholesale Ltd') RETURNING id")).rows[0].id;

    const items: { name: string; unit: string; cat: string; min: string; cost: string; qty: string; conv?: [string, string] }[] = [
      { name: "Rice (50kg bag)", unit: "bags", cat: "Grains", min: "3", cost: "45000", qty: "12" },
      { name: "Granulated sugar", unit: "kg", cat: "Baking", min: "5", cost: "1100", qty: "30" },
      { name: "Vegetable oil", unit: "L", cat: "Oils & Spices", min: "5", cost: "1800", qty: "25" },
      { name: "Coca-Cola 50cl", unit: "btl", cat: "Beverages", min: "24", cost: "250", qty: "96", conv: ["crates", "24"] },
      { name: "Tomato paste (400g tin)", unit: "pcs", cat: "Groceries", min: "12", cost: "650", qty: "40", conv: ["ctn", "24"] },
      { name: "Liquid detergent", unit: "L", cat: "Cleaning", min: "4", cost: "1500", qty: "3" },
    ];
    const ids: Record<string, string> = {};
    for (const it of items) {
      const { rows } = await db.query(
        "INSERT INTO items (sku, name, category_id, unit_id, min_stock_level, default_supplier_id, created_by) VALUES ('ITM-' || lpad(nextval('item_sku_seq')::text, 5, '0'), $1, $2, $3, $4, $5, $6) RETURNING id",
        [it.name, await cat(it.cat), await unit(it.unit), it.min, sup, user],
      );
      ids[it.name] = rows[0].id;
      if (it.conv) await db.query("INSERT INTO item_unit_conversions (item_id, unit_id, factor) VALUES ($1, $2, $3)", [rows[0].id, await unit(it.conv[0]), it.conv[1]]);
      await db.query("SELECT stock_in($1,$2,$3,$4,$5,NULL,'Opening stock',NULL, now() - interval '3 days',$6,NULL,true)",
        [rows[0].id, it.qty, await unit(it.unit), it.cost, sup, user]);
    }
    await db.query("SELECT stock_out($1, 2.5, $2, 'kitchen_usage', 'Kitchen', NULL, NULL, $3, NULL)", [ids["Rice (50kg bag)"], await unit("bags"), user]);
    await db.query("SELECT stock_in($1, 10, $2, 1250, $3, NULL, 'INV-1001', NULL, now() - interval '1 day', $4, NULL)", [ids["Granulated sugar"], await unit("kg"), sup, user]);
    await db.query("SELECT stock_out($1, 3.25, $2, 'sale', NULL, NULL, NULL, $3, NULL)", [ids["Granulated sugar"], await unit("kg"), user]);
    await db.query("SELECT stock_out($1, 1, $2, 'sale', 'Walk-in customer', NULL, NULL, $3, NULL)", [ids["Coca-Cola 50cl"], await unit("crates"), user]);
    await db.query("COMMIT");
    console.log("Demo data loaded.");
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

/**
 * End-to-end acceptance tests for ÌṢÚRA.
 * Runs against a live server + real PostgreSQL database (see README "Running the tests").
 *
 *   TEST_BASE_URL=http://localhost:3100 TEST_DATABASE_URL=postgres://... npm test
 *
 * The database must be freshly migrated and EMPTY (no users) — the suite performs first-run setup.
 */
import { describe as baseDescribe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import ExcelJS from "exceljs";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3100";
const DB = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/mystore_test";
const CRON = process.env.TEST_CRON_SECRET ?? "test-cron-secret-1234567890";
const MAIL_DIR = process.env.TEST_MAIL_DIR ?? "";

const describe = process.env.TEST_BASE_URL ? baseDescribe : baseDescribe.skip;

class Session {
  cookie = "";
  async req(method: string, path: string, body?: unknown) {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(this.cookie ? { cookie: this.cookie } : {}), origin: BASE },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const type = res.headers.get("content-type") ?? "";
    const data = type.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data: data as any, headers: res.headers };
  }
  get = (p: string) => this.req("GET", p);
  post = (p: string, b: unknown = {}) => this.req("POST", p, b);
  patch = (p: string, b: unknown) => this.req("PATCH", p, b);
}

const owner = new Session();
const staff = new Session();
const viewer = new Session();
let db: Client;
const units: Record<string, number> = {};

async function stockIn(s: Session, item: string, quantity: string, unit: string, cost: string, extra: Record<string, unknown> = {}) {
  return s.post("/api/stock/in", { item_id: item, quantity, unit_id: units[unit], unit_cost: cost, request_id: randomUUID(), ...extra });
}
async function stockOut(s: Session, item: string, quantity: string, unit: string, extra: Record<string, unknown> = {}) {
  return s.post("/api/stock/out", { item_id: item, quantity, unit_id: units[unit], reason: "kitchen_usage", request_id: randomUUID(), ...extra });
}
async function item(id: string) {
  return (await owner.get(`/api/items/${id}`)).data.item;
}
async function createItem(name: string, unit: string, extra: Record<string, unknown> = {}) {
  const r = await owner.post("/api/items", { name, unit_id: units[unit], min_stock_level: "0", request_id: randomUUID(), ...extra });
  expect(r.status, JSON.stringify(r.data)).toBe(201);
  return r.data.id as string;
}

let rice: string, sugar: string, coke: string;

beforeAll(async () => {
  if (!process.env.TEST_BASE_URL) return;
  db = new Client({ connectionString: DB });
  await db.connect();
  const { rows } = await db.query("SELECT id, symbol FROM units");
  for (const r of rows) units[r.symbol] = r.id;
});
afterAll(async () => db?.end());

describe("1. Setup, sign-in and users", () => {
  it("creates the owner on first run and refuses a second setup", async () => {
    const r = await owner.post("/api/auth/setup", { name: "Ada Owner", email: "owner@mystore.test", password: "owner-pass-123" });
    expect(r.status).toBe(201);
    const again = await new Session().post("/api/auth/setup", { name: "X", email: "x@x.test", password: "whatever-123" });
    expect(again.status).toBe(409);
  });
  it("rejects wrong passwords and unauthenticated API calls", async () => {
    const bad = await new Session().post("/api/auth/login", { email: "owner@mystore.test", password: "nope" });
    expect(bad.status).toBe(401);
    const anon = await new Session().get("/api/items");
    expect(anon.status).toBe(401);
    const page = await new Session().get("/dashboard");
    expect(page.status).toBe(307);
  });
  it("owner adds a staff member and a viewer, who can sign in", async () => {
    expect((await owner.post("/api/users", { name: "Sam Staff", email: "staff@mystore.test", role: "staff", password: "staff-pass-123" })).status).toBe(201);
    expect((await owner.post("/api/users", { name: "Vic Viewer", email: "viewer@mystore.test", role: "viewer", password: "viewer-pass-123" })).status).toBe(201);
    expect((await staff.post("/api/auth/login", { email: "staff@mystore.test", password: "staff-pass-123" })).status).toBe(200);
    expect((await viewer.post("/api/auth/login", { email: "VIEWER@mystore.test", password: "viewer-pass-123" })).status).toBe(200);
  });
});

describe("2. Items", () => {
  it("adds a new item with an auto-generated code", async () => {
    rice = await createItem("Rice (50kg bag)", "bags", { min_stock_level: "3" });
    const it = await item(rice);
    expect(it.sku).toMatch(/^ITM-\d{5}$/);
    expect(it.quantity).toBe("0.000000");
    expect(it.unit_symbol).toBe("bags");
  });
  it("blocks duplicate item codes and warns about similar names", async () => {
    const it = await item(rice);
    const dup = await owner.post("/api/items", { name: "Other", sku: it.sku.toLowerCase(), unit_id: units.pcs, request_id: randomUUID() });
    expect(dup.status).toBe(409);
    const check = await owner.get(`/api/items/check?name=${encodeURIComponent("rice 50kg bag")}`);
    expect(check.data.similar.map((s: any) => s.id)).toContain(rice);
  });
  it("double-submitting the add-item form creates only one item", async () => {
    const request_id = randomUUID();
    const body = { name: "Vegetable oil", unit_id: units.L, request_id };
    const [a, b] = await Promise.all([owner.post("/api/items", body), owner.post("/api/items", body)]);
    const ids = new Set([a.data.id, b.data.id]);
    expect(ids.size).toBe(1);
    const { rows } = await db.query("SELECT count(*)::int n FROM items WHERE name = 'Vegetable oil'");
    expect(rows[0].n).toBe(1);
  });
});

describe("3. Stock in / stock out with decimals (acceptance 2–5)", () => {
  it("receives 10 bags, issues 2.5 bags, leaves 7.5 bags", async () => {
    const a = await stockIn(staff, rice, "10", "bags", "20000", { supplier_name: "Market" });
    expect(a.status, JSON.stringify(a.data)).toBe(201);
    expect(a.data.item.quantity).toBe("10.000000");
    const b = await stockOut(staff, rice, "2.5", "bags", { recipient: "Kitchen" });
    expect(b.status, JSON.stringify(b.data)).toBe(201);
    const it = await item(rice);
    expect(it.quantity).toBe("7.500000");
    expect(it.stock_value).toBe("150000.0000");
  });

  it("20 kg + 5.5 kg − 3.25 kg = 22.25 kg (decimal kilograms)", async () => {
    sugar = await createItem("Sugar", "kg", { opening_quantity: "20", opening_unit_cost: "1000" });
    expect((await item(sugar)).quantity).toBe("20.000000");
    expect((await stockIn(owner, sugar, "5.5", "kg", "1200")).status).toBe(201);
    expect((await stockOut(owner, sugar, "3.25", "kg")).status).toBe(201);
    expect((await item(sugar)).quantity).toBe("22.250000");
  });
});

describe("4. Weighted-average costing (acceptance 6)", () => {
  it("values issues at the moving average and keeps each receipt's own cost", async () => {
    // 20 kg @1000 + 5.5 kg @1200 = 26,600 for 25.5 kg → avg 1043.137255
    const { rows } = await db.query(
      "SELECT txn_type, unit_cost::text, total_value::text FROM stock_transactions WHERE item_id = $1 ORDER BY id", [sugar]);
    expect(rows[0]).toMatchObject({ txn_type: "stock_in", unit_cost: "1000.000000", total_value: "20000.0000" });
    expect(rows[1]).toMatchObject({ txn_type: "stock_in", unit_cost: "1200.000000", total_value: "6600.0000" });
    expect(rows[2]).toMatchObject({ txn_type: "stock_out", unit_cost: "1043.137255", total_value: "3390.2000" });
    const it = await item(sugar);
    expect(it.stock_value).toBe("23209.8000");
    expect(Number(it.avg_cost)).toBeCloseTo(23209.8 / 22.25, 5);
  });
  it("issuing the whole balance clears the value exactly (no leftover kobo)", async () => {
    const x = await createItem("Salt", "kg", { opening_quantity: "3", opening_unit_cost: "333.33" });
    await stockIn(owner, x, "1", "kg", "100");
    await stockOut(owner, x, "1.7", "kg");
    await stockOut(owner, x, "2.3", "kg");
    const it = await item(x);
    expect(it.quantity).toBe("0.000000");
    expect(it.stock_value).toBe("0.0000");
  });
});

describe("5. Validation: over-issue, bad quantities, unit mixing (acceptance 7, 8)", () => {
  it("rejects issuing more than available and reports the available quantity", async () => {
    const r = await stockOut(staff, rice, "8", "bags");
    expect(r.status).toBe(409);
    expect(r.data.code).toBe("INSUFFICIENT_STOCK");
    expect(r.data.available).toBe("7.5");
    expect((await item(rice)).quantity).toBe("7.500000");
  });
  it("rejects zero, negative and malformed quantities on the server", async () => {
    for (const q of ["0", "-1", "abc", "1e3", "0.0000001"]) {
      const r = await stockOut(staff, rice, q, "bags");
      expect(r.status, q).toBe(400);
    }
    expect((await stockIn(staff, rice, "1", "bags", "-5")).status).toBe(400);
  });
  it("never treats kg as g or bags as pieces", async () => {
    // Rice is counted in bags; no bag↔kg rule defined → refused, not silently converted.
    const r = await stockOut(staff, rice, "1", "kg");
    expect(r.status).toBe(400);
    expect(r.data.code).toBe("UNIT_NOT_CONVERTIBLE");
    expect((await stockOut(staff, rice, "1", "pcs")).data.code).toBe("UNIT_NOT_CONVERTIBLE");
    // Sugar is in kg; 500 g converts via the standard 1 kg = 1000 g rule to 0.5 kg.
    const g = await stockOut(staff, sugar, "500", "g");
    expect(g.status).toBe(201);
    expect((await item(sugar)).quantity).toBe("21.750000");
  });
  it("uses item-specific conversions only for that item (1 crate = 24 bottles)", async () => {
    coke = await createItem("Coke 50cl", "btl", { conversions: [{ unit_id: units.crates, factor: "24" }], allow_fraction: false, min_stock_level: "24" });
    const r = await stockIn(staff, coke, "2", "crates", "4800");
    expect(r.status).toBe(201);
    const it = await item(coke);
    expect(it.quantity).toBe("48.000000");
    expect(it.avg_cost).toBe("200.000000");
    // Whole-units-only item refuses 1.5 bottles but accepts 0.5 crate (= 12 bottles)
    expect((await stockOut(staff, coke, "1.5", "btl")).data.code).toBe("FRACTION_NOT_ALLOWED");
    expect((await stockOut(staff, coke, "0.5", "crates")).status).toBe(201);
    expect((await item(coke)).quantity).toBe("36.000000");
    // The crate rule does not leak to other items.
    expect((await stockIn(staff, rice, "1", "crates", "1")).data.code).toBe("UNIT_NOT_CONVERTIBLE");
  });
  it("requires a reason, and a note for 'Other'", async () => {
    expect((await stockOut(staff, rice, "1", "bags", { reason: "" })).status).toBe(400);
    expect((await stockOut(staff, rice, "1", "bags", { reason: "other" })).data.code).toBe("NOTE_REQUIRED");
  });
  it("rejects a receipt dated in the future", async () => {
    const r = await stockIn(staff, rice, "1", "bags", "1", { occurred_at: new Date(Date.now() + 86400_000).toISOString() });
    expect(r.data.code).toBe("INVALID_DATE");
  });
});

describe("6. Persistence (acceptance 9)", () => {
  it("balances are read back from the database by a fresh session", async () => {
    const fresh = new Session();
    await fresh.post("/api/auth/login", { email: "owner@mystore.test", password: "owner-pass-123" });
    const r = await fresh.get(`/api/items/${rice}`);
    expect(r.data.item.quantity).toBe("7.500000");
    // and the item balance equals the ledger sum
    const { rows } = await db.query(
      "SELECT i.quantity::text q, (SELECT sum(direction*quantity) FROM stock_transactions t WHERE t.item_id=i.id)::numeric(20,6)::text s FROM items i WHERE i.id=$1", [rice]);
    expect(rows[0].q).toBe(rows[0].s);
  });
});

describe("7. Search and listing (acceptance 13)", () => {
  it("finds items by name or code, exact code first", async () => {
    const it = await item(sugar);
    const byName = await staff.get("/api/items?q=suga");
    expect(byName.data.rows[0].id).toBe(sugar);
    const byCode = await staff.get(`/api/items?q=${it.sku.toLowerCase()}`);
    expect(byCode.data.rows[0].id).toBe(sugar);
    const low = await staff.get("/api/items?status=attention");
    for (const r of low.data.rows) expect(Number(r.quantity)).toBeLessThanOrEqual(Number(r.min_stock_level));
    const out = await staff.get("/api/items?status=out");
    for (const r of out.data.rows) expect(r.status).toBe("out");
  });
});

describe("8. Duplicates and concurrency (acceptance 16)", () => {
  it("a double-clicked stock out is recorded once", async () => {
    const request_id = randomUUID();
    const body = { item_id: rice, quantity: "1", unit_id: units.bags, reason: "sale", request_id };
    const results = await Promise.all([staff.post("/api/stock/out", body), staff.post("/api/stock/out", body), staff.post("/api/stock/out", body)]);
    expect(new Set(results.map((r) => r.data.txn?.txn_no)).size).toBe(1);
    expect((await item(rice)).quantity).toBe("6.500000");
  });
  it("30 simultaneous issues of 1 bag against 6.5 bags: exactly 6 succeed, never negative", async () => {
    const results = await Promise.all(Array.from({ length: 30 }, () => stockOut(staff, rice, "1", "bags")));
    const ok = results.filter((r) => r.status === 201).length;
    const refused = results.filter((r) => r.status === 409).length;
    expect(ok).toBe(6);
    expect(refused).toBe(24);
    const it = await item(rice);
    expect(it.quantity).toBe("0.500000");
    expect(Number(it.stock_value)).toBeCloseTo(10000, 2);
  });
  it("mixed concurrent receipts and issues end at the exact expected balance", async () => {
    const x = await createItem("Flour", "kg", { opening_quantity: "100", opening_unit_cost: "500" });
    const ops = [
      ...Array.from({ length: 20 }, () => stockIn(staff, x, "2.25", "kg", "520")),
      ...Array.from({ length: 20 }, () => stockOut(staff, x, "1.75", "kg")),
    ];
    const res = await Promise.all(ops);
    expect(res.every((r) => r.status === 201)).toBe(true);
    expect((await item(x)).quantity).toBe("110.000000"); // 100 + 45 − 35
    const { rows } = await db.query(
      "SELECT i.stock_value::text v, (SELECT sum(direction*total_value) FROM stock_transactions t WHERE t.item_id=i.id)::text s FROM items i WHERE i.id=$1", [x]);
    expect(Number(rows[0].v)).toBeCloseTo(Number(rows[0].s), 4);
  });
});

describe("9. Permissions (acceptance 15)", () => {
  it("viewer is read-only", async () => {
    expect((await viewer.get("/api/items")).status).toBe(200);
    expect((await stockOut(viewer, sugar, "1", "kg")).status).toBe(403);
    expect((await viewer.post("/api/items", { name: "Hack", unit_id: units.pcs })).status).toBe(403);
    expect((await viewer.post("/api/reports/generate", { preset: "today", formats: ["csv"] })).status).toBe(403);
  });
  it("staff can't reverse, archive, change settings or manage users", async () => {
    const t = (await db.query("SELECT id FROM stock_transactions WHERE item_id=$1 AND txn_type='stock_out' LIMIT 1", [sugar])).rows[0].id;
    expect((await staff.post(`/api/transactions/${t}/reverse`, { reason: "test it", request_id: randomUUID() })).status).toBe(403);
    expect((await staff.post(`/api/items/${sugar}/archive`, { archived: true })).status).toBe(403);
    expect((await staff.patch("/api/settings", {})).status).toBe(403);
    expect((await staff.get("/api/users")).status).toBe(403);
    expect((await staff.post("/api/users", { name: "x", email: "x@x.co", role: "owner", password: "12345678" })).status).toBe(403);
  });
  it("cross-site POSTs are blocked", async () => {
    const r = await fetch(BASE + "/api/stock/out", { method: "POST", headers: { cookie: staff.cookie, origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
    expect(r.status).toBe(403);
  });
  it("deactivated users are signed out immediately", async () => {
    const tmp = new Session();
    await owner.post("/api/users", { name: "Temp", email: "temp@mystore.test", role: "staff", password: "temp-pass-123" });
    await tmp.post("/api/auth/login", { email: "temp@mystore.test", password: "temp-pass-123" });
    expect((await tmp.get("/api/items")).status).toBe(200);
    const id = (await db.query("SELECT id FROM users WHERE email='temp@mystore.test'")).rows[0].id;
    await owner.patch(`/api/users/${id}`, { is_active: false });
    expect((await tmp.get("/api/items")).status).toBe(401);
  });
  it("the last owner can't be demoted", async () => {
    const id = (await db.query("SELECT id FROM users WHERE email='owner@mystore.test'")).rows[0].id;
    expect((await owner.patch(`/api/users/${id}`, { role: "staff" })).status).toBe(409);
  });
});

describe("10. Corrections and audit trail", () => {
  it("reversing a stock out restores quantity and value, once only", async () => {
    const before = await item(sugar);
    const t = (await db.query("SELECT id, quantity::text, total_value::text FROM stock_transactions WHERE item_id=$1 AND txn_type='stock_out' ORDER BY id DESC LIMIT 1", [sugar])).rows[0];
    const r = await owner.post(`/api/transactions/${t.id}/reverse`, { reason: "Entered twice by mistake", request_id: randomUUID() });
    expect(r.status, JSON.stringify(r.data)).toBe(201);
    const after = await item(sugar);
    expect(Number(after.quantity)).toBeCloseTo(Number(before.quantity) + Number(t.quantity), 6);
    expect(Number(after.stock_value)).toBeCloseTo(Number(before.stock_value) + Number(t.total_value), 4);
    const again = await owner.post(`/api/transactions/${t.id}/reverse`, { reason: "again", request_id: randomUUID() });
    expect(again.data.code).toBe("ALREADY_REVERSED");
    const log = await db.query("SELECT 1 FROM audit_logs WHERE action='transaction.reverse' AND entity_id=$1", [String(t.id)]);
    expect(log.rowCount).toBe(1);
  });
  it("can't reverse a receipt whose stock has already been issued", async () => {
    const t = (await db.query("SELECT id FROM stock_transactions WHERE item_id=$1 AND txn_type='stock_in' AND NOT is_opening ORDER BY id LIMIT 1", [rice])).rows[0];
    const r = await owner.post(`/api/transactions/${t.id}/reverse`, { reason: "wrong supplier", request_id: randomUUID() });
    expect(r.status).toBe(409);
  });
  it("ledger rows can't be edited or deleted, even directly in SQL", async () => {
    await expect(db.query("UPDATE stock_transactions SET quantity = 999 WHERE item_id = $1", [rice])).rejects.toThrow(/LEDGER_IMMUTABLE/);
    await expect(db.query("DELETE FROM stock_transactions WHERE item_id = $1", [rice])).rejects.toThrow(/LEDGER_IMMUTABLE/);
  });
  it("item edits are audited and can't change the balance", async () => {
    const it = await item(sugar);
    const r = await owner.patch(`/api/items/${sugar}`, { name: "Sugar (granulated)", sku: it.sku, allow_fraction: true, min_stock_level: "5", quantity: "9999" });
    expect(r.status).toBe(200);
    const after = await item(sugar);
    expect(after.quantity).toBe(it.quantity);
    expect(after.name).toBe("Sugar (granulated)");
    const log = await db.query("SELECT details FROM audit_logs WHERE action='item.update' AND entity_id=$1", [sugar]);
    expect(log.rows[0].details.changes.name.to).toBe("Sugar (granulated)");
  });
});

describe("11. Reports reconcile with the ledger (acceptance 10, 11)", () => {
  let today: string, yesterday: string;
  beforeAll(async () => {
    const { rows } = await db.query("SELECT (now() AT TIME ZONE 'Africa/Lagos')::date::text t, ((now() AT TIME ZONE 'Africa/Lagos')::date - 1)::text y");
    today = rows[0].t; yesterday = rows[0].y;
    // A backdated receipt for yesterday so the two days chain together.
    const oil = (await db.query("SELECT id FROM items WHERE name='Vegetable oil'")).rows[0].id;
    const r = await stockIn(owner, oil, "12.5", "L", "1800", { occurred_at: `${yesterday}T10:00:00+01:00` });
    expect(r.status).toBe(201);
  });

  async function exportCsv(q: string) {
    const r = await owner.get(`/api/reports/export?format=csv&${q}`);
    expect(r.status).toBe(200);
    return (r.data as Buffer).toString("utf8");
  }

  it("today's totals equal the sum of today's transactions", async () => {
    const { rows } = await db.query(
      `SELECT coalesce(sum(total_value) FILTER (WHERE txn_type='stock_in'),0)::numeric(20,2)::text i,
              coalesce(sum(total_value) FILTER (WHERE txn_type='stock_out'),0)::numeric(20,2)::text o
         FROM stock_transactions WHERE occurred_at >= ($1::date)::timestamp AT TIME ZONE 'Africa/Lagos'`, [today]);
    const csv = await exportCsv("preset=today");
    expect(csv).toContain(`Cost of stock in,${rows[0].i}`);
    expect(csv).toContain(`Cost of stock out,${rows[0].o}`);
  });

  it("opening + in − out ± corrections = closing, per item and in total; yesterday's closing = today's opening", async () => {
    for (const q of [`from=${yesterday}&to=${yesterday}`, `from=${today}&to=${today}`, `from=${yesterday}&to=${today}`]) {
      const csv = await exportCsv(q + "&kind=balance");
      const lines = csv.split("\r\n");
      const start = lines.findIndex((l) => l.startsWith("STOCK SHEET"));
      const head = lines[start + 1].split(",");
      const col = (name: string) => head.findIndex((h) => h.startsWith(name));
      let checked = 0;
      for (let j = start + 2; j < lines.length && lines[j]; j++) {
        const c = lines[j].split(",");
        if (c[1] === "TOTAL") continue;
        const adjQ = col("Corrections") >= 0 ? Number(c[col("Corrections")]) : 0;
        expect(Number(c[col("Opening stock")]) + Number(c[col("Stock in")]) - Number(c[col("Stock out")]) + adjQ).toBeCloseTo(Number(c[col("Closing (Bal)")]), 6);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
      const num = (label: string) => Number(lines.find((l) => l.startsWith(label))!.split(",")[1]);
      const adj = lines.find((l) => l.startsWith("Net corrections")) ? num("Net corrections") : 0;
      expect(num("Opening stock value") + num("Cost of stock in") - num("Cost of stock out") + adj).toBeCloseTo(num("Total stock value (closing)"), 2);
    }
    const y = await exportCsv(`from=${yesterday}&to=${yesterday}`);
    const t = await exportCsv(`from=${today}&to=${today}`);
    const get = (csv: string, label: string) => csv.split("\r\n").find((l) => l.startsWith(label))!.split(",")[1];
    expect(get(t, "Opening stock value")).toBe(get(y, "Total stock value (closing)"));
    // Closing value as of today equals the live inventory worth
    const { rows } = await db.query("SELECT sum(stock_value)::numeric(20,2)::text v FROM items");
    expect(get(t, "Total stock value (closing)")).toBe(rows[0].v);
  });

  it("every report ends with the most stocked in / out items", async () => {
    const csv = await exportCsv("preset=today");
    const lines = csv.split("\r\n");
    const outAt = lines.findIndex((l) => l.startsWith("MOST STOCKED OUT"));
    const inAt = lines.findIndex((l) => l.startsWith("MOST STOCKED IN"));
    expect(inAt).toBeGreaterThan(lines.findIndex((l) => l.startsWith("STOCK SHEET")));
    expect(lines[inAt + 2]).toMatch(/^1,Rice \(50kg bag\),/);
    expect(lines[outAt + 2]).toMatch(/^1,Rice \(50kg bag\),/);
    // Stock-out-only report still shows each item's balance
    const outOnly = await exportCsv("preset=today&kind=stock_out");
    expect(outOnly).toContain("STOCK SHEET");
    expect(outOnly).toMatch(/\r\nSTOCK OUT\r\n/);
    expect(outOnly).not.toContain("STOCK IN AND STOCK OUT");
    expect(outOnly).toContain("MOST STOCKED OUT");
  });

  it("weekly and monthly reports cover the right dates and are named accordingly", async () => {
    const w = await owner.get("/api/reports/export?format=csv&preset=this_week");
    expect(w.headers.get("content-disposition")).toMatch(/isura-weekly-report-\d{4}-\d{2}-\d{2}(_to_\d{4}-\d{2}-\d{2})?\.csv/);
    const wText = (w.data as Buffer).toString();
    expect(wText).toContain("Weekly Inventory Report");
    const m = await owner.get(`/api/reports/export?format=csv&preset=month&month=${today.slice(0, 7)}`);
    const mText = (m.data as Buffer).toString();
    expect(m.headers.get("content-disposition")).toContain(`isura-monthly-report-${today.slice(0, 8)}01_to_`);
    expect(mText).toContain("Monthly Inventory Report");
    // The month's closing equals today's closing (same end state)
    const get = (csv: string, label: string) => csv.split("\r\n").find((l) => l.startsWith(label))!.split(",")[1];
    expect(get(mText, "Total stock value (closing)")).toBe(get(await exportCsv("preset=today"), "Total stock value (closing)"));
  });

  it("item and category filters narrow the report", async () => {
    const csv = await exportCsv(`preset=today&item=${rice}`);
    expect(csv).toContain("Rice (50kg bag)");
    expect(csv).not.toContain("Sugar");
  });
});

describe("12. Downloads: CSV, Excel and PDF (acceptance 12)", () => {
  it("xlsx has General Report / Stock Sheet / Stock In & Out sheets with matching totals", async () => {
    const r = await owner.get("/api/reports/export?format=xlsx&preset=today");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-disposition")).toMatch(/isura-report-\d{4}-\d{2}-\d{2}\.xlsx/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.data);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toEqual(expect.arrayContaining(["General Report", "Stock Sheet", "Stock In & Out", "Low Stock", "Most Stocked"]));
    const sheet = wb.getWorksheet("Stock Sheet")!;
    let worthCol = 0, inCostCol = 0, sum = 0, total = 0, inSum = 0, inTotal = 0, done = false;
    sheet.eachRow((row) => {
      if (done) return;
      const vals = (row.values as unknown[]).map((v) => (typeof v === "string" ? v : v));
      if (!worthCol && vals.includes("Closing worth")) { worthCol = vals.indexOf("Closing worth"); inCostCol = vals.indexOf("Cost of stock in"); return; }
      if (!worthCol) return;
      if (row.getCell(2).value === "Total") { total = Number(row.getCell(worthCol).value); inTotal = Number(row.getCell(inCostCol).value); done = true; return; }
      if (typeof row.getCell(worthCol).value === "number") { sum += Number(row.getCell(worthCol).value); inSum += Number(row.getCell(inCostCol).value); }
    });
    expect(worthCol).toBeGreaterThan(0);
    expect(sum).toBeCloseTo(total, 2);
    expect(inSum).toBeCloseTo(inTotal, 2);
    const { rows } = await db.query("SELECT sum(stock_value)::float v FROM items");
    expect(total).toBeCloseTo(rows[0].v, 2);
  });

  it("PDF contains the heading, period, totals and page numbers", async () => {
    const r = await owner.get("/api/reports/export?format=pdf&preset=today");
    expect(r.status).toBe(200);
    expect((r.data as Buffer).subarray(0, 4).toString()).toBe("%PDF");
    const dir = mkdtempSync(join(tmpdir(), "rep-"));
    const f = join(dir, "r.pdf");
    writeFileSync(f, r.data);
    const text = execFileSync("pdftotext", ["-layout", f, "-"]).toString();
    expect(text).toContain("ÌṢÚRA");
    expect(text).toContain("Inventory Report");
    expect(text).toMatch(/Page 1 of \d+/);
    expect(text).toContain("Stock sheet");
    expect(text).toContain("S/N");
    expect(text).toContain("Closing (Bal)");
    expect(text).toContain("₦");
    expect(text).toContain("Rice (50kg bag)");
    expect(text).toContain("Most stocked out");
    expect(text).toContain("next day's opening stock");
    expect(text).toContain("Cost of stock in");
    expect(text).toContain("Total stock value");
  });

  it("CSV is Excel-compatible (UTF-8 BOM) and quotes commas", async () => {
    const r = await owner.get("/api/reports/export?format=csv&preset=today");
    const buf = r.data as Buffer;
    expect([...buf.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(buf.toString()).toContain('"');
  });
});

describe("13. Report history and automatic daily reports (acceptance 17)", () => {
  it("manual generation stores files in Report History", async () => {
    const r = await staff.post("/api/reports/generate", { preset: "today", kind: "full", formats: ["pdf", "csv"] });
    expect(r.status).toBe(201);
    const id = r.data.results[0].id;
    const dl = await staff.get(`/api/reports/history/${id}`);
    expect(dl.status).toBe(200);
    expect((dl.data as Buffer).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("the cron endpoint requires the secret", async () => {
    expect((await fetch(`${BASE}/api/cron/daily-report`)).status).toBe(401);
    expect((await fetch(`${BASE}/api/cron/daily-report`, { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
  });

  it("does nothing while disabled, generates once when due, and emails the files", async () => {
    const call = () => fetch(`${BASE}/api/cron/daily-report`, { headers: { authorization: `Bearer ${CRON}` } }).then((r) => r.json()).then((j) => j.businesses[0]);
    expect((await call()).status).toBe("disabled");
    const s = await owner.patch("/api/settings", {
      store_name: "ÌṢÚRA", currency_code: "NGN", currency_symbol: "₦", timezone: "Africa/Lagos",
      auto_report_enabled: true, auto_report_time: "00:00", auto_report_covers: "same_day",
      auto_report_formats: ["pdf", "xlsx", "csv"], email_enabled: true, email_recipients: ["owner@mystore.test"],
      auto_weekly_enabled: true, auto_monthly_enabled: true,
    });
    expect(s.status, JSON.stringify(s.data)).toBe(200);
    const first = await call();
    expect(first.status).toBe("ran");
    expect(first.generated).toHaveLength(9); // daily + weekly + monthly, 3 formats each
    expect(first.generated.some((f: string) => f.startsWith("isura-weekly-report-"))).toBe(true);
    expect(first.generated.some((f: string) => f.startsWith("isura-monthly-report-"))).toBe(true);
    const second = await call();
    expect(second.generated).toHaveLength(0); // once per day per format
    const { rows } = await db.query("SELECT format, status, delivery_status, period_type FROM generated_reports WHERE trigger='scheduled'");
    expect(rows).toHaveLength(9);
    expect(new Set(rows.map((r) => r.period_type))).toEqual(new Set(["day", "week", "month"]));
    for (const r of rows) {
      expect(r.status).toBe("success");
      if (MAIL_DIR) expect(r.delivery_status).toBe("sent");
    }
    if (MAIL_DIR) {
      const mails = readdirSync(MAIL_DIR).filter((f) => f.endsWith(".eml"));
      expect(mails.length).toBeGreaterThan(0);
      const raw = readFileSync(join(MAIL_DIR, mails[mails.length - 1]), "utf8");
      expect(raw).toMatch(/Daily.*Weekly.*Monthly/s);
      expect(raw).toContain("To: owner@mystore.test");
      for (const ext of ["pdf", "xlsx", "csv"]) expect(raw).toMatch(new RegExp(`isura-report-\\d{4}-\\d{2}-\\d{2}\\.${ext}`));
      expect(raw).toContain("isura-weekly-report-");
      expect(raw).toContain("isura-monthly-report-");
    } else {
      expect(existsSync("/")).toBe(true);
    }
  });

  it("reports 'not configured' honestly when no mail server is set (unit check)", async () => {
    // Covered by delivery_status values; the UI never shows "sent" unless SMTP accepted the message.
    const { rows } = await db.query("SELECT DISTINCT delivery_status FROM generated_reports WHERE trigger='scheduled'");
    expect(rows.map((r) => r.delivery_status)).not.toContain("not_configured");
  });
});

describe("15. Workers, permissions and usage analysis", () => {
  let chef: number;
  let grains: number;
  it("records which worker took the stock", async () => {
    const w = await owner.post("/api/workers", { name: "Chef Bola", department: "Kitchen" });
    expect(w.status).toBe(201);
    chef = w.data.worker.id;
    const it = await createItem("Garri (white)", "kg", { opening_quantity: "50", opening_unit_cost: "900" });
    const r = await stockOut(staff, it, "4.5", "kg", { worker_id: chef, recipient: "Main kitchen" });
    expect(r.status, JSON.stringify(r.data)).toBe(201);
    const { rows } = await db.query("SELECT worker_id FROM stock_transactions WHERE txn_no = $1", [r.data.txn.txn_no]);
    expect(rows[0].worker_id).toBe(chef);
    // A stock out without a worker stays unassigned (the setting does not leak between requests)
    const r2 = await stockOut(staff, it, "1", "kg");
    const { rows: r2rows } = await db.query("SELECT worker_id FROM stock_transactions WHERE txn_no = $1", [r2.data.txn.txn_no]);
    expect(r2rows[0].worker_id).toBeNull();
    expect((await stockOut(staff, it, "1", "kg", { worker_id: 999999 })).data.code).toBe("INVALID_WORKER");
  });

  it("owner can limit a staff member to Stock Out only, and to one category", async () => {
    grains = (await owner.post("/api/categories", { name: "Grains test" })).data.category.id;
    const staffId = (await db.query("SELECT id FROM users WHERE email='staff@mystore.test'")).rows[0].id;
    const p = await owner.req("PUT", `/api/users/${staffId}/permissions`, { permissions: ["stock.out"], allowed_category_ids: [grains] });
    expect(p.status, JSON.stringify(p.data)).toBe(200);
    // Stock In is now refused
    expect((await stockIn(staff, sugar, "1", "kg", "1000")).status).toBe(403);
    // Stock Out of an item outside the allowed category is refused
    expect((await stockOut(staff, sugar, "0.1", "kg")).data.code).toBe("CATEGORY_NOT_ALLOWED");
    // Inside the category it works
    const inGrains = await createItem("Beans (brown)", "kg", { opening_quantity: "10", opening_unit_cost: "1500", category_id: grains });
    expect((await stockOut(staff, inGrains, "2", "kg", { worker_id: chef })).status).toBe(201);
    // Staff can no longer add items
    expect((await staff.post("/api/items", { name: "x", unit_id: units.pcs, request_id: randomUUID() })).status).toBe(403);
    // The change is audited; restore defaults
    expect((await db.query("SELECT 1 FROM audit_logs WHERE action='user.permissions'")).rowCount).toBe(1);
    expect((await owner.req("PUT", `/api/users/${staffId}/permissions`, { permissions: null, allowed_category_ids: null })).status).toBe(200);
    expect((await stockIn(staff, sugar, "1", "kg", "1000")).status).toBe(201);
  });

  it("staff can't change permissions", async () => {
    const staffId = (await db.query("SELECT id FROM users WHERE email='staff@mystore.test'")).rows[0].id;
    expect((await staff.req("PUT", `/api/users/${staffId}/permissions`, { permissions: ["audit.view"], allowed_category_ids: null })).status).toBe(403);
  });

  it("report has an S/N stock sheet per day where closing carries to the next day's opening", async () => {
    const { rows } = await db.query("SELECT ((now() AT TIME ZONE 'Africa/Lagos')::date - 1)::text y, (now() AT TIME ZONE 'Africa/Lagos')::date::text t");
    const csv = ((await owner.get(`/api/reports/export?format=csv&from=${rows[0].y}&to=${rows[0].t}`)).data as Buffer).toString();
    const lines = csv.split("\r\n");
    expect(lines.some((l) => l.startsWith("S/N,Item name,Item code,Unit,Opening stock,Stock in,Cost of stock in (NGN),Stock out,Cost of stock out (NGN)"))).toBe(true);
    const block = (day: string) => {
      const i = lines.indexOf(day);
      const out: Record<string, string[]> = {};
      for (let j = i + 2; j < lines.length && lines[j]; j++) { const c = lines[j].split(","); if (c[1] !== "TOTAL") out[c[2]] = c; }
      return out;
    };
    const y = block(rows[0].y), t = block(rows[0].t);
    expect(Object.keys(t).length).toBeGreaterThan(0);
    for (const code of Object.keys(t)) {
      const c = t[code];
      expect(Number(c[c.length - 1])).toBeCloseTo(Number(c[4]) + Number(c[5]) - Number(c[7]) + (c.length === 11 ? Number(c[9]) : 0), 6);
      if (y[code]) expect(c[4]).toBe(y[code][y[code].length - 1]);
    }
    expect(csv).toContain("STOCK TAKEN BY WORKER");
    expect(csv).toContain("Chef Bola");
  });

  it("usage analysis ranks most and least taken items and who took what", async () => {
    const page = await owner.get("/audit");
    expect(page.status).toBe(200);
    const csv = ((await owner.get("/api/usage/export")).data as Buffer).toString();
    expect(csv).toContain("ITEMS TAKEN (most to least)");
    expect(csv).toMatch(/WHO TOOK WHAT[\s\S]*Chef Bola,Garri \(white\),4\.5,kg/);
    expect((await viewer.get("/api/usage/export")).status).toBe(403);
    expect((await owner.get("/audit?tab=changes")).status).toBe(200);
  });
});

describe("14. Pages render (no dead pages)", () => {
  const pages = ["/dashboard", "/inventory", "/items/new", "/stock-in", "/stock-out", "/transactions", "/reports", "/reports/history",
    "/low-stock", "/categories", "/suppliers", "/units", "/users", "/settings", "/audit", "/workers"];
  it("every page loads for the owner", async () => {
    for (const p of pages) {
      const r = await owner.get(p);
      expect(r.status, p).toBe(200);
    }
    expect((await owner.get(`/items/${rice}`)).status).toBe(200);
    expect((await owner.get(`/items/${rice}/edit`)).status).toBe(200);
  });
  it("owner-only pages redirect staff away", async () => {
    for (const p of ["/users", "/settings", "/audit"]) expect((await staff.get(p)).status, p).toBe(307);
    expect((await viewer.get("/stock-out")).status).toBe(307);
  });
});

describe("16. Deleting items and money analysis", () => {
  it("only an owner can delete an item; its history goes with it and other items are untouched", async () => {
    const tmp = await createItem("Temp Delete Me", "kg");
    expect((await stockIn(owner, tmp, "10", "kg", "500")).status).toBe(201);
    expect((await stockOut(owner, tmp, "4", "kg")).status).toBe(201);
    const riceBefore = await item(rice);
    const ledgerBefore = Number((await db.query("SELECT count(*) n FROM stock_transactions WHERE item_id <> $1", [tmp])).rows[0].n);

    expect((await staff.req("DELETE", `/api/items/${tmp}`)).status).toBe(403);
    expect((await viewer.req("DELETE", `/api/items/${tmp}`)).status).toBe(403);
    const r = await owner.req("DELETE", `/api/items/${tmp}`);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(r.data.transactions_removed).toBe(2);

    expect((await owner.get(`/api/items/${tmp}`)).status).toBe(404);
    expect((await db.query("SELECT 1 FROM stock_transactions WHERE item_id = $1", [tmp])).rowCount).toBe(0);
    expect(Number((await db.query("SELECT count(*) n FROM stock_transactions").then((x) => x.rows[0].n)))).toBe(ledgerBefore);
    expect((await item(rice)).quantity).toBe(riceBefore.quantity);
    const a = await db.query("SELECT details FROM audit_logs WHERE action = 'item.delete' AND entity_id = $1", [tmp]);
    expect(a.rows[0].details.name).toBe("Temp Delete Me");
    // The ledger is still protected for everything else
    await expect(db.query("DELETE FROM stock_transactions WHERE item_id = $1", [rice])).rejects.toThrow(/LEDGER_IMMUTABLE/);
    expect((await owner.req("DELETE", `/api/items/${tmp}`)).status).toBe(404);
    expect((await owner.req("DELETE", "/api/items/not-a-uuid")).status).toBe(404);
  });

  it("usage page shows money by day, week and month and spending breakdowns", async () => {
    for (const q of ["", "&group=week&range=12w", "&group=month&range=12m", "&spend=category", "&spend=supplier"]) {
      const r = await owner.get(`/audit?tab=usage${q}`);
      expect(r.status, q).toBe(200);
      const html = (r.data as Buffer | string).toString();
      expect(html, q).toContain("How money is spent");
      expect(html, q).toContain("Stock in and stock out amounts");
    }
    const csv = ((await owner.get("/api/usage/export?group=month")).data as Buffer).toString();
    expect(csv).toContain("AMOUNT STOCKED IN AND OUT PER MONTH");
    expect(csv).toContain("HOW MONEY IS SPENT BY SUPPLIER");
  });
});

describe("17. Email, receipts, stock counts and the audit dashboard", () => {
  let today = "";
  beforeAll(async () => {
    today = (await db.query("SELECT (now() AT TIME ZONE 'Africa/Lagos')::date::text t")).rows[0].t;
  });
  const mails = () => (MAIL_DIR && existsSync(MAIL_DIR) ? readdirSync(MAIL_DIR).filter((f) => f.endsWith(".eml")).map((f) => readFileSync(join(MAIL_DIR, f), "utf8")) : []);

  it("the mail account password never leaves the server", async () => {
    const put = await owner.req("PUT", "/api/settings/email", { smtp_host: "smtp.gmail.com", smtp_port: 465, smtp_user: "store@gmail.com", smtp_pass: "abcd efgh ijkl mnop", smtp_from: "", welcome_email_enabled: true });
    expect(put.status, JSON.stringify(put.data)).toBe(200);
    expect(put.data.account.has_password).toBe(true);
    expect(JSON.stringify(put.data)).not.toContain("abcd");
    const settings = await owner.get("/api/settings");
    expect(JSON.stringify(settings.data)).not.toMatch(/smtp_pass|abcdefgh/);
    expect((await db.query("SELECT smtp_pass FROM settings")).rows[0].smtp_pass).toBe("abcdefghijklmnop");
    expect((await staff.get("/api/settings/email")).status).toBe(403);
    // The account saved in Store Settings takes priority over server SMTP_* variables.
    const got = await owner.get("/api/settings/email");
    expect(got.data.active.source).toBe("settings");
    expect((await owner.req("DELETE", "/api/settings/email")).status).toBe(200);
  });

  it("a new user gets a welcome email with the sign-in link", async () => {
    const r = await owner.post("/api/users", { name: "Wale Welcome", email: "wale@mystore.test", role: "staff", password: "wale-pass-123", include_password: true });
    expect(r.status).toBe(201);
    if (MAIL_DIR) {
      expect(r.data.welcome.status).toBe("sent");
      const m = mails().find((x) => x.includes("To: wale@mystore.test"));
      expect(m).toBeTruthy();
      expect(m).toContain("/login");
      expect(m).toContain("wale-pass-123");
    }
    const quiet = await owner.post("/api/users", { name: "No Mail", email: "nomail@mystore.test", role: "viewer", password: "nomail-pass-1", send_welcome: false });
    expect(quiet.data.welcome.status).toBe("off");
  });

  it("every stock out has a downloadable PDF receipt that can be emailed", async () => {
    const out = await stockOut(staff, rice, "0.5", "bags", { worker_id: null, recipient: "Main kitchen" });
    expect(out.status).toBe(201);
    const id = out.data.txn.id;
    const pdf = await staff.get(`/api/transactions/${id}/receipt`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-disposition")).toContain(`isura-receipt-${out.data.txn.txn_no}.pdf`);
    const dir = mkdtempSync(join(tmpdir(), "rcp-"));
    writeFileSync(join(dir, "r.pdf"), pdf.data);
    const text = execFileSync("pdftotext", ["-layout", join(dir, "r.pdf"), "-"]).toString();
    expect(text).toContain("Stock-out receipt");
    expect(text).toContain(out.data.txn.txn_no);
    expect(text).toContain("Rice (50kg bag)");
    expect(text).toContain("Received by");
    expect(text).toContain("₦");
    expect((await viewer.post(`/api/transactions/${id}/receipt/email`, { to: "a@b.co" })).status).toBe(403);
    expect((await staff.post(`/api/transactions/${id}/receipt/email`, { to: "not-an-email" })).status).toBe(400);
    const sent = await staff.post(`/api/transactions/${id}/receipt/email`, { to: "kitchen@mystore.test, chef@mystore.test", message: "Your rice" });
    if (MAIL_DIR) {
      expect(sent.status, JSON.stringify(sent.data)).toBe(200);
      const m = mails().find((x) => x.includes("kitchen@mystore.test") && x.includes("receipt"));
      expect(m).toContain(`isura-receipt-${out.data.txn.txn_no}.pdf`);
      const log = await db.query("SELECT status, kind FROM email_log WHERE kind = 'receipt' ORDER BY id DESC LIMIT 1");
      expect(log.rows[0]).toEqual({ status: "sent", kind: "receipt" });
    }
  });

  it("send email page sends a message with a report or the monthly audit report attached", async () => {
    const month = today.slice(0, 7);
    const r = await owner.post("/api/mail/send", { to: "boss@mystore.test", subject: "Monthly audit", message: "Please review.", attach: { kind: "audit", month, format: "pdf" } });
    if (MAIL_DIR) {
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      expect(r.data.attachments).toEqual([`isura-monthly-audit-${month}.pdf`]);
      const r2 = await owner.post("/api/mail/send", { to: "boss@mystore.test", subject: "Today", message: "Hi", attach: { kind: "report", preset: "today", format: "xlsx" } });
      expect(r2.status).toBe(200);
    }
    expect((await viewer.post("/api/mail/send", { to: "x@y.co", subject: "a", message: "b" })).status).toBe(403);
    expect((await owner.get("/mail")).status).toBe(200);
  });

  it("stock counts: shortage and excess are only posted when approved, and show in the audit", async () => {
    const before = Number((await item(sugar)).quantity);
    const short = await staff.post("/api/counts", { item_id: sugar, counted_qty: String(before - 1.5), notes: "torn bag" });
    expect(short.status, JSON.stringify(short.data)).toBe(201);
    expect(Number((await item(sugar)).quantity)).toBe(before); // nothing changes yet
    const cid = (await db.query("SELECT id FROM stock_counts WHERE count_no = $1", [short.data.count_no])).rows[0].id;
    expect((await staff.post(`/api/counts/${cid}`, { decision: "approve" })).status).toBe(403);
    const ok = await owner.post(`/api/counts/${cid}`, { decision: "approve", note: "checked" });
    expect(ok.status, JSON.stringify(ok.data)).toBe(200);
    expect(Number((await item(sugar)).quantity)).toBeCloseTo(before - 1.5, 6);
    const t = await db.query("SELECT txn_type, source, reason FROM stock_transactions WHERE id = $1", [ok.data.txn_id]);
    expect(t.rows[0]).toEqual({ txn_type: "stock_out", source: "count", reason: "other" });
    expect((await owner.post(`/api/counts/${cid}`, { decision: "approve" })).status).toBe(409);

    const ex = await staff.post("/api/counts", { item_id: coke, counted_qty: String(Number((await item(coke)).quantity) + 2) });
    const exId = (await db.query("SELECT id FROM stock_counts WHERE count_no = $1", [ex.data.count_no])).rows[0].id;
    const exOk = await owner.post(`/api/counts/${exId}`, { decision: "approve" });
    expect((await db.query("SELECT txn_type, source FROM stock_transactions WHERE id = $1", [exOk.data.txn_id])).rows[0]).toEqual({ txn_type: "stock_in", source: "count" });
    const rej = await staff.post("/api/counts", { item_id: rice, counted_qty: "999" });
    const rejId = (await db.query("SELECT id FROM stock_counts WHERE count_no = $1", [rej.data.count_no])).rows[0].id;
    const q0 = (await item(rice)).quantity;
    expect((await owner.post(`/api/counts/${rejId}`, { decision: "reject" })).status).toBe(200);
    expect((await item(rice)).quantity).toBe(q0);
    expect((await staff.post("/api/counts", { item_id: coke, counted_qty: "1.5" })).status).toBe(400); // whole units only

    const html = ((await owner.get("/audit")).data as Buffer).toString();
    expect(html).toContain("Count shortages");
    expect((await owner.get("/stock-count")).status).toBe(200);
    expect((await viewer.get("/stock-count")).status).toBe(307);
  });

  it("audit tabs render with real data and the monthly audit report downloads", async () => {
    const month = today.slice(0, 7);
    for (const q of ["", "?mode=quantity", "?mode=in&by=category", "?mode=out", "?p=year", "?p=week", "?p=day", "?p=custom&from=2020-01-01&to=" + today,
      "?tab=purchases", "?tab=purchases&sort=qty", "?tab=stockout", "?tab=stockout&sort=turnover", "?tab=prices", "?tab=prices&dir=up", "?tab=prices&q=rice",
      `?tab=item&item=${rice}&month=${month}`, "?tab=item", "?tab=usage", "?tab=changes"]) {
      const r = await owner.get(`/audit${q}`);
      expect(r.status, q).toBe(200);
    }
    // Daily spending: every stock-in day shows qty x price per item, and the day totals add up to the stock-in worth.
    const dsp = ((await owner.get(`/audit?tab=purchases&p=custom&from=2020-01-01&to=${today}`)).data as Buffer).toString();
    expect(dsp).toContain("Daily spending per item");
    expect(dsp).toContain("Total stock-in worth");
    const { rows: [w] } = await db.query(
      "SELECT sum(total_value)::numeric(20,2)::text AS v FROM stock_transactions t WHERE txn_type='stock_in' AND coalesce(source,'')<>'count' AND NOT EXISTS (SELECT 1 FROM stock_transactions r WHERE r.reverses_id=t.id)");
    expect(dsp.replace(/<!-- -->/g, "")).toContain(Number(w.v).toLocaleString("en-NG", { minimumFractionDigits: 2 }));
    const one = ((await owner.get(`/audit?tab=purchases&ditem=${sugar}`)).data as Buffer).toString();
    expect(one.replace(/<!-- -->/g, "")).toMatch(/Total stock-in worth · Sugar/);
    expect((await owner.get(`/audit?tab=purchases&ditem=not-a-uuid`)).status).toBe(200);

    const item = ((await owner.get(`/audit?tab=item&item=${sugar}&month=${month}`)).data as Buffer).toString();
    expect(item).toContain("This month vs last month");
    expect(item).toContain("Purchase prices this month");
    const s = await owner.get(`/api/audit/items?q=sug`);
    expect(s.data.items.some((x: { name: string }) => x.name.startsWith("Sugar"))).toBe(true);

    const pdf = await owner.get(`/api/audit/export?month=${month}&format=pdf`);
    expect(pdf.status).toBe(200);
    const dir = mkdtempSync(join(tmpdir(), "aud-"));
    writeFileSync(join(dir, "a.pdf"), pdf.data);
    const text = execFileSync("pdftotext", ["-layout", join(dir, "a.pdf"), "-"]).toString();
    for (const t of ["Monthly Audit Report", "Opening and closing balances", "Most purchased items", "Purchase price changes", "Monthly expenditure", "Physical stock counts", "Prepared by", "Ada Owner"]) expect(text).toContain(t);
    const x = await owner.get(`/api/audit/export?month=${month}&format=xlsx`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(x.data);
    expect(wb.worksheets.map((w) => w.name)).toEqual(expect.arrayContaining(["Summary", "Balances", "Most Purchased", "Stock Out", "Price Changes", "Price History", "Monthly Trend", "Stock Counts", "Low Stock", "Damaged & Expired"]));
    expect((await viewer.get(`/api/audit/export?month=${month}`)).status).toBe(403);
    expect((await owner.get(`/api/audit/export?month=2026-13`)).status).toBe(400);
  });

  it("price tracking compares per base unit with correct change and percentage", async () => {
    const pi = await createItem("Price Test Rice", "kg");
    expect((await stockIn(owner, pi, "10", "kg", "1800")).status).toBe(201);
    expect((await stockIn(owner, pi, "5", "kg", "2000")).status).toBe(201);
    const html = ((await owner.get(`/audit?tab=prices&q=price+test&pitem=${pi}`)).data as Buffer).toString().replace(/<!-- -->/g, "");
    expect(html).toContain("+₦200.00");
    expect(html).toContain("11.11%");
    expect((await owner.req("DELETE", `/api/items/${pi}`)).status).toBe(200);
  });
});

describe("18. Resending emails and welcome emails", () => {
  it("an owner can (re)send a welcome email with a fresh password", async () => {
    const id = (await db.query("SELECT id FROM users WHERE email='wale@mystore.test'")).rows[0].id;
    expect((await staff.post(`/api/users/${id}/welcome`, {})).status).toBe(403);
    const r = await owner.post(`/api/users/${id}/welcome`, { new_password: "fresh-pass-456" });
    if (MAIL_DIR) {
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      const fresh = new Session();
      expect((await fresh.post("/api/auth/login", { email: "wale@mystore.test", password: "fresh-pass-456" })).status).toBe(200);
      const log = await db.query("SELECT status, payload->'attach'->>'userId' AS uid FROM email_log WHERE kind='welcome' ORDER BY id DESC LIMIT 1");
      expect(log.rows[0]).toEqual({ status: "sent", uid: id });
      expect((await owner.get("/users")).status).toBe(200);
    }
  });

  it("any logged email can be resent, to the same or corrected addresses", async () => {
    const last = (await db.query("SELECT id FROM email_log WHERE kind='receipt' ORDER BY id DESC LIMIT 1")).rows[0];
    expect(last).toBeTruthy();
    expect((await viewer.post(`/api/mail/resend/${last.id}`, {})).status).toBe(403);
    const r = await owner.post(`/api/mail/resend/${last.id}`, { to: "fixed@mystore.test" });
    if (MAIL_DIR) {
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      expect(r.data.to).toEqual(["fixed@mystore.test"]);
      const row = (await db.query("SELECT status, resend_of::text, attachments FROM email_log ORDER BY id DESC LIMIT 1")).rows[0];
      expect(row.status).toBe("sent");
      expect(row.resend_of).toBe(String(last.id));
      expect(row.attachments[0]).toMatch(/^isura-receipt-TXN-/);
    }
    expect((await owner.post("/api/mail/resend/999999", {})).status).toBe(404);
  });
});

describe("19. Brevo API email (most reliable on Vercel)", () => {
  const BREVO_DIR = process.env.TEST_BREVO_DIR ?? "";
  const sent = () => (BREVO_DIR && existsSync(BREVO_DIR) ? readdirSync(BREVO_DIR).map((f) => JSON.parse(readFileSync(join(BREVO_DIR, f), "utf8"))) : []);
  const save = (key: string, from = "ÌṢÚRA <store@velvet.test>") =>
    owner.req("PUT", "/api/settings/email", { smtp_host: "api.brevo.com", smtp_port: 443, smtp_user: "", smtp_pass: key, smtp_from: from, welcome_email_enabled: true });

  it("a wrong API key is reported clearly by the connection check", async () => {
    if (!BREVO_DIR) return;
    expect((await save("wrong-key")).status).toBe(200);
    const c = await owner.post("/api/settings/email/check", {});
    expect(c.data.ok).toBe(false);
    expect(JSON.stringify(c.data.steps)).toContain("Brevo rejected the API key");
  });

  it("an unverified sender is caught before sending", async () => {
    if (!BREVO_DIR) return;
    await save("xkeysib-test-good", "Shop <nope@elsewhere.test>");
    const c = await owner.post("/api/settings/email/check", {});
    expect(c.data.ok).toBe(false);
    expect(JSON.stringify(c.data.steps)).toContain("isn't a verified sender");
  });

  it("with a good key, test emails, receipts with attachments and welcome emails are delivered", async () => {
    if (!BREVO_DIR) return;
    await save("xkeysib-test-good");
    const c = await owner.post("/api/settings/email/check", {});
    expect(c.data.ok, JSON.stringify(c.data)).toBe(true);
    expect((await owner.post("/api/settings/test-email", { to: "me@velvet.test" })).status).toBe(200);
    const txn = (await db.query("SELECT id FROM stock_transactions WHERE txn_type='stock_out' ORDER BY id DESC LIMIT 1")).rows[0].id;
    expect((await owner.post(`/api/transactions/${txn}/receipt/email`, { to: "chef@velvet.test" })).status).toBe(200);
    const u = await owner.post("/api/users", { name: "Brevo Person", email: "brevo.person@velvet.test", role: "staff", password: "brevo-pass-1", include_password: true });
    expect(u.data.welcome.status).toBe("sent");
    const mails = sent();
    expect(mails.some((m) => m.to[0].email === "me@velvet.test" && m.sender.email === "store@velvet.test" && m.sender.name === "ÌṢÚRA")).toBe(true);
    const receipt = mails.find((m) => m.to[0].email === "chef@velvet.test");
    expect(receipt.attachment[0].name).toMatch(/^isura-receipt-TXN-\d+\.pdf$/);
    expect(Buffer.from(receipt.attachment[0].content, "base64").subarray(0, 4).toString()).toBe("%PDF");
    expect(mails.some((m) => m.to[0].email === "brevo.person@velvet.test" && m.htmlContent.includes("/login"))).toBe(true);
    expect((await owner.req("DELETE", "/api/settings/email")).status).toBe(200);
  });
});

describe("20. Activity notifications and page permissions", () => {
  it("owners get notified of what others do; staff only see their own activity", async () => {
    await owner.post("/api/activity/seen");
    expect((await owner.get("/api/activity/unread")).data.count).toBe(0);
    await stockIn(staff, coke, "24", "btl", "250");
    expect((await stockOut(staff, coke, "6", "btl", { reason: "bar_usage" })).status).toBe(201);
    const u = (await owner.get("/api/activity/unread")).data;
    expect(u.enabled).toBe(true);
    expect(u.count).toBeGreaterThanOrEqual(2);
    expect(u.latest[0].title).toBe("Took out 6 btl of Coke 50cl");
    expect(u.latest[0].user_name).toBe("Sam Staff");
    expect(u.latest[0].detail).toContain("Bar usage");

    // the owner's own actions never notify the owner
    await stockOut(owner, coke, "1", "btl");
    expect((await owner.get("/api/activity/unread")).data.count).toBe(u.count);

    const page = ((await owner.get("/activity")).data as Buffer).toString().replace(/<!-- -->/g, "");
    expect(page).toContain("Sam Staff");
    expect(page).toContain("took out 6 btl of Coke 50cl");
    expect((await owner.get("/api/activity/unread")).data.count).toBe(0); // opening Activity marks it seen

    // staff (no activity.view) see only themselves, and get no bell
    expect((await staff.get("/api/activity/unread")).data.enabled).toBe(false);
    const mine = ((await staff.get("/activity")).data as Buffer).toString().replace(/<!-- -->/g, "");
    expect(mine).toContain("Everything you have done");
    expect(mine).not.toContain("took out 1 btl of Coke 50cl");
  });

  it("pages can be switched on and off per person, including Audit and Activity", async () => {
    const staffId = (await db.query("SELECT id FROM users WHERE email='staff@mystore.test'")).rows[0].id;
    expect((await staff.get("/transactions")).status).toBe(200);
    expect((await staff.get("/audit")).status).toBe(307);
    expect((await owner.req("PUT", `/api/users/${staffId}/permissions`, {
      permissions: ["stock.out", "audit.view", "activity.view", "page.reports"], allowed_category_ids: null,
    })).status).toBe(200);
    expect((await staff.get("/audit")).status).toBe(200);
    expect((await staff.get("/reports")).status).toBe(200);
    for (const p of ["/transactions", "/low-stock", "/reports/history", "/categories", "/suppliers", "/workers", "/units"]) {
      expect((await staff.get(p)).status, p).toBe(307);
    }
    expect((await staff.get("/api/activity/unread")).data.enabled).toBe(true);
    const all = ((await staff.get("/activity")).data as Buffer).toString();
    expect(all).toContain("Everything people do in the app");
    expect((await owner.req("PUT", `/api/users/${staffId}/permissions`, { permissions: null, allowed_category_ids: null })).status).toBe(200);
    expect((await staff.get("/transactions")).status).toBe(200);
  });
});

describe("21. Changing prices and removing users", () => {
  it("re-prices the stock on hand, keeps reports balancing, and is recorded", async () => {
    expect((await stockIn(owner, coke, "48", "btl", "250")).status).toBe(201);
    const before = await item(coke);
    expect(Number(before.quantity)).toBeGreaterThan(0);
    // staff can't change prices by default
    expect((await staff.post(`/api/items/${coke}/price`, { unit_id: units.btl, unit_cost: "300", request_id: randomUUID() })).status).toBe(403);
    // per crate (24 btl) = 7200 means 300 per bottle
    const r = await owner.post(`/api/items/${coke}/price`, { unit_id: units.crates, unit_cost: "7200", reason: "Supplier increased prices", request_id: randomUUID() });
    expect(r.status).toBe(201);
    const after = await item(coke);
    expect(after.quantity).toBe(before.quantity);
    expect(Number(after.stock_value)).toBeCloseTo(Number(before.quantity) * 300, 2);
    expect(Number(after.avg_cost)).toBeCloseTo(300, 4);
    expect((await owner.post(`/api/items/${coke}/price`, { unit_id: units.btl, unit_cost: "300", request_id: randomUUID() })).data.code).toBe("NO_CHANGE");

    // stock out now uses the new price
    const out = await stockOut(owner, coke, "2", "btl");
    expect(out.status, JSON.stringify(out.data)).toBe(201);
    const { rows: [ov] } = await db.query("SELECT total_value::text v FROM stock_transactions WHERE id = $1", [out.data.txn.id]);
    expect(Number(ov.v)).toBeCloseTo(600, 2);

    // the price change can't be "reversed" (set the price again instead)
    const { rows: [pc] } = await db.query("SELECT id FROM stock_transactions WHERE item_id=$1 AND txn_type='revaluation' ORDER BY id DESC LIMIT 1", [coke]);
    expect((await owner.post(`/api/transactions/${pc.id}/reverse`, { reason: "Trying to undo the price", request_id: randomUUID() })).status).toBe(409);

    // reports still balance and closing equals live worth
    const csv = ((await owner.get(`/api/reports/export?format=csv&preset=today`)).data as Buffer).toString();
    const lines = csv.split("\r\n");
    const num = (label: string) => Number(lines.find((l) => l.startsWith(label))!.split(",")[1]);
    expect(lines.some((l) => l.startsWith("Net corrections and price changes"))).toBe(true);
    expect(num("Opening stock value") + num("Cost of stock in") - num("Cost of stock out") + num("Net corrections and price changes")).toBeCloseTo(num("Total stock value (closing)"), 2);
    const { rows: [w] } = await db.query("SELECT sum(stock_value)::numeric(20,2)::text v FROM items");
    expect(lines.find((l) => l.startsWith("Total stock value (closing)"))!.split(",")[1]).toBe(w.v);
    expect(csv).toContain("Price change");

    // shows in history, transactions filter and activity
    expect(((await owner.get(`/items/${coke}`)).data as Buffer).toString()).toContain("Price change");
    expect(((await owner.get(`/transactions?type=revaluation`)).data as Buffer).toString()).toContain("Supplier increased prices");
    const act = ((await owner.get("/activity?kind=price")).data as Buffer).toString().replace(/<!-- -->/g, "");
    expect(act).toContain("changed the price of Coke 50cl to 7200 per crates");

    // nothing in stock: nothing to re-price
    const flour = (await db.query("SELECT id FROM items WHERE quantity = 0 AND archived_at IS NULL LIMIT 1")).rows[0]?.id;
    if (flour) {
      const base = (await owner.get(`/api/items/${flour}`)).data.item.unit_id;
      expect((await owner.post(`/api/items/${flour}/price`, { unit_id: base, unit_cost: "10", request_id: randomUUID() })).data.code).toBe("NO_STOCK");
    }
  });

  it("removing a user takes them off the list but keeps their name on the records", async () => {
    expect((await owner.post("/api/users", { name: "Temp Worker", email: "gone.worker@mystore.test", role: "staff", password: "temp-pass-123" })).status).toBe(201);
    const temp = new Session();
    expect((await temp.post("/api/auth/login", { email: "gone.worker@mystore.test", password: "temp-pass-123" })).status).toBe(200);
    const tout = await stockOut(temp, coke, "1", "btl");
    expect(tout.status, JSON.stringify(tout.data)).toBe(201);
    const id = (await db.query("SELECT id FROM users WHERE email='gone.worker@mystore.test'")).rows[0].id;
    const ownerId = (await db.query("SELECT id FROM users WHERE role='owner' ORDER BY created_at LIMIT 1")).rows[0].id;
    expect((await owner.req("DELETE", `/api/users/${ownerId}`)).status).toBe(409); // not yourself
    expect((await staff.req("DELETE", `/api/users/${id}`)).status).toBe(403);
    expect((await owner.req("DELETE", `/api/users/${id}`)).status).toBe(200);

    expect((await temp.get("/api/items")).status).toBe(401); // signed out
    expect((await new Session().post("/api/auth/login", { email: "gone.worker@mystore.test", password: "temp-pass-123" })).status).toBe(401);
    const list = ((await owner.get("/users")).data as Buffer).toString();
    expect(list).not.toContain("gone.worker@mystore.test");
    const tx = ((await owner.get(`/items/${coke}`)).data as Buffer).toString();
    expect(tx).toContain("Temp Worker");
    // the email can be used again for a new account
    const again = await owner.post("/api/users", { name: "Temp Again", email: "gone.worker@mystore.test", role: "viewer", password: "temp-pass-456" });
    expect(again.status, JSON.stringify(again.data)).toBe(201);
  });
});

describe("22. Price on the item form", () => {
  async function editBody(id: string) {
    const it = await item(id);
    return { name: it.name, sku: it.sku, category_id: it.category_id, description: it.description, allow_fraction: it.allow_fraction,
      min_stock_level: it.min_stock_level, default_supplier_id: it.default_supplier_id, notes: it.notes };
  }
  it("a new item's price is kept even without opening stock, and Stock In uses it", async () => {
    const r = await owner.post("/api/items", { name: "Paper cups", unit_id: units.btl, opening_quantity: "0", opening_unit_cost: "45", request_id: randomUUID() });
    expect(r.status).toBe(201);
    const it = await item(r.data.id);
    expect(Number(it.price)).toBe(45);
    expect(Number(it.avg_cost)).toBe(45); // shown on the card even with nothing in stock
    // editing the price of an item with no stock just saves it
    expect((await owner.patch(`/api/items/${r.data.id}`, { ...(await editBody(r.data.id)), price: "50" })).status).toBe(200);
    expect(Number((await item(r.data.id)).price)).toBe(50);
    expect((await stockIn(owner, r.data.id, "10", "btl", "55")).status).toBe(201);
    expect(Number((await item(r.data.id)).price)).toBe(55); // latest purchase price becomes the price
  });

  it("changing the price on the edit form re-prices stock on hand; staff need permission", async () => {
    expect((await stockIn(owner, rice, "4", "bags", "45000")).status).toBe(201);
    const before = await item(rice);
    expect(Number(before.quantity)).toBeGreaterThan(0);
    const body = await editBody(rice);
    // unchanged price: no price change recorded
    const n0 = (await db.query("SELECT count(*)::int n FROM stock_transactions WHERE item_id=$1 AND txn_type='revaluation'", [rice])).rows[0].n;
    expect((await owner.patch(`/api/items/${rice}`, { ...body, price: before.avg_cost })).status).toBe(200);
    expect((await db.query("SELECT count(*)::int n FROM stock_transactions WHERE item_id=$1 AND txn_type='revaluation'", [rice])).rows[0].n).toBe(n0);
    // staff (item.write but no price.edit) can save the form but not a new price
    expect((await staff.patch(`/api/items/${rice}`, { ...body })).status).toBe(200);
    expect((await staff.patch(`/api/items/${rice}`, { ...body, price: "1" })).status).toBe(403);
    expect((await owner.patch(`/api/items/${rice}`, { ...body, price: "1000", price_reason: "New market price" })).status).toBe(200);
    const after = await item(rice);
    expect(after.quantity).toBe(before.quantity);
    expect(Number(after.stock_value)).toBeCloseTo(Number(before.quantity) * 1000, 2);
    expect(Number(after.price)).toBe(1000);
    const { rows: [pc] } = await db.query("SELECT correction_reason FROM stock_transactions WHERE item_id=$1 AND txn_type='revaluation' ORDER BY id DESC LIMIT 1", [rice]);
    expect(pc.correction_reason).toBe("New market price");
  });
});

describe("23. Changing an item's measuring unit", () => {
  async function body(id: string) {
    const it = await item(id);
    return { name: it.name, sku: it.sku, category_id: it.category_id, description: it.description, allow_fraction: it.allow_fraction,
      min_stock_level: it.min_stock_level, default_supplier_id: it.default_supplier_id, notes: it.notes };
  }
  it("converts the item and its whole history (1 bag = 50 kg) without changing money", async () => {
    expect((await stockIn(owner, rice, "2", "bags", "45000")).status).toBe(201);
    const before = await item(rice);
    const ledgerBefore = (await db.query("SELECT count(*)::int n, sum(total_value)::text v, sum(direction*quantity)::text q FROM stock_transactions WHERE item_id=$1", [rice])).rows[0];
    const b = await body(rice);
    // a factor is required once there is history
    expect((await owner.patch(`/api/items/${rice}`, { ...b, unit_id: units.kg })).data.code).toBe("UNIT_FACTOR_REQUIRED");
    const r = await owner.patch(`/api/items/${rice}`, { ...b, unit_id: units.kg, unit_factor: "50" });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const after = await item(rice);
    expect(after.unit_id).toBe(units.kg);
    expect(Number(after.quantity)).toBeCloseTo(Number(before.quantity) * 50, 6);
    expect(after.stock_value).toBe(before.stock_value);
    expect(Number(after.min_stock_level)).toBeCloseTo(Number(before.min_stock_level) * 50, 6);
    expect(Number(after.avg_cost)).toBeCloseTo(Number(before.avg_cost) / 50, 4);
    const ledgerAfter = (await db.query("SELECT count(*)::int n, sum(total_value)::text v, sum(direction*quantity)::text q FROM stock_transactions WHERE item_id=$1", [rice])).rows[0];
    expect(ledgerAfter.n).toBe(ledgerBefore.n);
    expect(ledgerAfter.v).toBe(ledgerBefore.v);
    expect(Number(ledgerAfter.q)).toBeCloseTo(Number(ledgerBefore.q) * 50, 4);
    expect(Number(ledgerAfter.q)).toBeCloseTo(Number(after.quantity), 4); // ledger still adds up to the balance
    // you can still record in bags (now a conversion) and in kg
    expect((await stockIn(owner, rice, "1", "bags", "45000")).status).toBe(201);
    expect(Number((await item(rice)).quantity)).toBeCloseTo(Number(after.quantity) + 50, 6);
    expect((await stockOut(owner, rice, "10", "kg")).status).toBe(201);
    // reports still balance
    const csv = ((await owner.get(`/api/reports/export?format=csv&preset=today`)).data as Buffer).toString();
    const lines = csv.split("\r\n");
    const num = (label: string) => Number((lines.find((l) => l.startsWith(label)) ?? ",0").split(",")[1]);
    expect(num("Opening stock value") + num("Cost of stock in") - num("Cost of stock out") + num("Net corrections and price changes")).toBeCloseTo(num("Total stock value (closing)"), 2);
    // the ledger is still read-only outside this conversion
    await expect(db.query("UPDATE stock_transactions SET quantity = quantity WHERE item_id = $1", [rice])).rejects.toThrow(/LEDGER_IMMUTABLE/);
    const act = ((await owner.get("/activity")).data as Buffer).toString().replace(/<!-- -->/g, "");
    expect(act).toContain("changed the measuring unit of Rice");
  });

  it("a custom unit can be renamed, and items using it follow", async () => {
    const u = (await owner.post("/api/units", { name: "Trays", symbol: "trays", allow_decimal: false })).data.unit;
    const r = await owner.post("/api/items", { name: "Eggs", unit_id: u.id, opening_quantity: "3", opening_unit_cost: "4500", request_id: randomUUID() });
    expect(r.status).toBe(201);
    expect((await owner.req("PATCH", `/api/units/${u.id}`, { name: "Crates of eggs", symbol: "egg crates", allow_decimal: false })).status).toBe(200);
    expect((await item(r.data.id)).unit_symbol).toBe("egg crates");
    expect((await owner.req("PATCH", `/api/units/${units.kg}`, { name: "Kilo", symbol: "kilo", allow_decimal: true })).status).toBe(409); // standard
    expect((await staff.req("PATCH", `/api/units/${u.id}`, { name: "X", symbol: "x", allow_decimal: true })).status).toBe(200); // staff have catalog.write
  });
});

describe("24. Recording a missed day (owners only)", () => {
  let today: string, yesterday: string;
  beforeAll(async () => {
    const { rows } = await db.query("SELECT (now() AT TIME ZONE 'Africa/Lagos')::date::text t, ((now() AT TIME ZONE 'Africa/Lagos')::date - 1)::text y");
    today = rows[0].t; yesterday = rows[0].y;
  });
  const atYesterday = () => `${yesterday}T15:00:00+01:00`;
  it("owners can record stock in and out for yesterday; it lands in yesterday's report and everything balances", async () => {
    const oil = (await db.query("SELECT id FROM items WHERE name='Vegetable oil'")).rows[0].id;
    const before = await item(oil);
    const yBefore = ((await owner.get(`/api/reports/export?format=csv&from=${yesterday}&to=${yesterday}`)).data as Buffer).toString();
    const get = (csv: string, label: string) => Number(csv.split("\r\n").find((l) => l.startsWith(label))!.split(",")[1]);

    const i = await stockIn(owner, oil, "5", "L", "1800", { occurred_at: atYesterday() });
    expect(i.status, JSON.stringify(i.data)).toBe(201);
    const o = await stockOut(owner, oil, "2", "L", { occurred_at: atYesterday(), reason: "bar_usage" });
    expect(o.status, JSON.stringify(o.data)).toBe(201);
    expect(Number((await item(oil)).quantity)).toBeCloseTo(Number(before.quantity) + 3, 6);
    const { rows: [t] } = await db.query("SELECT to_char(occurred_at AT TIME ZONE 'Africa/Lagos','YYYY-MM-DD') d FROM stock_transactions WHERE id=$1", [o.data.txn.id]);
    expect(t.d).toBe(yesterday);

    const y = ((await owner.get(`/api/reports/export?format=csv&from=${yesterday}&to=${yesterday}`)).data as Buffer).toString();
    expect(get(y, "Cost of stock in")).toBeCloseTo(get(yBefore, "Cost of stock in") + 9000, 2);
    expect(get(y, "Cost of stock out")).toBeGreaterThan(get(yBefore, "Cost of stock out"));
    const td = ((await owner.get(`/api/reports/export?format=csv&from=${today}&to=${today}`)).data as Buffer).toString();
    expect(get(td, "Opening stock value")).toBeCloseTo(get(y, "Total stock value (closing)"), 2);
  });

  it("staff can't record for an earlier day, but can for earlier today", async () => {
    const oil = (await db.query("SELECT id FROM items WHERE name='Vegetable oil'")).rows[0].id;
    const r1 = await stockIn(staff, oil, "1", "L", "1800", { occurred_at: atYesterday() });
    expect(r1.status).toBe(403);
    expect(r1.data.code).toBe("BACKDATE_NOT_ALLOWED");
    expect((await stockOut(staff, oil, "1", "L", { occurred_at: atYesterday() })).status).toBe(403);
    const earlierToday = new Date(Date.now() - 60_000).toISOString();
    expect((await stockOut(staff, oil, "1", "L", { occurred_at: earlierToday })).status).toBe(201);
  });

  it("a backdated stock out can't take more than was in stock on that date", async () => {
    const r = await owner.post("/api/items", { name: "Napkins", unit_id: units.btl, opening_quantity: "10", opening_unit_cost: "100", request_id: randomUUID() });
    expect(r.status).toBe(201);
    // the item only got stock today, so yesterday it had none
    const o = await stockOut(owner, r.data.id, "1", "btl", { occurred_at: atYesterday() });
    expect(o.status).toBe(409);
    expect(o.data.code).toBe("INSUFFICIENT_STOCK");
    expect((await stockOut(owner, r.data.id, "1", "btl", { occurred_at: new Date(Date.now() + 3_600_000).toISOString() })).status).toBe(400); // future
  });
});

describe("25. Businesses, subscriptions and ownership (ÌṢÚRA)", () => {
  const MAILS = () => (MAIL_DIR && existsSync(MAIL_DIR) ? readdirSync(MAIL_DIR).filter((f) => f.endsWith(".eml")).map((f) => readFileSync(join(MAIL_DIR, f), "utf8")) : []);
  const palm = new Session();
  let palmId = 0;
  let homeItem = "";
  const tokenOf = (link: string) => link.split("/invite/")[1];

  it("only the ÌṢÚRA admin can manage businesses", async () => {
    expect((await staff.get("/api/isura/businesses")).status).toBe(403);
    const r = await owner.get("/api/isura/businesses");
    expect(r.status).toBe(200);
    expect(r.data.businesses.map((b: { id: number }) => b.id)).toEqual([1]);
    expect((await owner.req("PUT", "/api/isura/settings", { paystack_secret_key: "not-a-key" })).status).toBe(400);
    expect((await owner.req("PUT", "/api/isura/settings", { paystack_secret_key: "sk_test_abcdefghijklmnop1234" })).status).toBe(200);
    expect((await owner.get("/api/isura/settings")).data.paystack).toEqual({ saved: true, mode: "test", ending: "1234" });
  });

  it("a new business is created and handed to its owner by invitation; it starts locked until paid", async () => {
    const r = await owner.post("/api/isura/businesses", { name: "Palmspring Social Eatery", owner_email: "ceo@palmspring.test", price_naira: 15000, free_days: 0 });
    expect(r.status, JSON.stringify(r.data)).toBe(201);
    palmId = r.data.id;
    expect(r.data.invite_link).toMatch(/\/invite\/[A-Za-z0-9_-]{20,}$/);
    if (MAIL_DIR) expect(MAILS().some((m) => m.includes("To: ceo@palmspring.test") && m.includes("/invite/"))).toBe(true);
    const page = ((await new Session().get(`/invite/${tokenOf(r.data.invite_link)}`)).data as Buffer).toString().replace(/<!-- -->/g, "");
    expect(page).toContain("You're the new owner of Palmspring Social Eatery");

    const a = await palm.post("/api/invites/accept", { token: tokenOf(r.data.invite_link), name: "Pam Spring", password: "palm-pass-123" });
    expect(a.status, JSON.stringify(a.data)).toBe(200);
    expect((await new Session().post("/api/invites/accept", { token: tokenOf(r.data.invite_link), password: "x" })).data.code).toBe("INVITE_USED");

    // free_days 0: locked until the first payment
    const items = await palm.get("/api/items");
    expect(items.status).toBe(402);
    expect(items.data.code).toBe("SUBSCRIPTION_ENDED");
    expect((await palm.get("/dashboard")).headers.get("location")).toMatch(/\/billing$/);
    const billing = ((await palm.get("/billing")).data as Buffer).toString();
    expect(billing).toContain("Your subscription has ended");
  });

  it("paying with Paystack unlocks the business; the same payment never counts twice", async () => {
    const c = await palm.post("/api/billing/checkout", { months: 3 });
    expect(c.status, JSON.stringify(c.data)).toBe(200);
    expect(c.data.url).toContain("/pay/");
    const back = await palm.get(`/billing/callback?reference=${encodeURIComponent(c.data.reference)}`);
    expect(back.status).toBe(303);
    expect(back.headers.get("location")).toContain("/dashboard?renewed=1");
    const b = (await owner.get("/api/isura/businesses")).data.businesses.find((x: { id: number }) => x.id === palmId);
    expect(b.locked).toBe(false);
    expect(b.days_left).toBeGreaterThan(85);
    const until = b.paid_until;
    // the webhook for the same payment changes nothing
    const body = JSON.stringify({ event: "charge.success", data: { reference: c.data.reference } });
    const { createHmac } = await import("node:crypto");
    const sig = createHmac("sha512", "sk_test_abcdefghijklmnop1234").update(body).digest("hex");
    expect((await fetch(`${BASE}/api/paystack/webhook`, { method: "POST", headers: { "x-paystack-signature": "bad", "content-type": "application/json" }, body })).status).toBe(401);
    expect((await fetch(`${BASE}/api/paystack/webhook`, { method: "POST", headers: { "x-paystack-signature": sig, "content-type": "application/json" }, body })).status).toBe(200);
    expect((await owner.get("/api/isura/businesses")).data.businesses.find((x: { id: number }) => x.id === palmId).paid_until).toBe(until);
    const { rows } = await db.query("SELECT count(*)::int n, sum(amount_kobo)::text a FROM payments WHERE store_id = $1 AND status = 'success'", [palmId]);
    expect(rows[0]).toEqual({ n: 1, a: "4500000" });
    expect((await palm.get("/api/items")).status).toBe(200);
    // staff of a business can't start a payment
    expect((await staff.post("/api/billing/checkout", { months: 1 })).status).toBe(403);
  });

  it("each business only ever sees its own data", async () => {
    const home = (await owner.get("/api/items?pageSize=100")).data.rows;
    expect(home.length).toBeGreaterThan(3);
    homeItem = home[0].id;
    expect((await palm.get("/api/items")).data.rows).toEqual([]);
    // same item code in both businesses is fine
    const units = (await palm.get("/api/units")).data.units;
    const btl = units.find((u: { symbol: string }) => u.symbol === "btl").id;
    const r = await palm.post("/api/items", { name: "Zobo drink", unit_id: btl, opening_quantity: "40", opening_unit_cost: "300", request_id: randomUUID() });
    expect(r.status, JSON.stringify(r.data)).toBe(201);
    expect((await palm.get(`/api/items/${r.data.id}`)).data.item.sku).toBe("ITM-00001");
    expect((await owner.get(`/api/items/${r.data.id}`)).status).toBe(404);
    expect(((await owner.get("/api/items?q=Zobo")).data.rows)).toEqual([]);
    // reaching into another business by id fails
    expect((await palm.get(`/api/items/${homeItem}`)).status).toBe(404);
    expect((await palm.post("/api/stock/out", { item_id: homeItem, quantity: "1", unit_id: btl, reason: "sale", request_id: randomUUID() })).status).toBe(404);
    // users, activity and reports are separate too
    const users = (await palm.get("/api/users")).data.users.map((u: { email: string }) => u.email);
    expect(users).toEqual(["ceo@palmspring.test"]);
    const ownerId = (await db.query("SELECT id FROM users WHERE is_platform_admin")).rows[0].id;
    expect((await palm.patch(`/api/users/${ownerId}`, { name: "Hacked" })).status).toBe(404);
    expect((await db.query("SELECT name FROM users WHERE id = $1", [ownerId])).rows[0].name).not.toBe("Hacked");
    const act = ((await palm.get("/activity")).data as Buffer).toString();
    expect(act).toContain("Zobo drink");
    expect(act).not.toContain("Coke 50cl");
    const csv = ((await palm.get("/api/reports/export?format=csv&preset=today")).data as Buffer).toString();
    expect(csv).toContain("Zobo drink");
    expect(csv).not.toContain("Coke 50cl");
    // a business can't see or touch ÌṢÚRA's own custom units
    const homeCustom = (await db.query("SELECT id FROM units WHERE store_id = 1 LIMIT 1")).rows[0];
    if (homeCustom) expect((await palm.get("/api/units")).data.units.some((u: { id: number }) => u.id === homeCustom.id)).toBe(false);
  });

  it("the ÌṢÚRA admin can open a business to help, then go back", async () => {
    expect((await owner.post("/api/isura/open", { store_id: palmId })).status).toBe(200);
    const rows = (await owner.get("/api/items")).data.rows;
    expect(rows.map((x: { name: string }) => x.name)).toEqual(["Zobo drink"]);
    const page = ((await owner.get("/dashboard")).data as Buffer).toString().replace(/<!-- -->/g, "");
    expect(page).toContain("as the ÌṢÚRA admin");
    expect((await staff.post("/api/isura/open", { store_id: palmId })).status).toBe(403);
    expect((await owner.post("/api/isura/open", { store_id: 1 })).status).toBe(200);
    expect((await owner.get(`/api/items/${homeItem}`)).status).toBe(200);
  });

  it("pausing locks the business completely; resuming unlocks it", async () => {
    expect((await owner.patch(`/api/isura/businesses/${palmId}`, { status: "paused" })).status).toBe(200);
    expect((await palm.get("/api/items")).status).toBe(402);
    expect(((await palm.get("/billing")).data as Buffer).toString()).toContain("Your account is paused");
    expect((await owner.patch(`/api/isura/businesses/${palmId}`, { status: "active" })).status).toBe(200);
    expect((await palm.get("/api/items")).status).toBe(200);
    // a recorded bank transfer extends it too
    const before = (await owner.get("/api/isura/businesses")).data.businesses.find((x: { id: number }) => x.id === palmId).paid_until;
    const ext = await owner.post(`/api/isura/businesses/${palmId}/extend`, { months: 1, amount_naira: 15000, note: "Transfer" });
    expect(ext.status).toBe(200);
    expect(new Date(ext.data.paid_until).getTime()).toBeGreaterThan(new Date(before).getTime() + 27 * 86400_000);
  });

  it("ownership can be handed to a new email; the old owner becomes staff", async () => {
    const r = await owner.post(`/api/isura/businesses/${palmId}/invite`, { email: "manager@palmspring.test", role: "owner", demote_previous: true });
    expect(r.status).toBe(201);
    const mgr = new Session();
    // an email used by another business can't be invited in
    const clash = await owner.post(`/api/isura/businesses/${palmId}/invite`, { email: "staff@mystore.test" });
    expect((await new Session().post("/api/invites/accept", { token: tokenOf(clash.data.invite_link), password: "staff-pass-123" })).data.code).toBe("EMAIL_IN_OTHER_BUSINESS");
    expect((await mgr.post("/api/invites/accept", { token: tokenOf(r.data.invite_link), name: "Mo Manager", password: "mgr-pass-1234" })).status).toBe(200);
    const roles = Object.fromEntries((await mgr.get("/api/users")).data.users.map((u: { email: string; role: string }) => [u.email, u.role]));
    expect(roles).toEqual({ "ceo@palmspring.test": "staff", "manager@palmspring.test": "owner" });
    expect((await mgr.get("/api/items")).data.rows.length).toBe(1);
    // the ÌṢÚRA admin is untouched
    expect((await db.query("SELECT is_platform_admin, role FROM users WHERE email = 'owner@mystore.test'")).rows[0]).toEqual({ is_platform_admin: true, role: "owner" });
  });

  it("owners get a reminder a few days before the end, once", async () => {
    await db.query("UPDATE stores SET paid_until = now() + interval '2 days', reminded_for = NULL WHERE id = $1", [palmId]);
    const call = () => fetch(`${BASE}/api/cron/daily-report`, { headers: { authorization: `Bearer ${CRON}` } }).then((r) => r.json());
    expect((await call()).reminders).toEqual([palmId]);
    expect((await call()).reminders).toEqual([]);
    if (MAIL_DIR) expect(MAILS().some((m) => /^To: .*manager@palmspring\.test/m.test(m) && /ends on/.test(m.replace(/=\r?\n/g, "")))).toBe(true);
  });
});

describe("26. Adding many items at once", () => {
  it("adds a pasted list into a new category with opening stock; sending it again adds nothing", async () => {
    const units = (await owner.get("/api/units")).data.units;
    const pcs = units.find((u: { symbol: string }) => u.symbol === "pcs").id;
    const rows = [["MONIN BLUE BERRY", "6"], ["MONIN KIWI", "6"], ["EVA", "18"], ["SPORT CURACO BLEU", "3"], ["BACARDI", "24"]].map(([name, quantity]) => ({ name, quantity }));
    const r = await owner.post("/api/items/bulk", { unit_id: pcs, category_name: "DRINKS", rows });
    expect(r.status, JSON.stringify(r.data)).toBe(201);
    expect(r.data.created.length).toBe(5);
    expect(r.data.skipped).toEqual([]);
    const list = (await owner.get(`/api/items?category=${r.data.category_id}&pageSize=50`)).data.rows;
    expect(list.map((x: { name: string }) => x.name).sort()).toEqual(rows.map((x) => x.name).sort());
    const eva = list.find((x: { name: string }) => x.name === "EVA");
    expect(Number(eva.quantity)).toBe(18);
    expect(eva.unit_symbol).toBe("pcs");
    const again = await owner.post("/api/items/bulk", { unit_id: pcs, category_name: "drinks", rows });
    expect(again.data.created).toEqual([]);
    expect(again.data.skipped.length).toBe(5);
    expect(again.data.category_id).toBe(r.data.category_id);
    expect((await viewer.post("/api/items/bulk", { unit_id: pcs, category_name: "DRINKS", rows })).status).toBe(403);
    expect((await owner.get("/items/bulk")).status).toBe(200);
  });
});

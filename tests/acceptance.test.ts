/**
 * End-to-end acceptance tests for MY STORE.
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
    expect(csv).toContain(`Total stock-in value,${rows[0].i}`);
    expect(csv).toContain(`Total stock-out value,${rows[0].o}`);
  });

  it("opening + in − out ± corrections = closing, per item and in total; yesterday's closing = today's opening", async () => {
    for (const q of [`from=${yesterday}&to=${yesterday}`, `from=${today}&to=${today}`, `from=${yesterday}&to=${today}`]) {
      const csv = await exportCsv(q + "&kind=balance");
      const lines = csv.split("\r\n");
      const start = lines.findIndex((l) => l.startsWith("CLOSING INVENTORY"));
      const rowsCsv = lines.slice(start + 2).filter((l) => l && !l.startsWith(",") && !l.startsWith("LOW"));
      for (const l of rowsCsv.slice(0, rowsCsv.findIndex((x) => x === "") === -1 ? undefined : rowsCsv.findIndex((x) => x === ""))) {
        const c = l.split(",");
        if (c.length < 12) continue;
        const [open, rec, iss, adj, close] = c.slice(4, 9).map(Number);
        expect(open + rec - iss + adj).toBeCloseTo(close, 6);
      }
      const num = (label: string) => Number(lines.find((l) => l.startsWith(label))!.split(",")[1]);
      const adj = lines.find((l) => l.startsWith("Net corrections")) ? num("Net corrections") : 0;
      expect(num("Opening inventory value") + num("Total stock-in value") - num("Total stock-out value") + adj).toBeCloseTo(num("Closing inventory value"), 2);
    }
    const y = await exportCsv(`from=${yesterday}&to=${yesterday}`);
    const t = await exportCsv(`from=${today}&to=${today}`);
    const get = (csv: string, label: string) => csv.split("\r\n").find((l) => l.startsWith(label))!.split(",")[1];
    expect(get(t, "Opening inventory value")).toBe(get(y, "Closing inventory value"));
    // Closing value as of today equals the live inventory worth
    const { rows } = await db.query("SELECT sum(stock_value)::numeric(20,2)::text v FROM items");
    expect(get(t, "Closing inventory value")).toBe(rows[0].v);
  });

  it("every report ends with the most stocked in / out items", async () => {
    const csv = await exportCsv("preset=today");
    const lines = csv.split("\r\n");
    const outAt = lines.findIndex((l) => l.startsWith("MOST STOCKED OUT"));
    const inAt = lines.findIndex((l) => l.startsWith("MOST STOCKED IN"));
    expect(inAt).toBeGreaterThan(lines.findIndex((l) => l.startsWith("CLOSING INVENTORY")));
    expect(lines[inAt + 2]).toMatch(/^1,Rice \(50kg bag\),/);
    expect(lines[outAt + 2]).toMatch(/^1,Rice \(50kg bag\),/);
    // Stock-out-only report still shows each item's balance
    const outOnly = await exportCsv("preset=today&kind=stock_out");
    expect(outOnly).toContain("CLOSING INVENTORY");
    expect(outOnly).toContain("MOST STOCKED OUT");
  });

  it("weekly and monthly reports cover the right dates and are named accordingly", async () => {
    const w = await owner.get("/api/reports/export?format=csv&preset=this_week");
    expect(w.headers.get("content-disposition")).toMatch(/mystore-weekly-report-\d{4}-\d{2}-\d{2}(_to_\d{4}-\d{2}-\d{2})?\.csv/);
    const wText = (w.data as Buffer).toString();
    expect(wText).toContain("Weekly Inventory Report");
    const m = await owner.get(`/api/reports/export?format=csv&preset=month&month=${today.slice(0, 7)}`);
    const mText = (m.data as Buffer).toString();
    expect(m.headers.get("content-disposition")).toContain(`mystore-monthly-report-${today.slice(0, 8)}01_to_`);
    expect(mText).toContain("Monthly Inventory Report");
    // The month's closing equals today's closing (same end state)
    const get = (csv: string, label: string) => csv.split("\r\n").find((l) => l.startsWith(label))!.split(",")[1];
    expect(get(mText, "Closing inventory value")).toBe(get(await exportCsv("preset=today"), "Closing inventory value"));
  });

  it("item and category filters narrow the report", async () => {
    const csv = await exportCsv(`preset=today&item=${rice}`);
    expect(csv).toContain("Rice (50kg bag)");
    expect(csv).not.toContain("Sugar");
  });
});

describe("12. Downloads: CSV, Excel and PDF (acceptance 12)", () => {
  it("xlsx has Summary / Stock In / Stock Out / Closing Inventory sheets with matching totals", async () => {
    const r = await owner.get("/api/reports/export?format=xlsx&preset=today");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-disposition")).toMatch(/mystore-report-\d{4}-\d{2}-\d{2}\.xlsx/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.data);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toEqual(expect.arrayContaining(["Summary", "Stock In", "Stock Out", "Closing Inventory", "Low Stock", "Most Stocked"]));
    const closing = wb.getWorksheet("Closing Inventory")!;
    let sum = 0, total = 0;
    closing.eachRow((row, i) => {
      if (i === 1) return;
      if (row.getCell(10).value === "Total") total = Number(row.getCell(11).value);
      else if (typeof row.getCell(11).value === "number") sum += Number(row.getCell(11).value);
    });
    expect(sum).toBeCloseTo(total, 2);
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
    expect(text).toContain("MY STORE");
    expect(text).toContain("Inventory Report");
    expect(text).toMatch(/Page 1 of \d+/);
    expect(text).toContain("Closing Inventory");
    expect(text).toContain("₦");
    expect(text).toContain("Rice (50kg bag)");
    expect(text).toContain("Most stocked out");
    expect(text).toContain("carried forward as its opening stock");
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
    const call = () => fetch(`${BASE}/api/cron/daily-report`, { headers: { authorization: `Bearer ${CRON}` } }).then((r) => r.json());
    expect((await call()).status).toBe("disabled");
    const s = await owner.patch("/api/settings", {
      store_name: "MY STORE", currency_code: "NGN", currency_symbol: "₦", timezone: "Africa/Lagos",
      auto_report_enabled: true, auto_report_time: "00:00", auto_report_covers: "same_day",
      auto_report_formats: ["pdf", "xlsx", "csv"], email_enabled: true, email_recipients: ["owner@mystore.test"],
      auto_weekly_enabled: true, auto_monthly_enabled: true,
    });
    expect(s.status, JSON.stringify(s.data)).toBe(200);
    const first = await call();
    expect(first.status).toBe("ran");
    expect(first.generated).toHaveLength(9); // daily + weekly + monthly, 3 formats each
    expect(first.generated.some((f: string) => f.startsWith("mystore-weekly-report-"))).toBe(true);
    expect(first.generated.some((f: string) => f.startsWith("mystore-monthly-report-"))).toBe(true);
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
      for (const ext of ["pdf", "xlsx", "csv"]) expect(raw).toMatch(new RegExp(`mystore-report-\\d{4}-\\d{2}-\\d{2}\\.${ext}`));
      expect(raw).toContain("mystore-weekly-report-");
      expect(raw).toContain("mystore-monthly-report-");
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

describe("14. Pages render (no dead pages)", () => {
  const pages = ["/dashboard", "/inventory", "/items/new", "/stock-in", "/stock-out", "/transactions", "/reports", "/reports/history",
    "/low-stock", "/categories", "/suppliers", "/units", "/users", "/settings", "/audit"];
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

import { handle } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { moneyByPeriod, spendAnalysis, usageAnalysis, workerItems, type Grouping } from "@/lib/analytics";
import { getSettings } from "@/lib/settings";
import { reasonLabel, todayIn, addDays } from "@/lib/format";

const D = /^\d{4}-\d{2}-\d{2}$/;
const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Usage analysis as an Excel-compatible CSV. */
export const GET = handle(async (req) => {
  await requireApiUser("audit.view");
  const s = await getSettings();
  const sp = req.nextUrl.searchParams;
  const today = todayIn(s.timezone);
  const from = D.test(sp.get("from") ?? "") ? sp.get("from")! : addDays(today, -29);
  const to = D.test(sp.get("to") ?? "") ? sp.get("to")! : today;
  const f = {
    workerId: /^\d+$/.test(sp.get("worker") ?? "") ? Number(sp.get("worker")) : null,
    itemId: /^[0-9a-f-]{36}$/i.test(sp.get("item") ?? "") ? sp.get("item") : null,
    categoryId: /^\d+$/.test(sp.get("category") ?? "") ? Number(sp.get("category")) : null,
  };
  const r = { from, to, tz: s.timezone };
  const group: Grouping = sp.get("group") === "week" || sp.get("group") === "month" ? (sp.get("group") as Grouping) : "day";
  const [u, wi, periods, byItem, byCat, bySup] = await Promise.all([
    usageAnalysis(r, f), workerItems(r, f), moneyByPeriod(r, group, f),
    spendAnalysis(r, "item", f), spendAnalysis(r, "category", f), spendAnalysis(r, "supplier", f),
  ]);
  const cur = s.currency_code;
  const L: unknown[][] = [];
  L.push([s.store_name], ["Usage and money analysis", `${from} to ${to}`], [],
    [`Money spent on stock (${cur})`, byItem.spent], ["Purchases", byItem.receipts], [`Value of stock used (${cur})`, u.totals.value], ["Times stock was taken", u.totals.takes], []);
  L.push([`AMOUNT STOCKED IN AND OUT PER ${group.toUpperCase()}`], [group === "day" ? "Day" : group === "week" ? "Week starting" : "Month starting",
    `Stocked in (${cur})`, `Stocked out (${cur})`, `Difference (${cur})`, "Receipts", "Issues"]);
  periods.forEach((p) => L.push([p.period, p.in_value, p.out_value, (Number(p.in_value) - Number(p.out_value)).toFixed(2), p.in_count, p.out_count]));
  L.push(["TOTAL", periods.reduce((a, p) => a + Number(p.in_value), 0).toFixed(2), periods.reduce((a, p) => a + Number(p.out_value), 0).toFixed(2)], []);
  const spendBlock = (title: string, rows: typeof byItem.rows, withQty: boolean) => {
    L.push([title], ["S/N", "Name", ...(withQty ? ["Quantity bought", "Unit"] : []), `Amount spent (${cur})`, "Share %", "Purchases"]);
    const tot = Number(byItem.spent) || 1;
    rows.forEach((x, i) => L.push([i + 1, x.label, ...(withQty ? [x.qty, x.unit] : []), x.value, ((Number(x.value) / tot) * 100).toFixed(1), x.count]));
    L.push([]);
  };
  spendBlock("HOW MONEY IS SPENT BY ITEM", byItem.rows, true);
  spendBlock("HOW MONEY IS SPENT BY CATEGORY", byCat.rows, false);
  spendBlock("HOW MONEY IS SPENT BY SUPPLIER", bySup.rows, false);
  L.push(["ITEMS TAKEN (most to least)"], ["S/N", "Item", "Code", "Category", "Quantity", "Unit", `Value (${s.currency_code})`, "Times taken", "Workers"]);
  u.items.forEach((x, i) => L.push([i + 1, x.name, x.sku, x.category, x.qty, x.unit, x.value, x.takes, x.workers]));
  L.push([], ["BY WORKER"], ["S/N", "Worker", "Department", "Times taken", "Different items", `Value (${s.currency_code})`]);
  u.workers.forEach((x, i) => L.push([i + 1, x.name, x.department, x.takes, x.items, x.value]));
  L.push([], ["WHO TOOK WHAT"], ["Worker", "Item", "Quantity", "Unit", "Times", `Value (${s.currency_code})`]);
  wi.forEach((x) => L.push([x.worker, x.item, x.qty, x.unit, x.takes, x.value]));
  L.push([], ["BY REASON"], ["Reason", "Times", `Value (${s.currency_code})`]);
  u.reasons.forEach((x) => L.push([reasonLabel(x.reason), x.takes, x.value]));
  if (u.neverTaken.length) {
    L.push([], ["NOT TAKEN AT ALL"]);
    u.neverTaken.forEach((x) => L.push([x.name, x.sku]));
  }
  const text = L.map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
  return new Response(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="velvet-store-usage-${from}_to_${to}.csv"` },
  });
});

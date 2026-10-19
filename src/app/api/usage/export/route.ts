import { handle } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { usageAnalysis, workerItems } from "@/lib/analytics";
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
  const [u, wi] = await Promise.all([usageAnalysis(r, f), workerItems(r, f)]);
  const L: unknown[][] = [];
  L.push([s.store_name], ["Usage analysis", `${from} to ${to}`], [], ["Value taken", u.totals.value], ["Times stock was taken", u.totals.takes], []);
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
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="mystore-usage-${from}_to_${to}.csv"` },
  });
});

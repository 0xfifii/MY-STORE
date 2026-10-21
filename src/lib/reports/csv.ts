import type { ReportData } from "./engine";
import { sectionsFor } from "./engine";
import { formatDateTime, plainQty, reasonLabel } from "../format";

const money = (v: string | number) => Number(v).toFixed(2);
const cost = (v: string | number) => plainQty(Number(v).toFixed(4));

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Excel-compatible CSV (UTF-8 with BOM) with one block per report section. */
export function reportToCsv(r: ReportData): Buffer {
  const tz = r.settings.timezone;
  const cur = r.settings.currency_code;
  const sec = sectionsFor(r.params.kind);
  const lines: unknown[][] = [];
  const blank = () => lines.push([]);

  lines.push([r.settings.store_name]);
  lines.push([r.title]);
  lines.push(["Reporting period", r.periodLabel]);
  if (r.scopeLabel) lines.push(["Scope", r.scopeLabel]);
  lines.push(["Generated", formatDateTime(r.generatedAt, tz)]);
  lines.push(["Currency", cur]);
  blank();

  const st = r.stockStatus;
  lines.push(["GENERAL REPORT: TOTAL STOCK"]);
  lines.push(["Total stock value (closing)", money(r.summary.closing_value)]);
  lines.push(["Opening stock value", money(r.summary.opening_value)]);
  lines.push(["Cost of stock in", money(r.summary.in_value)]);
  lines.push(["Cost of stock out", money(r.summary.out_value)]);
  if (r.summary.adj_count) lines.push(["Net corrections and price changes", money(r.summary.adj_value)]);
  lines.push(["Net change in stock value", money(Number(r.summary.closing_value) - Number(r.summary.opening_value))]);
  lines.push(["Items in store", st.items]);
  lines.push(["Items in stock / low / out", `${st.in_stock} / ${st.low} / ${st.out}`]);
  lines.push(["Stock-in transactions", r.summary.in_count]);
  lines.push(["Stock-out transactions", r.summary.out_count]);
  if (r.summary.adj_count) lines.push(["Correction transactions", r.summary.adj_count]);
  lines.push(["Unique items received or issued", r.summary.items_moved]);
  blank();

  const adjAll = r.summary.adj_count > 0;
  if (sec.balances) {
    lines.push(["STOCK SHEET: OPENING STOCK / STOCK IN / STOCK OUT AND THEIR COST IN ONE TABLE (closing balance is the next day's opening stock)"]);
    lines.push(["S/N", "Item name", "Item code", "Category", "Unit", "Opening stock", "Stock in", `Cost of stock in (${cur})`, "Stock out",
      `Cost of stock out (${cur})`, ...(adjAll ? ["Corrections"] : []), "Closing (Bal)", `Cost per unit (${cur})`, `Closing worth (${cur})`, "Status"]);
    r.balances.forEach((b, i) => lines.push([i + 1, b.name, b.sku, b.category, b.unit, plainQty(b.opening_qty), plainQty(b.in_qty), money(b.in_value),
      plainQty(b.out_qty), money(b.out_value), ...(adjAll ? [plainQty(b.adj_qty)] : []), plainQty(b.closing_qty), cost(b.closing_cost),
      money(b.closing_value), statusText(b.status)]));
    lines.push(["", "TOTAL", "", "", "", "", "", money(r.summary.in_value), "", money(r.summary.out_value), ...(adjAll ? [""] : []), "", "",
      money(r.summary.closing_value), ""]);
    blank();
  }

  if (r.days.length > 1) {
    lines.push(["DAY BY DAY"]);
    const hasAdj = r.days.some((d) => d.rows.some((x) => x.adj !== "0"));
    for (const d of r.days) {
      lines.push([d.day]);
      lines.push(["S/N", "Item name", "Item code", "Unit", "Opening stock", "Stock in", `Cost of stock in (${cur})`, "Stock out",
        `Cost of stock out (${cur})`, ...(hasAdj ? ["Corrections"] : []), "Closing (Bal)"]);
      d.rows.forEach((x, i) => lines.push([i + 1, x.name, x.sku, x.unit, x.opening, x.in, money(x.in_value), x.out, money(x.out_value),
        ...(hasAdj ? [x.adj] : []), x.closing]));
      lines.push(["", "TOTAL", "", "", "", "", money(d.rows.reduce((a, x) => a + Number(x.in_value), 0)), "",
        money(d.rows.reduce((a, x) => a + Number(x.out_value), 0))]);
      blank();
    }
  }

  if (r.byCategory.length) {
    lines.push(["TOTAL STOCK BY CATEGORY"]);
    lines.push(["Category", "Items", `Opening value (${cur})`, `Cost of stock in (${cur})`, `Cost of stock out (${cur})`, `Total stock value (${cur})`]);
    for (const c of r.byCategory) lines.push([c.category, c.items, money(c.opening_value), money(c.in_value), money(c.out_value), money(c.closing_value)]);
    lines.push(["TOTAL", r.byCategory.reduce((a, c) => a + c.items, 0), money(r.summary.opening_value), money(r.summary.in_value),
      money(r.summary.out_value), money(r.summary.closing_value)]);
    blank();
  }

  if (sec.stockIn || sec.stockOut) {
    lines.push([sec.stockIn && sec.stockOut ? "STOCK IN AND STOCK OUT" : sec.stockIn ? "STOCK IN" : "STOCK OUT"]);
    lines.push(["Txn ID", "Date & time", "Type", "Item", "Item code", "Quantity", "Unit", `Cost per unit (${cur})`,
      ...(sec.stockIn ? [`Cost of stock in (${cur})`] : []), ...(sec.stockOut ? [`Cost of stock out (${cur})`] : []),
      "Supplier", "Reason", "Taken by (worker)", "Destination", "Reference", "Notes", "Recorded by"]);
    for (const t of r.movements) {
      const isIn = t.txn_type === "stock_in";
      lines.push([t.txn_no, formatDateTime(t.occurred_at, tz), isIn ? "Stock in" : "Stock out", t.item_name, t.item_sku,
        plainQty(t.entered_quantity), t.entered_unit_symbol, cost(t.entered_unit_cost),
        ...(sec.stockIn ? [isIn ? money(t.total_value) : ""] : []), ...(sec.stockOut ? [!isIn ? money(t.total_value) : ""] : []),
        isIn ? (t.is_opening ? "Opening stock" : t.supplier_label) : "", isIn ? "" : reasonLabel(t.reason), t.worker_name, t.recipient,
        t.reference, t.notes, t.user_name]);
    }
    if (!r.movements.length) lines.push(["No stock moved in this period"]);
    lines.push(["", "", "", "", "", "", "", "TOTAL", ...(sec.stockIn ? [money(r.summary.in_value)] : []), ...(sec.stockOut ? [money(r.summary.out_value)] : [])]);
    blank();
  }

  if (sec.corrections && r.corrections.length) {
    lines.push(["CORRECTIONS (REVERSALS)"]);
    lines.push(["Txn ID", "Date & time", "Item", "Item code", "Reverses", "Effect on stock", "Unit", `Value (${cur})`, "Reason", "Recorded by"]);
    for (const t of r.corrections) {
      lines.push([t.txn_no, formatDateTime(t.occurred_at, tz), t.item_name, t.item_sku, t.txn_type === "revaluation" ? "Price change" : t.reverses_txn_no,
        (t.direction > 0 ? "+" : "-") + plainQty(t.quantity), t.unit_symbol, (t.direction > 0 ? "" : "-") + money(t.total_value),
        t.correction_reason, t.user_name]);
    }
    blank();
  }

  if (sec.lowStock) {
    lines.push(["LOW / OUT OF STOCK AT END OF PERIOD"]);
    lines.push(["Item", "Item code", "Unit", "Closing balance", "Minimum level", "Status"]);
    for (const b of r.lowStock) lines.push([b.name, b.sku, b.unit, plainQty(b.closing_qty), plainQty(b.min_stock_level), statusText(b.status)]);
    if (!r.lowStock.length) lines.push(["None"]);
  }

  if (r.byWorker.length) {
    blank();
    lines.push(["STOCK TAKEN BY WORKER"]);
    lines.push(["S/N", "Worker", "Times taken", "Different items", `Value taken (${cur})`]);
    r.byWorker.forEach((w, i) => lines.push([i + 1, w.name, w.takes, w.items, money(w.value)]));
  }

  if (sec.highlights) {
    blank();
    const block = (title: string, rows: typeof r.topIn, empty: string, verb: string) => {
      lines.push([title]);
      lines.push(["Rank", "Item", "Item code", `Quantity ${verb}`, "Unit", `Value (${cur})`, "Transactions"]);
      rows.forEach((h, i) => lines.push([i + 1, h.name, h.sku, plainQty(h.qty), h.unit, money(h.value), h.count]));
      if (!rows.length) lines.push([empty]);
      blank();
    };
    block("MOST STOCKED IN (by value)", r.topIn, "Nothing was received in this period", "received");
    block("MOST STOCKED OUT (by value)", r.topOut, "Nothing was issued in this period", "issued");
  }

  const text = lines.map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, "utf8")]);
}

export function statusText(s: string) {
  return s === "out" ? "Out of stock" : s === "low" ? "Low stock" : "In stock";
}

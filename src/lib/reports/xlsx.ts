import ExcelJS from "exceljs";
import type { ReportData } from "./engine";
import { sectionsFor } from "./engine";
import { formatDateTime, formatQty, reasonLabel } from "../format";
import { statusText } from "./csv";

const BURGUNDY = "ff8f0e16";
const LIGHT = "fff7ebe0";

/** Formatted workbook: General Report, Stock Sheet, Stock In & Out, Corrections, Low Stock, By Worker, Most Stocked. */
export async function reportToXlsx(r: ReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = r.settings.store_name;
  wb.created = new Date(r.generatedAt);
  const tz = r.settings.timezone;
  const sym = r.settings.currency_symbol;
  const moneyFmt = `"${sym}"#,##0.00`;
  const costFmt = `"${sym}"#,##0.00##`;
  const qtyFmt = "#,##0.######";
  const sec = sectionsFor(r.params.kind);

  const st = r.stockStatus;
  const adjAll = r.summary.adj_count > 0;

  // ---- General report: total stock, money in and out, totals by category
  const g = wb.addWorksheet("General Report", { views: [{ showGridLines: false }] });
  g.columns = [{ width: 34 }, { width: 12 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 20 }];
  g.addRow([r.settings.store_name]).font = { bold: true, size: 18, color: { argb: BURGUNDY } };
  g.addRow([r.title]).font = { bold: true, size: 13 };
  g.addRow(["Reporting period", r.periodLabel]);
  if (r.scopeLabel) g.addRow(["Scope", r.scopeLabel]);
  g.addRow(["Generated", formatDateTime(r.generatedAt, tz)]);
  g.addRow(["Currency", `${r.settings.currency_code} (${sym})`]);
  g.addRow([]);
  styleHeader(g.addRow(["Total stock", "Value"]));
  const sumRows: [string, number | string, string?][] = [
    ["Total stock value (closing)", Number(r.summary.closing_value), moneyFmt],
    ["Opening stock value", Number(r.summary.opening_value), moneyFmt],
    ["Cost of stock in", Number(r.summary.in_value), moneyFmt],
    ["Cost of stock out", Number(r.summary.out_value), moneyFmt],
  ];
  if (adjAll) sumRows.push(["Net corrections (reversals)", Number(r.summary.adj_value), moneyFmt]);
  sumRows.push(
    ["Net change in stock value", Number(r.summary.closing_value) - Number(r.summary.opening_value), moneyFmt],
    ["Items in store", st.items], ["Items in stock", st.in_stock], ["Items low", st.low], ["Items out of stock", st.out],
    ["Stock-in transactions", r.summary.in_count], ["Stock-out transactions", r.summary.out_count],
  );
  if (adjAll) sumRows.push(["Correction transactions", r.summary.adj_count]);
  sumRows.push(["Unique items received or issued", r.summary.items_moved]);
  if (r.topIn[0]) sumRows.push(["Most stocked in", `${r.topIn[0].name}, ${formatQty(r.topIn[0].qty)} ${r.topIn[0].unit}`]);
  if (r.topOut[0]) sumRows.push(["Most stocked out", `${r.topOut[0].name}, ${formatQty(r.topOut[0].qty)} ${r.topOut[0].unit}`]);
  for (const [label, val, fmt] of sumRows) {
    const row = g.addRow([label, val]);
    if (fmt) row.getCell(2).numFmt = fmt;
    row.getCell(2).alignment = { horizontal: "right" };
    if (label.startsWith("Total stock")) row.font = { bold: true, color: { argb: BURGUNDY } };
    row.eachCell((c) => (c.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } }));
  }
  g.getColumn(2).width = 22;
  if (r.byCategory.length) {
    g.addRow([]);
    g.addRow(["Total stock by category"]).font = { bold: true, size: 12, color: { argb: BURGUNDY } };
    styleHeader(g.addRow(["Category", "Items", "Opening value", "Cost of stock in", "Cost of stock out", "Total stock value"]));
    for (const c of r.byCategory) {
      const row = g.addRow([c.category, c.items, Number(c.opening_value), Number(c.in_value), Number(c.out_value), Number(c.closing_value)]);
      for (let i = 3; i <= 6; i++) row.getCell(i).numFmt = moneyFmt;
      row.eachCell((c) => (c.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } }));
    }
    const tr = g.addRow(["Total", r.byCategory.reduce((a, c) => a + c.items, 0), Number(r.summary.opening_value), Number(r.summary.in_value),
      Number(r.summary.out_value), Number(r.summary.closing_value)]);
    for (let i = 3; i <= 6; i++) tr.getCell(i).numFmt = moneyFmt;
    tr.font = { bold: true };
    tr.eachCell((c) => (c.border = { top: { style: "thin" } }));
  }
  g.addRow([]);
  g.addRow(["Closing = Opening + Stock in − Stock out ± Corrections. Valuation: weighted-average cost."]).font = {
    italic: true, size: 9, color: { argb: "FF666666" },
  };

  // ---- Stock Sheet: opening, stock in, cost of stock in, stock out, cost of stock out, closing, one table
  if (sec.balances) {
    const ws = wb.addWorksheet("Stock Sheet", { views: [{ showGridLines: false }] });
    ws.columns = [
      { width: 6 }, { width: 30 }, { width: 12 }, { width: 8 }, { width: 14 }, { width: 12 }, { width: 16 }, { width: 12 }, { width: 16 },
      ...(adjAll ? [{ width: 12 }] : []), { width: 15 }, { width: 16 }, { width: 13 },
    ];
    ws.addRow([r.settings.store_name]).font = { bold: true, size: 16, color: { argb: BURGUNDY } };
    ws.addRow([`Stock sheet · ${r.periodLabel}`]).font = { bold: true, size: 12 };
    ws.addRow(["Each closing balance (Bal) is the next day's opening stock."]).font = { italic: true, size: 9, color: { argb: "FF666666" } };

    type Line = { name: string; sku: string; unit: string; opening: string; in: string; in_value: string; out: string; out_value: string; adj: string; closing: string; worth?: string; status?: string };
    const block = (title: string | null, rows: Line[], adj: boolean, withWorth: boolean) => {
      ws.addRow([]);
      const cols = 9 + (adj ? 1 : 0) + 1 + (withWorth ? 2 : 0);
      if (title) {
        const dh = ws.addRow([title]);
        ws.mergeCells(dh.number, 1, dh.number, cols);
        dh.font = { bold: true, size: 12, color: { argb: BURGUNDY } };
        dh.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
      }
      styleHeader(ws.addRow(["S/N", "Item name", "Item code", "Unit", "Opening stock", "Stock in", "Cost of stock in", "Stock out", "Cost of stock out",
        ...(adj ? ["Corrections"] : []), "Closing (Bal)", ...(withWorth ? ["Closing worth", "Status"] : [])]));
      let tin = 0, tout = 0, tworth = 0;
      rows.forEach((x, i) => {
        tin += Number(x.in_value); tout += Number(x.out_value); tworth += Number(x.worth ?? 0);
        const row = ws.addRow([i + 1, x.name, x.sku, x.unit, Number(x.opening), Number(x.in), Number(x.in_value), Number(x.out), Number(x.out_value),
          ...(adj ? [Number(x.adj)] : []), Number(x.closing), ...(withWorth ? [Number(x.worth), x.status] : [])]);
        [5, 6, 8, ...(adj ? [10] : []), adj ? 11 : 10].forEach((c) => (row.getCell(c).numFmt = qtyFmt));
        [7, 9, ...(withWorth ? [adj ? 12 : 11] : [])].forEach((c) => (row.getCell(c).numFmt = moneyFmt));
        row.getCell(6).font = { color: { argb: "FF166534" } };
        row.getCell(8).font = { color: { argb: BURGUNDY } };
        row.getCell(adj ? 11 : 10).font = { bold: true };
        row.eachCell((c) => (c.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } }));
      });
      const tr = ws.addRow(["", "Total", "", "", "", "", tin, "", tout, ...(adj ? [""] : []), "", ...(withWorth ? [tworth, ""] : [])]);
      tr.getCell(7).numFmt = moneyFmt; tr.getCell(9).numFmt = moneyFmt;
      if (withWorth) tr.getCell(adj ? 12 : 11).numFmt = moneyFmt;
      tr.font = { bold: true };
      tr.eachCell((c) => (c.border = { top: { style: "thin" } }));
    };
    block(r.days.length > 1 ? "Whole period" : null, r.balances.map((b) => ({
      name: b.name, sku: b.sku, unit: b.unit, opening: b.opening_qty, in: b.in_qty, in_value: b.in_value, out: b.out_qty, out_value: b.out_value,
      adj: b.adj_qty, closing: b.closing_qty, worth: b.closing_value, status: statusText(b.status),
    })), adjAll, true);
    if (r.days.length > 1) {
      for (const d of r.days) {
        block(new Date(d.day + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
          d.rows, d.rows.some((x) => x.adj !== "0"), false);
      }
    }
  }

  // ---- Stock In & Out together
  if (sec.stockIn || sec.stockOut) {
    const ws = table(wb, sec.stockIn && sec.stockOut ? "Stock In & Out" : sec.stockIn ? "Stock In" : "Stock Out", [
      ["Txn ID", 12], ["Date & time", 19], ["Type", 10], ["Item", 28], ["Item code", 13], ["Quantity", 11, qtyFmt], ["Unit", 8], ["Cost per unit", 14, costFmt],
      ...(sec.stockIn ? [["Cost of stock in", 16, moneyFmt] as [string, number, string]] : []),
      ...(sec.stockOut ? [["Cost of stock out", 16, moneyFmt] as [string, number, string]] : []),
      ["Supplier", 20], ["Reason", 14], ["Taken by (worker)", 20], ["Destination", 18], ["Reference", 16], ["Notes", 28], ["Recorded by", 16],
    ], r.movements.map((t) => {
      const isIn = t.txn_type === "stock_in";
      return [t.txn_no, formatDateTime(t.occurred_at, tz), isIn ? "Stock in" : "Stock out", t.item_name, t.item_sku, Number(t.entered_quantity),
        t.entered_unit_symbol, Number(t.entered_unit_cost),
        ...(sec.stockIn ? [isIn ? Number(t.total_value) : null] : []), ...(sec.stockOut ? [!isIn ? Number(t.total_value) : null] : []),
        isIn ? (t.is_opening ? "Opening stock" : t.supplier_label) : null, isIn ? null : reasonLabel(t.reason), t.worker_name, t.recipient,
        t.reference, t.notes, t.user_name];
    }));
    const tr = ws.addRow([]);
    tr.getCell(8).value = "Total";
    let col = 9;
    if (sec.stockIn) { tr.getCell(col).value = Number(r.summary.in_value); tr.getCell(col).numFmt = moneyFmt; col++; }
    if (sec.stockOut) { tr.getCell(col).value = Number(r.summary.out_value); tr.getCell(col).numFmt = moneyFmt; }
    tr.font = { bold: true };
  }

  // ---- Corrections
  if (sec.corrections && r.corrections.length) {
    table(wb, "Corrections", [
      ["Txn ID", 12], ["Date & time", 19], ["Item", 28], ["Item code", 13], ["Reverses", 12], ["Quantity effect", 15, qtyFmt],
      ["Unit", 8], ["Value effect", 16, moneyFmt], ["Reason", 36], ["Recorded by", 16],
    ], r.corrections.map((t) => [
      t.txn_no, formatDateTime(t.occurred_at, tz), t.item_name, t.item_sku, t.reverses_txn_no, t.direction * Number(t.quantity),
      t.unit_symbol, t.direction * Number(t.total_value), t.correction_reason, t.user_name,
    ]));
  }

  if (sec.lowStock) {
    table(wb, "Low Stock", [["Item", 28], ["Item code", 13], ["Unit", 8], ["Closing balance", 15, qtyFmt], ["Minimum level", 15, qtyFmt], ["Status", 14]],
      r.lowStock.map((b) => [b.name, b.sku, b.unit, Number(b.closing_qty), Number(b.min_stock_level), statusText(b.status)]));
  }

  if (r.byWorker.length) {
    table(wb, "By Worker", [["S/N", 6], ["Worker", 28], ["Times taken", 13], ["Different items", 15], ["Value taken", 16, moneyFmt]],
      r.byWorker.map((w, i) => [i + 1, w.name, w.takes, w.items, Number(w.value)]));
  }

  if (sec.highlights) {
    const ws = wb.addWorksheet("Most Stocked", { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 7 }, { width: 30 }, { width: 13 }, { width: 14 }, { width: 8 }, { width: 16 }, { width: 13 }];
    const block = (title: string, rows: typeof r.topIn, verb: string) => {
      ws.addRow([title]).font = { bold: true, size: 12, color: { argb: BURGUNDY } };
      styleHeader(ws.addRow(["Rank", "Item", "Item code", `Qty ${verb}`, "Unit", "Value", "Transactions"]));
      rows.forEach((h, i) => {
        const row = ws.addRow([i + 1, h.name, h.sku, Number(h.qty), h.unit, Number(h.value), h.count]);
        row.getCell(4).numFmt = qtyFmt;
        row.getCell(6).numFmt = moneyFmt;
        if (i === 0) row.font = { bold: true };
      });
      if (!rows.length) ws.addRow(["", `Nothing ${verb} in this period`]).font = { italic: true, color: { argb: "FF666666" } };
      ws.addRow([]);
    };
    block("Most stocked in (ranked by value)", r.topIn, "received");
    block("Most stocked out (ranked by value)", r.topOut, "issued");
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BURGUNDY } };
    c.alignment = { vertical: "middle", wrapText: true };
  });
  row.height = 22;
}

function table(wb: ExcelJS.Workbook, name: string, cols: [string, number, string?][], rows: unknown[][]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols.map(([header, width, fmt]) => ({ header, width, style: fmt ? { numFmt: fmt } : {} }));
  styleHeader(ws.getRow(1));
  rows.forEach((r, i) => {
    const row = ws.addRow(r);
    if (i % 2 === 1) row.eachCell({ includeEmpty: true }, (c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } }));
  });
  if (!rows.length) ws.addRow(["No records for this period"]).font = { italic: true, color: { argb: "FF666666" } };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

import ExcelJS from "exceljs";
import type { ReportData } from "./engine";
import { sectionsFor } from "./engine";
import { formatDateTime, formatQty, reasonLabel } from "../format";
import { statusText } from "./csv";

const BURGUNDY = "FF7A1F35";
const LIGHT = "FFF7ECEF";

/** Formatted workbook: Summary, Stock In, Stock Out, Corrections, Closing Inventory, Low Stock. */
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

  // ---- Stock Sheet: one block per day — S/N, item, opening, in, out, closing (bal)
  if (r.days.length) {
    const ws = wb.addWorksheet("Stock Sheet", { views: [{ showGridLines: false }] });
    const hasAdj = r.days.some((d) => d.rows.some((x) => x.adj !== "0"));
    ws.columns = [
      { width: 6 }, { width: 32 }, { width: 13 }, { width: 8 }, { width: 15 }, { width: 13 }, { width: 13 },
      ...(hasAdj ? [{ width: 13 }] : []), { width: 17 },
    ];
    const t = ws.addRow([r.settings.store_name]);
    t.font = { bold: true, size: 16, color: { argb: BURGUNDY } };
    ws.addRow([`Stock sheet · ${r.periodLabel}`]).font = { bold: true, size: 12 };
    ws.addRow(["Each day's closing balance is the next day's opening stock."]).font = { italic: true, size: 9, color: { argb: "FF666666" } };
    const lastCol = hasAdj ? 9 : 8;
    for (const d of r.days) {
      ws.addRow([]);
      const dh = ws.addRow([new Date(d.day + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })]);
      ws.mergeCells(dh.number, 1, dh.number, lastCol);
      dh.font = { bold: true, size: 12, color: { argb: BURGUNDY } };
      dh.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
      styleHeader(ws.addRow(["S/N", "Item name", "Item code", "Unit", "Opening stock", "Stock in", "Stock out", ...(hasAdj ? ["Corrections"] : []), "Closing (Bal)"]));
      d.rows.forEach((x, i) => {
        const row = ws.addRow([i + 1, x.name, x.sku, x.unit, Number(x.opening), Number(x.in), Number(x.out), ...(hasAdj ? [Number(x.adj)] : []), Number(x.closing)]);
        for (let c = 5; c <= lastCol; c++) row.getCell(c).numFmt = qtyFmt;
        row.getCell(lastCol).font = { bold: true };
        row.eachCell((c) => (c.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } }));
      });
    }
  }

  // ---- Summary
  const s = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
  s.columns = [{ width: 38 }, { width: 28 }];
  s.addRow([r.settings.store_name]).font = { bold: true, size: 18, color: { argb: BURGUNDY } };
  s.addRow([r.title]).font = { bold: true, size: 13 };
  s.addRow(["Reporting period", r.periodLabel]);
  if (r.scopeLabel) s.addRow(["Scope", r.scopeLabel]);
  s.addRow(["Generated", formatDateTime(r.generatedAt, tz)]);
  s.addRow(["Currency", `${r.settings.currency_code} (${sym})`]);
  s.addRow([]);
  const sumRows: [string, number | string, string?][] = [
    ["Opening inventory value", Number(r.summary.opening_value), moneyFmt],
    ["Total stock-in value", Number(r.summary.in_value), moneyFmt],
    ["Total stock-out value", Number(r.summary.out_value), moneyFmt],
  ];
  if (r.summary.adj_count) sumRows.push(["Net corrections (reversals)", Number(r.summary.adj_value), moneyFmt]);
  sumRows.push(
    ["Closing inventory value", Number(r.summary.closing_value), moneyFmt],
    ["Stock-in transactions", r.summary.in_count],
    ["Stock-out transactions", r.summary.out_count],
  );
  if (r.summary.adj_count) sumRows.push(["Correction transactions", r.summary.adj_count]);
  sumRows.push(["Unique items received or issued", r.summary.items_moved]);
  if (r.topIn[0]) sumRows.push(["Most stocked in", `${r.topIn[0].name} — ${formatQty(r.topIn[0].qty)} ${r.topIn[0].unit}`]);
  if (r.topOut[0]) sumRows.push(["Most stocked out", `${r.topOut[0].name} — ${formatQty(r.topOut[0].qty)} ${r.topOut[0].unit}`]);
  const head = s.addRow(["Summary", ""]);
  styleHeader(head);
  for (const [label, val, fmt] of sumRows) {
    const row = s.addRow([label, val]);
    if (fmt) row.getCell(2).numFmt = fmt;
    row.getCell(2).alignment = { horizontal: "right" };
    if (label.startsWith("Closing")) row.font = { bold: true };
    row.eachCell((c) => (c.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } }));
  }
  s.addRow([]);
  s.addRow(["Closing value = Opening + Stock in − Stock out ± Corrections. Valuation: weighted-average cost."]).font = {
    italic: true, size: 9, color: { argb: "FF666666" },
  };

  // ---- Stock In
  if (sec.stockIn) {
    const ws = table(wb, "Stock In", [
      ["Txn ID", 12], ["Date & time", 19], ["Item", 28], ["Item code", 13], ["Quantity", 11, qtyFmt], ["Unit", 8],
      ["Cost per unit", 14, costFmt], ["Total value", 16, moneyFmt], ["Supplier", 20], ["Reference", 16], ["Notes", 28], ["Recorded by", 16],
    ], r.stockIn.map((t) => [
      t.txn_no, formatDateTime(t.occurred_at, tz), t.item_name, t.item_sku, Number(t.entered_quantity), t.entered_unit_symbol,
      Number(t.entered_unit_cost), Number(t.total_value), t.is_opening ? "Opening stock" : t.supplier_label, t.reference, t.notes, t.user_name,
    ]));
    totalRow(ws, 8, Number(r.summary.in_value), moneyFmt, r.stockIn.length);
  }

  // ---- Stock Out
  if (sec.stockOut) {
    const ws = table(wb, "Stock Out", [
      ["Txn ID", 12], ["Date & time", 19], ["Item", 28], ["Item code", 13], ["Quantity", 11, qtyFmt], ["Unit", 8],
      ["Cost per unit applied", 16, costFmt], ["Total value", 16, moneyFmt], ["Reason", 15], ["Taken by (worker)", 20], ["Destination", 18],
      ["Reference", 16], ["Notes", 28], ["Recorded by", 16],
    ], r.stockOut.map((t) => [
      t.txn_no, formatDateTime(t.occurred_at, tz), t.item_name, t.item_sku, Number(t.entered_quantity), t.entered_unit_symbol,
      Number(t.entered_unit_cost), Number(t.total_value), reasonLabel(t.reason), t.worker_name, t.recipient, t.reference, t.notes, t.user_name,
    ]));
    totalRow(ws, 8, Number(r.summary.out_value), moneyFmt, r.stockOut.length);
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

  // ---- Closing inventory
  if (sec.balances) {
    const ws = table(wb, "Closing Inventory", [
      ["Item", 28], ["Item code", 13], ["Category", 16], ["Unit", 8], ["Opening", 12, qtyFmt], ["Received", 12, qtyFmt],
      ["Issued", 12, qtyFmt], ["Corrections", 12, qtyFmt], ["Closing (next opening)", 14, qtyFmt], ["Cost per unit", 14, costFmt],
      ["Closing worth", 16, moneyFmt], ["Status", 13],
    ], r.balances.map((b) => [
      b.name, b.sku, b.category, b.unit, Number(b.opening_qty), Number(b.in_qty), Number(b.out_qty), Number(b.adj_qty),
      Number(b.closing_qty), Number(b.closing_cost), Number(b.closing_value), statusText(b.status),
    ]));
    totalRow(ws, 11, Number(r.summary.closing_value), moneyFmt, r.balances.length);
    r.balances.forEach((b, i) => {
      if (b.status === "in_stock") return;
      const cell = ws.getRow(i + 2).getCell(12);
      cell.font = { bold: true, color: { argb: b.status === "out" ? "FFB91C1C" : "FFB45309" } };
    });
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

function totalRow(ws: ExcelJS.Worksheet, col: number, value: number, fmt: string, count: number) {
  const row = ws.addRow([]);
  row.getCell(col - 1).value = "Total";
  row.getCell(col).value = value;
  row.getCell(col).numFmt = fmt;
  row.font = { bold: true };
  row.getCell(col).border = { top: { style: "thin" } };
  void count;
}

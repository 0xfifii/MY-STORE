import "server-only";
import ExcelJS from "exceljs";
import {
  auditSummary, countsInRange, monthRange, monthlyTrend, priceTracking, purchaseRanking, stockOutAnalysis,
  type PriceRow, type PurchaseRow, type IssueRow, type StockCountRow,
} from "./audit-analytics";
import { buildReport, type ReportData } from "./reports/engine";
import { renderPdf, tableBlock } from "./reports/pdf";
import { statusText } from "./reports/csv";
import { getSettings, type StoreSettings } from "./settings";
import { formatDateTime, formatMoney, formatQty, formatUnitCost, reasonLabel } from "./format";

export type AuditReportData = {
  month: string; label: string; settings: StoreSettings; generatedAt: string; generatedBy: string;
  report: ReportData; summary: Awaited<ReturnType<typeof auditSummary>>;
  purchases: PurchaseRow[]; prices: PriceRow[]; issues: IssueRow[]; counts: StockCountRow[];
  trend: Awaited<ReturnType<typeof monthlyTrend>>;
};

export const monthLabel = (month: string) =>
  new Date(month + "-01T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export async function buildAuditReport(month: string, generatedBy: string): Promise<AuditReportData> {
  const s = await getSettings();
  const r = monthRange(month, s.timezone);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: s.timezone });
  if (r.to > today) r.to = today; // a month in progress runs to today
  const [report, summary, purchases, prices, issues, counts, trend] = await Promise.all([
    buildReport({ from: r.from, to: r.to, kind: "full", periodType: "month" }, s),
    auditSummary(r), purchaseRanking(r), priceTracking(r), stockOutAnalysis(r), countsInRange(r), monthlyTrend(month, 12, s.timezone),
  ]);
  return { month, label: monthLabel(month), settings: s, generatedAt: new Date().toISOString(), generatedBy, report, summary, purchases, prices, issues, counts, trend };
}

export const auditFileName = (month: string, ext: string) => `isura-monthly-audit-${month}.${ext}`;

const BURGUNDY = "#111111";
type Cell = Record<string, unknown> | string;

export async function auditReportPdf(a: AuditReportData): Promise<Buffer> {
  const s = a.settings;
  const sym = s.currency_symbol;
  const m = (v: string | number) => formatMoney(v, sym);
  const c = (v: string | number | null) => (v === null ? "-" : formatUnitCost(v, sym));
  const h = (t: string, right = false): Cell => ({ text: t, style: "th", alignment: right ? "right" : "left" });
  const R = (t: string, extra: Record<string, unknown> = {}): Cell => ({ text: t, alignment: "right", ...extra });
  const none = (cols: number, msg: string): Cell[] => [{ text: msg, colSpan: cols, italics: true, color: "#777" }, ...Array(cols - 1).fill("")];
  const sm = a.summary;
  const rs = a.report.summary;
  const content: unknown[] = [];

  content.push({
    columns: [
      [{ text: s.store_name, style: "brand" }, { text: "Monthly Audit Report", style: "title" }],
      {
        width: "auto",
        stack: [
          { text: `Period: ${a.label} (${a.report.periodLabel.replace(/^.*\(|\)$/g, "")})`, alignment: "right", bold: true },
          { text: `Generated ${formatDateTime(a.generatedAt, s.timezone)} by ${a.generatedBy}`, alignment: "right", color: "#555" },
          { text: `Currency ${s.currency_code} (${sym}) · weighted-average cost`, alignment: "right", color: "#555" },
        ],
        fontSize: 8.5,
      },
    ],
  });
  content.push({ canvas: [{ type: "line", x1: 0, y1: 6, x2: 770, y2: 6, lineWidth: 2, lineColor: BURGUNDY }], margin: [0, 0, 0, 10] });

  const card = (label: string, value: string, sub = "") => ({
    stack: [{ text: label.toUpperCase(), fontSize: 6.5, bold: true, color: "#666" }, { text: value, fontSize: 11.5, bold: true, margin: [0, 2, 0, 0] }, { text: sub, fontSize: 7, color: "#666" }],
    margin: [6, 6, 6, 6],
  });
  content.push({
    table: {
      widths: Array(6).fill("*"),
      body: [[
        card("Inventory value (end)", m(rs.closing_value), `opening ${m(rs.opening_value)}`),
        card("Purchases", m(sm.stockIn.spend), `${sm.stockIn.receipts} receipts · ${sm.stockIn.items} items`),
        card("Stock out value", m(sm.stockOut.value), `${sm.stockOut.issues} issues · ${sm.stockOut.items} items`),
        card("Price changes", `${sm.priceUp} up · ${sm.priceDown} down`, "latest vs previous purchase"),
        card("Low / out of stock", `${a.report.stockStatus.low} · ${a.report.stockStatus.out}`, "at month end"),
        card("Count differences", `−${m(sm.counts.shortage)} / +${m(sm.counts.excess)}`, `${sm.counts.pending} counts pending`),
      ]],
    },
    layout: { hLineColor: "#e5e5e5", vLineColor: "#e5e5e5", fillColor: () => "#f7f7f7" },
  });

  // 1. Opening and closing balances
  content.push({ text: "1. Opening and closing balances", style: "h2" });
  {
    const body: Cell[][] = [[h("S/N"), h("Item"), h("Unit"), h("Opening", true), h("Stock in", true), h("Cost of stock in", true), h("Stock out", true), h("Cost of stock out", true), h("Adjust.", true), h("Closing", true), h("Closing value", true)]];
    a.report.balances.forEach((b, i) => body.push([String(i + 1), `${b.name} (${b.sku})`, b.unit, R(formatQty(b.opening_qty)), R(formatQty(b.in_qty)), R(m(b.in_value)), R(formatQty(b.out_qty)), R(m(b.out_value)), R(formatQty(b.adj_qty)), R(formatQty(b.closing_qty), { bold: true }), R(m(b.closing_value))]));
    if (!a.report.balances.length) body.push(none(11, "No items."));
    body.push([{ text: "Total", bold: true, colSpan: 5, alignment: "right" }, "", "", "", "", R(m(rs.in_value), { bold: true }), "", R(m(rs.out_value), { bold: true }), "", "", R(m(rs.closing_value), { bold: true })]);
    content.push(tableBlock(body, [20, "*", 30, 50, 46, 66, 46, 66, 40, 52, 70]));
    content.push({ text: "Stock in and stock out here include stock-count adjustments (shown in section 6). Adjust. = corrections (reversals).", fontSize: 7, color: "#777", margin: [0, 3, 0, 0] });
  }

  // 2. Purchases
  content.push({ text: "2. Most purchased items (stock in from suppliers)", style: "h2" });
  {
    const top = a.purchases[0];
    const byQty = new Map<string, PurchaseRow>();
    for (const p of a.purchases) if (!byQty.has(p.unit) || Number(p.qty) > Number(byQty.get(p.unit)!.qty)) byQty.set(p.unit, p);
    if (top) {
      content.push({
        text: [
          { text: "Highest spending: ", bold: true }, `${top.name}, ${m(top.spend)}.   `,
          { text: "Largest quantity bought (per unit): ", bold: true },
          [...byQty.values()].map((p) => `${p.name} ${formatQty(p.qty)} ${p.unit}`).join(" · "),
        ],
        fontSize: 8.5, margin: [0, 0, 0, 5],
      });
    }
    const body: Cell[][] = [[h("#"), h("Item"), h("Qty bought", true), h("Purchases", true), h("Days restocked", true), h("Avg price (weighted)", true), h("Amount spent", true), h("Share", true)]];
    const spent = Number(sm.stockIn.spend) || 1;
    a.purchases.forEach((p, i) => body.push([String(i + 1), `${p.name} (${p.sku})`, R(`${formatQty(p.qty)} ${p.unit}`), R(String(p.purchases)), R(String(p.restock_days)), R(`${c(p.avg_price)} / ${p.unit}`), R(m(p.spend), { bold: i === 0 }), R(`${((Number(p.spend) / spent) * 100).toFixed(1)}%`)]));
    if (!a.purchases.length) body.push(none(8, "No purchases this month."));
    else body.push([{ text: "Total", bold: true, colSpan: 6, alignment: "right" }, "", "", "", "", "", R(m(sm.stockIn.spend), { bold: true }), ""]);
    content.push(tableBlock(body, [16, "*", 74, 50, 60, 100, 80, 44]));
  }

  // 3. Stock out
  content.push({ text: "3. Stock out: fastest-moving items", style: "h2" });
  {
    const body: Cell[][] = [[h("#"), h("Item"), h("Qty out", true), h("Issues", true), h("Value issued", true), h("Share of available", true), h("Main reasons")]];
    a.issues.forEach((x, i) => body.push([String(i + 1), `${x.name} (${x.sku})`, R(`${formatQty(x.out_qty)} ${x.unit}`), R(String(x.issues)), R(m(x.out_value)), R(x.turnover ? `${x.turnover}%` : "-"),
      x.reasons.slice(0, 3).map((y) => `${reasonLabel(y.reason)} ${y.count}×`).join(", ")]));
    if (!a.issues.length) body.push(none(7, "No stock was issued this month."));
    content.push(tableBlock(body, [16, "*", 74, 44, 80, 80, 170]));
    content.push({ text: "Share of available = quantity issued ÷ (opening stock + stock received) for the month. Reasons are as recorded; only \"Sale\" means a sale.", fontSize: 7, color: "#777", margin: [0, 3, 0, 0] });
  }

  // 4. Price changes
  content.push({ text: "4. Purchase price changes (per base unit)", style: "h2" });
  {
    const body: Cell[][] = [[h("Item"), h("Previous", true), h("Latest", true), h("Change", true), h("Change %", true), h("Highest", true), h("Lowest", true), h("Average (weighted)", true), h("Purchases", true), h("Suppliers")]];
    for (const p of a.prices) {
      const up = (p.change ?? 0) > 0, down = (p.change ?? 0) < 0;
      body.push([`${p.name} (per ${p.unit})`, R(c(p.previous)), R(c(p.latest), { bold: true }),
        R(p.change === null ? "-" : `${up ? "+" : down ? "−" : ""}${c(Math.abs(p.change))}`, { color: up ? "#B42318" : down ? "#1a1a1a" : "#111", bold: up || down }),
        R(p.changePct === null ? "first purchase" : `${p.changePct > 0 ? "+" : ""}${p.changePct.toFixed(2)}%`, { color: up ? "#B42318" : down ? "#1a1a1a" : "#111" }),
        R(c(p.high)), R(c(p.low)), R(c(p.avgWeighted)), R(String(p.points.length)), p.suppliers.join(", ") || "-"]);
    }
    if (!a.prices.length) body.push(none(10, "No supplier purchases this month, so there is no price history to compare."));
    content.push(tableBlock(body, ["*", 62, 62, 58, 52, 58, 58, 72, 44, 90]));
    content.push({ text: "Previous = the purchase before the latest one (it may be from an earlier month). Opening stock and stock-count adjustments are not purchases.", fontSize: 7, color: "#777", margin: [0, 3, 0, 0] });
  }

  // 5. Trend
  content.push({ text: "5. Monthly expenditure and movement trend (last 12 months)", style: "h2" });
  {
    const body: Cell[][] = [[h("Month"), h("Amount spent", true), h("Purchases", true), h("Items bought", true), h("Value issued", true), h("Issues", true), h("Items issued", true)]];
    for (const t of a.trend) body.push([monthLabel(t.month), R(m(t.spend), { bold: t.month === a.month }), R(String(t.purchases)), R(String(t.items_bought)), R(m(t.out_value)), R(String(t.issues)), R(String(t.items_issued))]);
    content.push(tableBlock(body, ["*", 90, 60, 70, 90, 60, 70]));
  }

  // 6. Counts
  content.push({ text: "6. Physical stock counts: discrepancies and adjustments", style: "h2" });
  {
    const body: Cell[][] = [[h("Count"), h("Item"), h("System", true), h("Counted", true), h("Difference", true), h("Value", true), h("Status"), h("Counted by"), h("Approved / rejected by"), h("Adjustment")]];
    for (const x of a.counts) {
      const d = Number(x.difference);
      body.push([x.count_no, x.item_name, R(`${formatQty(x.system_qty)} ${x.unit}`), R(`${formatQty(x.counted_qty)} ${x.unit}`),
        R(`${d > 0 ? "+" : ""}${formatQty(x.difference)}`, { color: d < 0 ? "#B42318" : d > 0 ? "#1D4ED8" : "#1a1a1a", bold: d !== 0 }), R(m(x.value_difference)),
        x.status, x.counted_by ?? "-", x.decided_by ? `${x.decided_by}${x.decided_at ? `, ${formatDateTime(x.decided_at, s.timezone)}` : ""}` : "-", x.txn_no ?? "-"]);
    }
    if (!a.counts.length) body.push(none(10, "No physical counts were recorded this month."));
    content.push(tableBlock(body, [44, "*", 58, 58, 54, 62, 46, 70, 120, 56]));
  }

  // 7. Low stock and damaged / expired
  content.push({ text: "7. Low stock and damaged, expired or wasted stock", style: "h2" });
  {
    const low: Cell[][] = [[h("Item"), h("Closing", true), h("Minimum", true), h("Status")]];
    for (const b of a.report.lowStock) low.push([b.name, R(`${formatQty(b.closing_qty)} ${b.unit}`), R(`${formatQty(b.min_stock_level)} ${b.unit}`), { text: statusText(b.status), bold: true, color: b.status === "out" ? "#B91C1C" : "#555555" }]);
    if (!a.report.lowStock.length) low.push(none(4, "No items low or out of stock."));
    const lossRows = a.report.stockOut.filter((t) => ["damage", "expiry", "wastage"].includes(t.reason ?? "") && !t.reversed_by_txn_no);
    const loss: Cell[][] = [[h("Date"), h("Item"), h("Reason"), h("Qty", true), h("Value", true)]];
    for (const t of lossRows) loss.push([formatDateTime(t.occurred_at, s.timezone), t.item_name, reasonLabel(t.reason), R(`${formatQty(t.entered_quantity)} ${t.entered_unit_symbol}`), R(m(t.total_value))]);
    if (!lossRows.length) loss.push(none(5, "None recorded."));
    content.push({ columns: [tableBlock(low, ["*", 64, 64, 64]), tableBlock(loss, [70, "*", 50, 54, 60])], columnGap: 14 });
  }

  content.push({ text: "Method", style: "h2" });
  content.push({
    ul: [
      "Values use the perpetual weighted-average cost recorded on each movement. Closing = opening + stock in − stock out ± corrections.",
      "Purchase prices are compared per base unit of each item. \"Average (weighted)\" = amount spent ÷ quantity bought.",
      "Reversed (cancelled) entries are left out of purchase, issue and price figures. Historical entries are never edited.",
    ],
    fontSize: 7.5, color: "#444",
  });
  content.push({
    margin: [0, 26, 0, 0],
    columns: [
      { stack: [{ text: a.generatedBy, bold: true }, { canvas: [{ type: "line", x1: 0, y1: 2, x2: 200, y2: 2, lineWidth: 0.7 }] }, { text: "Prepared by", fontSize: 7.5, color: "#555" }] },
      { stack: [{ text: " " }, { canvas: [{ type: "line", x1: 0, y1: 2, x2: 200, y2: 2, lineWidth: 0.7 }] }, { text: "Reviewed / approved by (name, signature, date)", fontSize: 7.5, color: "#555" }] },
    ],
    columnGap: 60,
  });

  return renderPdf({
    pageSize: "A4", pageOrientation: "landscape", pageMargins: [36, 36, 36, 40],
    info: { title: `${s.store_name}: Monthly Audit Report, ${a.label}`, author: s.store_name },
    defaultStyle: { fontSize: 8, color: "#111" },
    styles: {
      brand: { fontSize: 20, bold: true, color: BURGUNDY }, title: { fontSize: 12, bold: true, margin: [0, 2, 0, 0] },
      h2: { fontSize: 11, bold: true, color: BURGUNDY, margin: [0, 14, 0, 5] }, th: { bold: true, color: "#FFFFFF", fillColor: BURGUNDY, fontSize: 7.5 },
    },
    content,
    footer: (page: number, pages: number) => ({
      columns: [{ text: `${s.store_name} · Monthly Audit Report · ${a.label}`, color: "#777" }, { text: `Page ${page} of ${pages}`, alignment: "right", color: "#777" }],
      margin: [36, 12, 36, 0], fontSize: 7,
    }),
  });
}

export async function auditReportXlsx(a: AuditReportData): Promise<Buffer> {
  const s = a.settings;
  const wb = new ExcelJS.Workbook();
  wb.creator = s.store_name;
  const money = `"${s.currency_symbol}"#,##0.00`;
  const cost = `"${s.currency_symbol}"#,##0.00##`;
  const qty = "#,##0.######";
  const sheet = (name: string, cols: [string, number, string?][], rows: unknown[][], note?: string) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = cols.map(([header, width, fmt]) => ({ header, width, style: fmt ? { numFmt: fmt } : {} }));
    ws.getRow(1).eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "ff111111" } }; c.alignment = { wrapText: true, vertical: "middle" }; });
    ws.getRow(1).height = 24;
    rows.forEach((r) => ws.addRow(r));
    if (!rows.length) ws.addRow(["No records for this month"]).font = { italic: true, color: { argb: "FF666666" } };
    if (note) { ws.addRow([]); ws.addRow([note]).font = { italic: true, size: 9, color: { argb: "FF666666" } }; }
    return ws;
  };
  const sm = a.summary, rs = a.report.summary;
  const sumWs = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
  sumWs.columns = [{ width: 40 }, { width: 30 }];
  sumWs.addRow([s.store_name]).font = { bold: true, size: 18, color: { argb: "ff111111" } };
  sumWs.addRow(["Monthly Audit Report"]).font = { bold: true, size: 13 };
  const rows: [string, unknown, string?][] = [
    ["Reporting period", `${a.label} (${a.report.params.from} to ${a.report.params.to})`],
    ["Generated", formatDateTime(a.generatedAt, s.timezone)], ["Prepared by", a.generatedBy], ["Currency", `${s.currency_code} (${s.currency_symbol})`],
    ["Valuation", "Weighted-average cost (perpetual)"], ["", ""],
    ["Opening inventory value", Number(rs.opening_value), money], ["Closing inventory value", Number(rs.closing_value), money],
    ["Amount spent on purchases", Number(sm.stockIn.spend), money], ["Purchase receipts", sm.stockIn.receipts],
    ["Value of stock issued", Number(sm.stockOut.value), money], ["Stock-out transactions", sm.stockOut.issues],
    ["Items with price increases", sm.priceUp], ["Items with price decreases", sm.priceDown],
    ["Low stock items (month end)", a.report.stockStatus.low], ["Out of stock items (month end)", a.report.stockStatus.out],
    ["Count shortages (approved)", -Number(sm.counts.shortage), money], ["Count excesses (approved)", Number(sm.counts.excess), money], ["Counts pending approval", sm.counts.pending],
  ];
  for (const [l, v, f] of rows) { const r = sumWs.addRow([l, v]); if (f) r.getCell(2).numFmt = f; r.getCell(2).alignment = { horizontal: "left" }; }
  sumWs.addRow([]);
  sumWs.addRow(["Reviewed / approved by:", ""]);
  sumWs.addRow(["Signature and date:", ""]);

  sheet("Balances", [["S/N", 6], ["Item", 30], ["Code", 12], ["Unit", 8], ["Opening", 12, qty], ["Stock in", 12, qty], ["Cost of stock in", 16, money], ["Stock out", 12, qty], ["Cost of stock out", 16, money], ["Corrections", 12, qty], ["Closing", 12, qty], ["Closing value", 16, money], ["Status", 13]],
    a.report.balances.map((b, i) => [i + 1, b.name, b.sku, b.unit, Number(b.opening_qty), Number(b.in_qty), Number(b.in_value), Number(b.out_qty), Number(b.out_value), Number(b.adj_qty), Number(b.closing_qty), Number(b.closing_value), statusText(b.status)]));
  sheet("Most Purchased", [["Rank", 6], ["Item", 30], ["Code", 12], ["Qty bought", 13, qty], ["Unit", 8], ["Purchases", 11], ["Days restocked", 14], ["Avg price (weighted)", 18, cost], ["Amount spent", 16, money]],
    a.purchases.map((p, i) => [i + 1, p.name, p.sku, Number(p.qty), p.unit, p.purchases, p.restock_days, Number(p.avg_price), Number(p.spend)]),
    "Ranked by amount spent. Quantities only compare between items with the same unit.");
  sheet("Stock Out", [["Rank", 6], ["Item", 30], ["Code", 12], ["Qty out", 12, qty], ["Unit", 8], ["Issues", 9], ["Value issued", 16, money], ["Share of available %", 18], ["Reasons", 40]],
    a.issues.map((x, i) => [i + 1, x.name, x.sku, Number(x.out_qty), x.unit, x.issues, Number(x.out_value), x.turnover ? Number(x.turnover) : null, x.reasons.map((y) => `${reasonLabel(y.reason)} ${y.count}×`).join(", ")]));
  sheet("Price Changes", [["Item", 30], ["Per", 8], ["Previous price", 15, cost], ["Latest price", 15, cost], ["Change", 13, cost], ["Change %", 11], ["Highest", 14, cost], ["Lowest", 14, cost], ["Average (weighted)", 17, cost], ["Average (simple)", 16, cost], ["Purchases", 11], ["Qty bought", 12, qty], ["Amount spent", 15, money], ["Suppliers", 26]],
    a.prices.map((p) => [p.name, p.unit, p.previous, p.latest, p.change, p.changePct, p.high, p.low, p.avgWeighted, p.avgSimple, p.points.length, p.qty, p.spend, p.suppliers.join(", ")]),
    "Prices per base unit. Previous = the purchase before the latest one.");
  const hist: unknown[][] = [];
  for (const p of a.prices) for (const pt of p.points) hist.push([p.name, formatDateTime(pt.at, s.timezone), pt.price, p.unit, pt.qty, pt.spend, pt.supplier, pt.entered]);
  sheet("Price History", [["Item", 30], ["Date", 19], ["Price per unit", 15, cost], ["Unit", 8], ["Qty", 12, qty], ["Amount", 15, money], ["Supplier", 22], ["As entered", 28]], hist);
  sheet("Monthly Trend", [["Month", 16], ["Amount spent", 16, money], ["Purchases", 11], ["Items bought", 13], ["Value issued", 16, money], ["Issues", 9], ["Items issued", 13]],
    a.trend.map((t) => [monthLabel(t.month), Number(t.spend), t.purchases, t.items_bought, Number(t.out_value), t.issues, t.items_issued]));
  sheet("Stock Counts", [["Count", 11], ["Date", 19], ["Item", 28], ["Unit", 8], ["System", 12, qty], ["Counted", 12, qty], ["Difference", 12, qty], ["Value", 14, money], ["Status", 11], ["Counted by", 16], ["Decided by", 16], ["Decided at", 19], ["Note", 26], ["Adjustment", 12]],
    a.counts.map((x) => [x.count_no, formatDateTime(x.counted_at, s.timezone), x.item_name, x.unit, Number(x.system_qty), Number(x.counted_qty), Number(x.difference), Number(x.value_difference), x.status, x.counted_by, x.decided_by, x.decided_at ? formatDateTime(x.decided_at, s.timezone) : null, x.decision_note ?? x.notes, x.txn_no]));
  sheet("Low Stock", [["Item", 30], ["Unit", 8], ["Closing", 12, qty], ["Minimum", 12, qty], ["Status", 14]],
    a.report.lowStock.map((b) => [b.name, b.unit, Number(b.closing_qty), Number(b.min_stock_level), statusText(b.status)]));
  sheet("Damaged & Expired", [["Date", 19], ["Item", 28], ["Reason", 12], ["Qty", 12, qty], ["Unit", 8], ["Value", 14, money], ["Notes", 30]],
    a.report.stockOut.filter((t) => ["damage", "expiry", "wastage"].includes(t.reason ?? "") && !t.reversed_by_txn_no)
      .map((t) => [formatDateTime(t.occurred_at, s.timezone), t.item_name, reasonLabel(t.reason), Number(t.entered_quantity), t.entered_unit_symbol, Number(t.total_value), t.notes]));
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

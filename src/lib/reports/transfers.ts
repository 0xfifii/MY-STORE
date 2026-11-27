import "server-only";
import ExcelJS from "exceljs";
import { query } from "../db";
import { addDays, formatDate, formatDateTime, formatMoney, formatQty, plainQty, todayIn } from "../format";
import type { StoreSettings } from "../settings";
import { renderPdf, tableBlock } from "./pdf";
import { reportBrand } from "./logo";

/*
 * Transfer report: what this business sent to, and received from, other businesses over a period
 * (for Palmspring that's what went to Palmbite and came back, and the other way round).
 * Built from the transfer records, which both businesses can see; each side sees only its own.
 */

export type TransferDirection = "all" | "sent" | "received";
export type TransferReportParams = { from: string; to: string; direction: TransferDirection; preset?: string };

export type TransferReportLine = {
  transfer_no: string; occurred_at: string; direction: "sent" | "received"; other: string; by: string | null; notes: string | null;
  name: string; sku: string; quantity: string; unit_symbol: string; unit_cost: string; total_value: string;
};
export type TransferItemTotal = {
  name: string; sku: string; unit_symbol: string;
  sent_qty: number; sent_value: number; received_qty: number; received_value: number;
};
export type TransferReport = {
  params: TransferReportParams; periodLabel: string; storeName: string; generatedAt: string;
  lines: TransferReportLine[]; items: TransferItemTotal[];
  totals: { transfers: number; sent_value: number; received_value: number; sent_lines: number; received_lines: number };
  partners: string[];
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Turns ?preset=today|yesterday|week|month|last_month or ?from&to into a period. */
export function transferParams(sp: URLSearchParams, tz: string): TransferReportParams {
  const today = todayIn(tz);
  const preset = sp.get("preset") ?? "";
  let from = sp.get("from") ?? "";
  let to = sp.get("to") ?? "";
  if (preset === "today" || (!from && !to && !preset)) { from = today; to = today; }
  else if (preset === "yesterday") { from = to = addDays(today, -1); }
  else if (preset === "week") { from = addDays(today, -6); to = today; }
  else if (preset === "month") { from = `${today.slice(0, 8)}01`; to = today; }
  else if (preset === "last_month") {
    const first = `${today.slice(0, 8)}01`;
    to = addDays(first, -1);
    from = `${to.slice(0, 8)}01`;
  }
  if (!ISO.test(from)) from = today;
  if (!ISO.test(to)) to = from;
  if (to < from) [from, to] = [to, from];
  const d = sp.get("direction");
  const direction: TransferDirection = d === "sent" || d === "received" ? d : "all";
  return { from, to, direction, preset: preset || undefined };
}

export async function buildTransferReport(p: TransferReportParams, settings: StoreSettings, storeId: number): Promise<TransferReport> {
  const tz = settings.timezone;
  const rows = await query<{
    transfer_no: string; occurred_at: string; from_store: number; from_name: string; to_name: string;
    created_by_name: string | null; notes: string | null; line: Record<string, string>;
  }>(
    `SELECT t.transfer_no, t.occurred_at::text, t.from_store, t.from_name, t.to_name, t.created_by_name, t.notes, l AS line
       FROM stock_transfers t CROSS JOIN LATERAL jsonb_array_elements(t.lines) l
      WHERE (t.occurred_at AT TIME ZONE $1)::date BETWEEN $2::date AND $3::date
      ORDER BY t.occurred_at, t.id`,
    [tz, p.from, p.to],
  );
  const lines: TransferReportLine[] = [];
  for (const r of rows) {
    const direction = r.from_store === storeId ? "sent" : "received";
    if (p.direction !== "all" && p.direction !== direction) continue;
    lines.push({
      transfer_no: r.transfer_no, occurred_at: r.occurred_at, direction,
      other: direction === "sent" ? r.to_name : r.from_name, by: r.created_by_name, notes: r.notes,
      name: r.line.name, sku: r.line.sku ?? "", quantity: String(r.line.quantity), unit_symbol: r.line.unit_symbol,
      unit_cost: String(r.line.unit_cost ?? "0"), total_value: String(r.line.total_value ?? "0"),
    });
  }
  const byItem = new Map<string, TransferItemTotal>();
  for (const l of lines) {
    const key = `${l.name.toLowerCase()}|${l.unit_symbol}`;
    const t = byItem.get(key) ?? { name: l.name, sku: l.sku, unit_symbol: l.unit_symbol, sent_qty: 0, sent_value: 0, received_qty: 0, received_value: 0 };
    if (l.direction === "sent") { t.sent_qty += Number(l.quantity); t.sent_value += Number(l.total_value); }
    else { t.received_qty += Number(l.quantity); t.received_value += Number(l.total_value); }
    byItem.set(key, t);
  }
  const items = [...byItem.values()].sort((a, b) => (b.sent_value + b.received_value) - (a.sent_value + a.received_value) || a.name.localeCompare(b.name));
  const sent = lines.filter((l) => l.direction === "sent");
  const received = lines.filter((l) => l.direction === "received");
  return {
    params: p,
    periodLabel: p.from === p.to ? formatDate(`${p.from}T12:00:00Z`, "UTC") : `${formatDate(`${p.from}T12:00:00Z`, "UTC")} to ${formatDate(`${p.to}T12:00:00Z`, "UTC")}`,
    storeName: settings.store_name,
    generatedAt: new Date().toISOString(),
    lines, items,
    totals: {
      transfers: new Set(lines.map((l) => l.transfer_no)).size,
      sent_value: sent.reduce((a, l) => a + Number(l.total_value), 0),
      received_value: received.reduce((a, l) => a + Number(l.total_value), 0),
      sent_lines: sent.length, received_lines: received.length,
    },
    partners: [...new Set(lines.map((l) => l.other))].sort(),
  };
}

const ORANGE = "#C65A29";
const dirTitle = (d: TransferDirection) => (d === "sent" ? "Items Sent" : d === "received" ? "Items Received" : "Transfer Report");

export function transferFileName(r: TransferReport, ext: string) {
  const period = r.params.from === r.params.to ? r.params.from : `${r.params.from}_to_${r.params.to}`;
  const what = r.params.direction === "all" ? "transfers" : `transfers-${r.params.direction}`;
  return `palm-store-${what}-${period}.${ext}`;
}

export async function transferReportPdf(r: TransferReport, s: StoreSettings): Promise<Buffer> {
  const sym = s.currency_symbol;
  const m = (v: number | string) => formatMoney(v, sym);
  const th = (t: string, alignment = "left") => ({ text: t, style: "th", alignment });
  const content: unknown[] = [];
  content.push({
    columns: [
      [...reportBrand(r.storeName, 150), { text: dirTitle(r.params.direction), style: "title" },
        { text: r.partners.length ? `Between ${r.storeName} and ${r.partners.join(", ")}` : "Stock moved between accounts", fontSize: 8, color: "#666", margin: [0, 2, 0, 0] }],
      {
        width: "auto",
        stack: [
          { text: r.periodLabel, alignment: "right", bold: true, fontSize: 10 },
          { text: `Generated ${formatDateTime(r.generatedAt, s.timezone)}`, alignment: "right", color: "#666" },
          { text: `${s.currency_code} (${sym}) · value at average cost`, alignment: "right", color: "#666" },
        ],
        fontSize: 8,
      },
    ],
  });
  content.push({ canvas: [{ type: "line", x1: 0, y1: 6, x2: 523, y2: 6, lineWidth: 2.5, lineColor: ORANGE }], margin: [0, 0, 0, 12] });

  const card = (label: string, value: string, dark = false) => ({
    stack: [
      { text: label.toUpperCase(), fontSize: 6.5, bold: true, color: dark ? "#FBE3D3" : "#666" },
      { text: value, fontSize: 12, bold: true, color: dark ? "#FFFFFF" : ORANGE, margin: [0, 3, 0, 0] },
    ],
    fillColor: dark ? ORANGE : "#F6F3F0", margin: [8, 7, 8, 7],
  });
  const cards = [card("Transfers", String(r.totals.transfers))];
  if (r.params.direction !== "received") cards.push(card("Value sent", m(r.totals.sent_value), r.params.direction === "sent"));
  if (r.params.direction !== "sent") cards.push(card("Value received", m(r.totals.received_value), r.params.direction === "received"));
  if (r.params.direction === "all") cards.push(card("Items", String(r.items.length)));
  content.push({ table: { widths: cards.map(() => "*"), body: [cards] }, layout: { hLineWidth: () => 0, vLineWidth: () => 3, vLineColor: () => "#FFFFFF" } });

  if (!r.lines.length) {
    content.push({ text: "No transfers in this period.", margin: [0, 18, 0, 0], color: "#666" });
  } else {
    // Totals by item
    content.push({ text: "Totals by item", style: "h2" });
    const showSent = r.params.direction !== "received";
    const showRec = r.params.direction !== "sent";
    const head = [th("S/N"), th("Item"), ...(showSent ? [th("Qty sent", "right"), th("Value sent", "right")] : []),
      ...(showRec ? [th("Qty received", "right"), th("Value received", "right")] : [])];
    const body: unknown[][] = [head];
    r.items.forEach((it, i) => body.push([
      String(i + 1), { stack: [{ text: it.name, bold: true }, ...(it.sku ? [{ text: it.sku, fontSize: 6.5, color: "#888" }] : [])] },
      ...(showSent ? [{ text: it.sent_qty ? `${formatQty(it.sent_qty)} ${it.unit_symbol}` : "-", alignment: "right" }, { text: it.sent_value ? m(it.sent_value) : "-", alignment: "right" }] : []),
      ...(showRec ? [{ text: it.received_qty ? `${formatQty(it.received_qty)} ${it.unit_symbol}` : "-", alignment: "right" }, { text: it.received_value ? m(it.received_value) : "-", alignment: "right" }] : []),
    ]));
    body.push([{ text: "", }, { text: "Total", bold: true },
      ...(showSent ? [{ text: "" }, { text: m(r.totals.sent_value), bold: true, alignment: "right", color: ORANGE }] : []),
      ...(showRec ? [{ text: "" }, { text: m(r.totals.received_value), bold: true, alignment: "right", color: ORANGE }] : [])]);
    content.push(tableBlock(body as never, [20, "*", ...(showSent ? [60, 70] : []), ...(showRec ? [62, 74] : [])]));

    // Every transfer line
    content.push({ text: "Every transfer", style: "h2" });
    const b2: unknown[][] = [[th("Date"), th("No."), th("Sent / received"), th("Item"), th("Qty", "right"), th("Value", "right")]];
    for (const l of r.lines) {
      b2.push([
        formatDateTime(l.occurred_at, s.timezone), l.transfer_no,
        { text: l.direction === "sent" ? `Sent to ${l.other}` : `From ${l.other}`, color: l.direction === "sent" ? ORANGE : "#2F7D4F", bold: true },
        { stack: [{ text: l.name }, ...(l.by || l.notes ? [{ text: [l.by ? `by ${l.by}` : "", l.notes ?? ""].filter(Boolean).join(" · "), fontSize: 6.5, color: "#888" }] : [])] },
        { text: `${formatQty(l.quantity)} ${l.unit_symbol}`, alignment: "right" },
        { text: m(l.total_value), alignment: "right" },
      ]);
    }
    content.push(tableBlock(b2 as never, [78, 52, 92, "*", 56, 64]));
  }

  return renderPdf({
    pageSize: "A4",
    pageMargins: [36, 36, 36, 40],
    info: { title: `${r.storeName}: ${dirTitle(r.params.direction)}, ${r.periodLabel}`, author: r.storeName },
    defaultStyle: { fontSize: 8, color: "#2B2B2B" },
    styles: {
      title: { fontSize: 13, bold: true, margin: [0, 2, 0, 0] },
      h2: { fontSize: 11, bold: true, color: ORANGE, margin: [0, 16, 0, 6] },
      th: { bold: true, color: "#FFFFFF", fillColor: ORANGE, fontSize: 7.5 },
    },
    content,
    footer: (page: number, pages: number) => ({
      columns: [
        { text: `${r.storeName} · ${dirTitle(r.params.direction)} · ${r.periodLabel}`, color: "#777" },
        { text: `Page ${page} of ${pages}`, alignment: "right", color: "#777" },
      ],
      margin: [36, 12, 36, 0], fontSize: 7,
    }),
  });
}

export async function transferReportXlsx(r: TransferReport, s: StoreSettings): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = r.storeName;
  const money = `"${s.currency_symbol}"#,##0.00`;
  const head = (row: ExcelJS.Row) => { row.font = { bold: true, color: { argb: "FFFFFFFF" } }; row.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC65A29" } }; }); };

  const a = wb.addWorksheet("By item", { views: [{ showGridLines: false }] });
  a.columns = [{ width: 34 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 18 }];
  a.addRow([`${r.storeName}: ${dirTitle(r.params.direction)}`]).font = { bold: true, size: 15, color: { argb: "FFC65A29" } };
  a.addRow(["Period", r.periodLabel]);
  a.addRow(["Transfers", r.totals.transfers]);
  a.addRow(["Value sent", r.totals.sent_value]).getCell(2).numFmt = money;
  a.addRow(["Value received", r.totals.received_value]).getCell(2).numFmt = money;
  a.addRow([]);
  head(a.addRow(["Item", "Code", "Unit", "Qty sent", "Value sent", "Qty received", "Value received"]));
  for (const it of r.items) {
    const row = a.addRow([it.name, it.sku, it.unit_symbol, it.sent_qty, it.sent_value, it.received_qty, it.received_value]);
    row.getCell(5).numFmt = money; row.getCell(7).numFmt = money;
  }

  const b = wb.addWorksheet("Every transfer", { views: [{ state: "frozen", ySplit: 1 }] });
  b.columns = [{ width: 20 }, { width: 11 }, { width: 11 }, { width: 24 }, { width: 30 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 14 }, { width: 16 }, { width: 18 }, { width: 28 }];
  head(b.addRow(["Date", "Transfer", "Direction", "Other account", "Item", "Code", "Quantity", "Unit", "Unit cost", "Value", "By", "Note"]));
  for (const l of r.lines) {
    const row = b.addRow([formatDateTime(l.occurred_at, s.timezone), l.transfer_no, l.direction === "sent" ? "Sent" : "Received", l.other, l.name, l.sku,
      Number(l.quantity), l.unit_symbol, Number(l.unit_cost), Number(l.total_value), l.by ?? "", l.notes ?? ""]);
    row.getCell(9).numFmt = `"${s.currency_symbol}"#,##0.00##`; row.getCell(10).numFmt = money;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function transferReportCsv(r: TransferReport, s: StoreSettings): Buffer {
  const cell = (v: unknown) => { const t = v === null || v === undefined ? "" : String(v); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const lines: unknown[][] = [
    [`${r.storeName}: ${dirTitle(r.params.direction)}`], ["Period", r.periodLabel], ["Currency", s.currency_code], [],
    ["Date", "Transfer", "Direction", "Other account", "Item", "Code", "Quantity", "Unit", "Unit cost", "Value", "By", "Note"],
    ...r.lines.map((l) => [formatDateTime(l.occurred_at, s.timezone), l.transfer_no, l.direction === "sent" ? "Sent" : "Received", l.other, l.name, l.sku,
      plainQty(l.quantity), l.unit_symbol, Number(l.unit_cost).toFixed(4), Number(l.total_value).toFixed(2), l.by ?? "", l.notes ?? ""]),
    [], ["Value sent", r.totals.sent_value.toFixed(2)], ["Value received", r.totals.received_value.toFixed(2)],
  ];
  return Buffer.from("﻿" + lines.map((l) => l.map(cell).join(",")).join("\r\n"), "utf8");
}

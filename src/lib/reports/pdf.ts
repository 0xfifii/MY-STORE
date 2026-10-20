import { join } from "node:path";
import type { ReportData } from "./engine";
import { sectionsFor } from "./engine";
import { formatDateTime, formatMoney, formatQty, formatUnitCost, reasonLabel } from "../format";
import { statusText } from "./csv";

// pdfmake 0.2 server-side printer (CommonJS).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require("pdfmake");

const BURGUNDY = "#7A1F35";
const fontDir = join(process.cwd(), "assets", "fonts");
export const PDF_FONTS = {
  DMSans: {
    normal: join(fontDir, "DMSans-Regular.ttf"),
    bold: join(fontDir, "DMSans-Bold.ttf"),
    italics: join(fontDir, "DMSans-Regular.ttf"),
    bolditalics: join(fontDir, "DMSans-Bold.ttf"),
  },
};

type Cell = Record<string, unknown> | string;

export async function reportToPdf(r: ReportData): Promise<Buffer> {
  const sym = r.settings.currency_symbol;
  const tz = r.settings.timezone;
  const m = (v: string | number) => formatMoney(v, sym);
  const c = (v: string | number) => formatUnitCost(v, sym);
  const sec = sectionsFor(r.params.kind);
  const content: unknown[] = [];

  // Header block
  content.push({
    columns: [
      [
        { text: r.settings.store_name, style: "brand" },
        { text: r.title, style: "title" },
      ],
      {
        width: "auto",
        stack: [
          { text: `Period: ${r.periodLabel}`, alignment: "right", bold: true },
          ...(r.scopeLabel ? [{ text: r.scopeLabel, alignment: "right" }] : []),
          { text: `Generated: ${formatDateTime(r.generatedAt, tz)}`, alignment: "right", color: "#555" },
          { text: `Currency: ${r.settings.currency_code} (${sym}) · Weighted-average cost`, alignment: "right", color: "#555" },
        ],
        fontSize: 9,
      },
    ],
  });
  content.push({ canvas: [{ type: "line", x1: 0, y1: 6, x2: 770, y2: 6, lineWidth: 2, lineColor: BURGUNDY }], margin: [0, 0, 0, 12] });

  // Summary cards
  const card = (label: string, value: string, strong = false) => ({
    stack: [
      { text: label.toUpperCase(), fontSize: 7, color: "#666", bold: true },
      { text: value, fontSize: strong ? 13 : 12, bold: true, color: strong ? BURGUNDY : "#111", margin: [0, 3, 0, 0] },
    ],
    margin: [8, 7, 8, 7],
  });
  const net = Number(r.summary.closing_value) - Number(r.summary.opening_value);
  const st = r.stockStatus;
  const cards: unknown[] = [
    card("Total stock value", m(r.summary.closing_value), true),
    card("Opening value", m(r.summary.opening_value)),
    card("Cost of stock in", m(r.summary.in_value)),
    card("Cost of stock out", m(r.summary.out_value)),
  ];
  if (r.summary.adj_count) cards.push(card("Net corrections", m(r.summary.adj_value)));
  cards.push(card("Net change", `${net >= 0 ? "+" : "−"}${m(Math.abs(net))}`));
  cards.push(card("Low · out of stock", `${st.low} · ${st.out}`));
  content.push({
    table: { widths: cards.map(() => "*"), body: [cards] },
    layout: { hLineColor: "#E5D5DA", vLineColor: "#E5D5DA", fillColor: () => "#FBF6F7" },
  });
  content.push({
    text: [
      { text: `${r.summary.in_count}`, bold: true }, " stock-in transactions  ·  ",
      { text: `${r.summary.out_count}`, bold: true }, " stock-out transactions  ·  ",
      ...(r.summary.adj_count ? [{ text: `${r.summary.adj_count}`, bold: true }, " corrections  ·  "] : []),
      { text: `${r.summary.items_moved}`, bold: true }, " unique items received or issued",
    ],
    fontSize: 9, margin: [0, 6, 0, 0], color: "#333",
  });

  const h = (t: string, align: "left" | "right" = "left"): Cell => ({ text: t, style: "th", alignment: align });
  const right = (t: string, extra: Record<string, unknown> = {}): Cell => ({ text: t, alignment: "right", ...extra });
  const empty = (cols: number, msg: string) => [[{ text: msg, colSpan: cols, italics: true, color: "#777" }, ...Array(cols - 1).fill("")]];

  type Line = { name: string; sku: string; unit: string; opening: string; in: string; in_value: string; out: string; out_value: string; adj: string; closing: string; worth?: string; status?: "in_stock" | "low" | "out" };
  const combined = (rows: Line[], adj: boolean, withWorth: boolean) => {
    const body: Cell[][] = [[h("S/N"), h("Item name"), h("Unit"), h("Opening stock", "right"), h("Stock in", "right"), h("Cost of stock in", "right"),
      h("Stock out", "right"), h("Cost of stock out", "right"), ...(adj ? [h("Corrections", "right")] : []), h("Closing (Bal)", "right"),
      ...(withWorth ? [h("Closing worth", "right"), h("Status")] : [])]];
    let tin = 0, tout = 0, tw = 0;
    rows.forEach((b, i) => {
      tin += Number(b.in_value); tout += Number(b.out_value); tw += Number(b.worth ?? 0);
      body.push([String(i + 1), `${b.name}  (${b.sku})`, b.unit, right(formatQty(b.opening)),
        right(Number(b.in) ? `+${formatQty(b.in)}` : "0", { color: "#166534" }), right(Number(b.in_value) ? m(b.in_value) : "—"),
        right(Number(b.out) ? `−${formatQty(b.out)}` : "0", { color: BURGUNDY }), right(Number(b.out_value) ? m(b.out_value) : "—"),
        ...(adj ? [right(formatQty(b.adj))] : []), right(formatQty(b.closing), { bold: true }),
        ...(withWorth ? [right(m(b.worth ?? 0)), { text: statusText(b.status ?? "in_stock"), color: b.status === "out" ? "#B91C1C" : b.status === "low" ? "#B45309" : "#166534", bold: b.status !== "in_stock" }] : [])]);
    });
    const cols = body[0].length;
    if (!rows.length) body.push(...empty(cols, "No items."));
    body.push([{ text: "Total", bold: true, colSpan: 5, alignment: "right" }, "", "", "", "", right(m(tin), { bold: true }), "", right(m(tout), { bold: true }),
      ...(adj ? [""] : []), "", ...(withWorth ? [right(m(tw), { bold: true }), ""] : [])]);
    const widths: (number | string)[] = [20, "*", 30, 54, 46, 62, 46, 62, ...(adj ? [46] : []), 58, ...(withWorth ? [64, 52] : [])];
    return tableBlock(body, widths);
  };

  // ---- Stock sheet first: opening, stock in + cost, stock out + cost, closing — one table
  if (sec.balances) {
    content.push({ text: r.periodType === "day" ? "Stock sheet" : "Stock sheet — whole period", style: "h2" });
    content.push({ text: "Opening stock, stock in, stock out and their cost in one table. Each closing balance (Bal) is the next day's opening stock.", fontSize: 8, color: "#555", margin: [0, -2, 0, 6] });
    content.push(combined(r.balances.map((b) => ({
      name: b.name, sku: b.sku, unit: b.unit, opening: b.opening_qty, in: b.in_qty, in_value: b.in_value, out: b.out_qty, out_value: b.out_value,
      adj: b.adj_qty, closing: b.closing_qty, worth: b.closing_value, status: b.status,
    })), r.summary.adj_count > 0, true));

    // Day-by-day blocks for short periods (the Excel file always has every day).
    if (r.days.length > 1 && r.days.length <= 7) {
      for (const d of r.days) {
        content.push({ text: new Date(d.day + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }), style: "h3" });
        content.push(combined(d.rows, d.rows.some((x) => x.adj !== "0"), false));
      }
    } else if (r.days.length > 7) {
      content.push({ text: "The day-by-day stock sheet for every day in this period is in the Excel download (Stock Sheet tab).", fontSize: 8, italics: true, color: "#555", margin: [0, 6, 0, 0] });
    }
  }

  if (r.byCategory.length) {
    content.push({ text: "Total stock by category", style: "h2" });
    const body: Cell[][] = [[h("Category"), h("Items", "right"), h("Opening value", "right"), h("Cost of stock in", "right"), h("Cost of stock out", "right"), h("Total stock value", "right")]];
    for (const c of r.byCategory) body.push([c.category, right(String(c.items)), right(m(c.opening_value)), right(m(c.in_value)), right(m(c.out_value)), right(m(c.closing_value), { bold: true })]);
    body.push([{ text: "Total", bold: true }, right(String(r.byCategory.reduce((a, c) => a + c.items, 0)), { bold: true }), right(m(r.summary.opening_value), { bold: true }),
      right(m(r.summary.in_value), { bold: true }), right(m(r.summary.out_value), { bold: true }), right(m(r.summary.closing_value), { bold: true })]);
    content.push(tableBlock(body, ["*", 50, 90, 90, 90, 100]));
  }

  if (r.byWorker.length && sec.stockOut) {
    content.push({ text: "Stock taken by worker", style: "h2" });
    const wb: Cell[][] = [[h("S/N"), h("Worker"), h("Times taken", "right"), h("Different items", "right"), h("Value taken", "right")]];
    r.byWorker.forEach((w, i) => wb.push([String(i + 1), w.name, right(String(w.takes)), right(String(w.items)), right(m(w.value))]));
    content.push(tableBlock(wb, [24, "*", 80, 90, 100]));
  }

  if (sec.stockIn || sec.stockOut) {
    content.push({ text: sec.stockIn && sec.stockOut ? "Stock in and stock out" : sec.stockIn ? "Stock in" : "Stock out", style: "h2" });
    const body: Cell[][] = [[h("Txn"), h("Date & time"), h("Type"), h("Item"), h("Quantity", "right"), h("Cost / unit", "right"),
      ...(sec.stockIn ? [h("Cost of stock in", "right")] : []), ...(sec.stockOut ? [h("Cost of stock out", "right")] : []),
      h("Supplier / taken by"), h("Reference / notes")]];
    for (const t of r.movements) {
      const isIn = t.txn_type === "stock_in";
      body.push([t.txn_no, formatDateTime(t.occurred_at, tz), { text: isIn ? "In" : "Out", bold: true, color: isIn ? "#166534" : BURGUNDY }, `${t.item_name} (${t.item_sku})`,
        right(`${isIn ? "+" : "−"}${formatQty(t.entered_quantity)} ${t.entered_unit_symbol}`), right(c(t.entered_unit_cost)),
        ...(sec.stockIn ? [right(isIn ? m(t.total_value) : "")] : []), ...(sec.stockOut ? [right(!isIn ? m(t.total_value) : "")] : []),
        isIn ? (t.is_opening ? "Opening stock" : t.supplier_label ?? "") : [[t.worker_name, t.recipient].filter(Boolean).join(" · to "), reasonLabel(t.reason)].filter(Boolean).join(" — "),
        [t.reference, t.notes].filter(Boolean).join(" — ")]);
    }
    const cols = body[0].length;
    if (!r.movements.length) body.push(...empty(cols, "No stock moved in this period."));
    body.push([{ text: "Total", bold: true, colSpan: 6, alignment: "right" }, "", "", "", "", "",
      ...(sec.stockIn ? [right(m(r.summary.in_value), { bold: true })] : []), ...(sec.stockOut ? [right(m(r.summary.out_value), { bold: true })] : []), "", ""]);
    content.push(tableBlock(body, [50, 72, 26, "*", 60, 58, ...(sec.stockIn ? [64] : []), ...(sec.stockOut ? [64] : []), 100, 90]));
  }

  if (sec.corrections && r.corrections.length) {
    content.push({ text: "Corrections (reversals)", style: "h2" });
    const body: Cell[][] = [[h("Txn"), h("Date & time"), h("Item"), h("Reverses"), h("Stock effect", "right"), h("Value effect", "right"), h("Reason"), h("By")]];
    for (const t of r.corrections) {
      const sign = t.direction > 0 ? "+" : "−";
      body.push([t.txn_no, formatDateTime(t.occurred_at, tz), `${t.item_name} (${t.item_sku})`, t.reverses_txn_no ?? "",
        right(`${sign}${formatQty(t.quantity)} ${t.unit_symbol}`), right(`${sign}${m(t.total_value)}`), t.correction_reason ?? "", t.user_name ?? ""]);
    }
    content.push(tableBlock(body, [52, 76, "*", 52, 70, 70, 150, 60]));
  }

  if (sec.lowStock) {
    content.push({ text: "Low / out of stock at end of period", style: "h2" });
    if (!r.lowStock.length) content.push({ text: "No items are low or out of stock.", italics: true, color: "#555" });
    else {
      const body: Cell[][] = [[h("Item"), h("Code"), h("Closing balance", "right"), h("Minimum level", "right"), h("Status")]];
      for (const b of r.lowStock) {
        body.push([b.name, b.sku, right(`${formatQty(b.closing_qty)} ${b.unit}`), right(`${formatQty(b.min_stock_level)} ${b.unit}`),
          { text: statusText(b.status), bold: true, color: b.status === "out" ? "#B91C1C" : "#B45309" }]);
      }
      content.push(tableBlock(body, ["*", 70, 90, 90, 80]));
    }
  }

  if (sec.highlights) {
    content.push({ text: "Most stocked in and most stocked out", style: "h2" });
    const hl = (title: string, rows: typeof r.topIn, verb: string) => {
      const body: Cell[][] = [[h("#"), h(title), h(`Qty ${verb}`, "right"), h("Value", "right"), h("Transactions", "right")]];
      rows.forEach((x, i) => body.push([String(i + 1), { text: `${x.name} (${x.sku})`, bold: i === 0 }, right(`${formatQty(x.qty)} ${x.unit}`, { bold: i === 0 }),
        right(m(x.value), { bold: i === 0 }), right(String(x.count))]));
      if (!rows.length) body.push(...empty(5, `Nothing ${verb} in this period.`));
      return tableBlock(body, [14, "*", 70, 70, 56]);
    };
    content.push({
      columns: [hl("Most stocked in", r.topIn, "received"), hl("Most stocked out", r.topOut, "issued")],
      columnGap: 16,
    });
    content.push({ text: "Ranked by value, because items are counted in different units.", fontSize: 7, color: "#777", margin: [0, 4, 0, 0] });
  }

  const docDefinition = {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [36, 36, 36, 40],
    info: { title: `${r.settings.store_name} — ${r.title} — ${r.periodLabel}`, author: r.settings.store_name },
    defaultStyle: { font: "DMSans", fontSize: 8, color: "#111" },
    styles: {
      brand: { fontSize: 20, bold: true, color: BURGUNDY },
      title: { fontSize: 12, bold: true, margin: [0, 2, 0, 0] },
      h2: { fontSize: 11, bold: true, color: BURGUNDY, margin: [0, 16, 0, 6] },
      h3: { fontSize: 9.5, bold: true, color: "#333", margin: [0, 10, 0, 4] },
      th: { bold: true, color: "#FFFFFF", fillColor: BURGUNDY, fontSize: 8 },
    },
    content,
    footer: (page: number, pages: number) => ({
      columns: [
        { text: `${r.settings.store_name} · ${r.title} · ${r.periodLabel}`, color: "#777" },
        { text: `Page ${page} of ${pages}`, alignment: "right", color: "#777" },
      ],
      margin: [36, 12, 36, 0],
      fontSize: 7,
    }),
  };

  return renderPdf(docDefinition);
}

/** Renders a pdfmake document definition (DM Sans) to a Buffer. */
export function renderPdf(docDefinition: Record<string, unknown>): Promise<Buffer> {
  const printer = new PdfPrinter(PDF_FONTS);
  const doc = printer.createPdfKitDocument({
    ...docDefinition,
    defaultStyle: { font: "DMSans", ...(docDefinition.defaultStyle as object) },
    // Never leave a section heading alone at the bottom of a page.
    pageBreakBefore: (node: { style?: string | string[]; startPosition?: { top: number; pageInnerHeight: number } }) => {
      const st = Array.isArray(node.style) ? node.style : [node.style];
      if (!st.includes("h2") || !node.startPosition) return false;
      return node.startPosition.top > node.startPosition.pageInnerHeight * 0.82;
    },
  });
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (d: Buffer) => chunks.push(d));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

export function tableBlock(body: Cell[][], widths: (number | string)[]) {
  return {
    table: { headerRows: 1, keepWithHeaderRows: 1, widths, body, dontBreakRows: true },
    layout: {
      hLineWidth: (i: number) => (i === 0 ? 0 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => "#E2D3D7",
      fillColor: (row: number) => (row > 0 && row % 2 === 0 ? "#FBF6F7" : null),
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
  };
}

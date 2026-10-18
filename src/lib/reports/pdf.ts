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
const fonts = {
  Inter: {
    normal: join(fontDir, "Inter-Regular.otf"),
    bold: join(fontDir, "Inter-Bold.otf"),
    italics: join(fontDir, "Inter-Regular.otf"),
    bolditalics: join(fontDir, "Inter-Bold.otf"),
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
  const cards: unknown[] = [
    card("Opening value", m(r.summary.opening_value)),
    card("Stock in value", m(r.summary.in_value)),
    card("Stock out value", m(r.summary.out_value)),
  ];
  if (r.summary.adj_count) cards.push(card("Net corrections", m(r.summary.adj_value)));
  cards.push(card("Closing value", m(r.summary.closing_value), true));
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

  if (sec.stockIn) {
    content.push({ text: "Stock In", style: "h2" });
    const body: Cell[][] = [[h("Txn"), h("Date & time"), h("Item"), h("Code"), h("Quantity", "right"), h("Cost / unit", "right"), h("Total value", "right"), h("Supplier"), h("Reference / notes")]];
    for (const t of r.stockIn) {
      body.push([t.txn_no, formatDateTime(t.occurred_at, tz), t.item_name, t.item_sku,
        right(`${formatQty(t.entered_quantity)} ${t.entered_unit_symbol}`), right(c(t.entered_unit_cost)), right(m(t.total_value)),
        t.is_opening ? "Opening stock" : t.supplier_label ?? "", [t.reference, t.notes].filter(Boolean).join(" — ")]);
    }
    if (!r.stockIn.length) body.push(...empty(9, "No stock received in this period."));
    body.push([{ text: "Total", bold: true, colSpan: 6, alignment: "right" }, "", "", "", "", "", right(m(r.summary.in_value), { bold: true }), "", ""]);
    content.push(tableBlock(body, [52, 76, "*", 52, 55, 60, 68, 72, 96]));
  }

  if (sec.stockOut) {
    content.push({ text: "Stock Out", style: "h2" });
    const body: Cell[][] = [[h("Txn"), h("Date & time"), h("Item"), h("Code"), h("Quantity", "right"), h("Cost / unit", "right"), h("Total value", "right"), h("Reason"), h("Recipient"), h("Reference / notes")]];
    for (const t of r.stockOut) {
      body.push([t.txn_no, formatDateTime(t.occurred_at, tz), t.item_name, t.item_sku,
        right(`${formatQty(t.entered_quantity)} ${t.entered_unit_symbol}`), right(c(t.entered_unit_cost)), right(m(t.total_value)),
        reasonLabel(t.reason), t.recipient ?? "", [t.reference, t.notes].filter(Boolean).join(" — ")]);
    }
    if (!r.stockOut.length) body.push(...empty(10, "No stock issued in this period."));
    body.push([{ text: "Total", bold: true, colSpan: 6, alignment: "right" }, "", "", "", "", "", right(m(r.summary.out_value), { bold: true }), "", "", ""]);
    content.push(tableBlock(body, [52, 76, "*", 52, 55, 60, 68, 54, 62, 76]));
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

  if (sec.balances) {
    content.push({ text: "Closing Inventory — balance left per item", style: "h2", pageBreak: sec.stockIn || sec.stockOut ? "before" : undefined });
    content.push({ text: "Each item's closing balance is carried forward as its opening stock for the next day.", fontSize: 8, color: "#555", margin: [0, -2, 0, 6] });
    const body: Cell[][] = [[h("Item"), h("Code"), h("Unit"), h("Opening", "right"), h("Received", "right"), h("Issued", "right"),
      ...(r.summary.adj_count ? [h("Corrections", "right")] : []), h("Closing (next opening)", "right"), h("Cost / unit", "right"), h("Closing worth", "right"), h("Status")]];
    for (const b of r.balances) {
      body.push([b.name, b.sku, b.unit, right(formatQty(b.opening_qty)), right(formatQty(b.in_qty)), right(formatQty(b.out_qty)),
        ...(r.summary.adj_count ? [right(formatQty(b.adj_qty))] : []),
        right(formatQty(b.closing_qty), { bold: true }), right(c(b.closing_cost)), right(m(b.closing_value)),
        { text: statusText(b.status), color: b.status === "out" ? "#B91C1C" : b.status === "low" ? "#B45309" : "#166534", bold: b.status !== "in_stock" }]);
    }
    const cols = body[0].length;
    if (!r.balances.length) body.push(...empty(cols, "No items."));
    body.push([{ text: "Total closing inventory worth", bold: true, colSpan: cols - 2, alignment: "right" }, ...Array(cols - 3).fill(""),
      right(m(r.summary.closing_value), { bold: true }), ""]);
    const widths = r.summary.adj_count ? ["*", 52, 34, 52, 52, 52, 56, 56, 62, 72, 58] : ["*", 56, 36, 58, 58, 58, 58, 66, 80, 62];
    content.push(tableBlock(body, widths));
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
    defaultStyle: { font: "Inter", fontSize: 8, color: "#111" },
    styles: {
      brand: { fontSize: 20, bold: true, color: BURGUNDY },
      title: { fontSize: 12, bold: true, margin: [0, 2, 0, 0] },
      h2: { fontSize: 11, bold: true, color: BURGUNDY, margin: [0, 16, 0, 6] },
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

  const printer = new PdfPrinter(fonts);
  const doc = printer.createPdfKitDocument(docDefinition);
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (d: Buffer) => chunks.push(d));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function tableBlock(body: Cell[][], widths: (number | string)[]) {
  return {
    table: { headerRows: 1, widths, body, dontBreakRows: true },
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

import type { ReportData } from "./engine";
import { formatDateTime, formatMoney, formatQty, reasonLabel } from "../format";
import { renderPdf } from "./pdf";

const INK = "#111111";
const GOLD = "#C9A227";
const GOLD_BG = "#F7EFD6";
const GOLD_DEEP = "#8A6A10";

type Cell = Record<string, unknown> | string;
type Row = { name: string; sku: string; unit: string; opening: string; in: string; in_value: string; out: string; out_value: string; closing: string };

/**
 * The stock movement PDF: a short, separate report of only the items that moved (stock in or stock out),
 * each with quantities and value, plus a day-by-day breakdown for weekly and monthly periods.
 * The full report (every item, opening to closing) stays separate.
 */
export async function movementToPdf(r: ReportData): Promise<Buffer> {
  const sym = r.settings.currency_symbol;
  const m = (v: string | number) => formatMoney(v, sym);
  const content: unknown[] = [];
  const isDay = r.params.from === r.params.to;

  // Header
  content.push({
    columns: [
      [
        { text: r.settings.store_name, style: "brand" },
        { text: isDay ? "Daily Stock Movement" : r.periodType === "month" ? "Monthly Stock Movement" : r.periodType === "week" ? "Weekly Stock Movement" : "Stock Movement", style: "title" },
        { text: "Only the items that moved: what came in, what went out, and what it was worth.", fontSize: 8, color: "#666", margin: [0, 2, 0, 0] },
      ],
      {
        width: "auto",
        stack: [
          { text: r.periodLabel, alignment: "right", bold: true, fontSize: 10 },
          ...(r.scopeLabel ? [{ text: r.scopeLabel, alignment: "right" }] : []),
          { text: `Generated ${formatDateTime(r.generatedAt, r.settings.timezone)}`, alignment: "right", color: "#666" },
          { text: `${r.settings.currency_code} (${sym}) · weighted-average cost`, alignment: "right", color: "#666" },
        ],
        fontSize: 8,
      },
    ],
  });
  content.push({ canvas: [{ type: "line", x1: 0, y1: 6, x2: 523, y2: 6, lineWidth: 2.5, lineColor: GOLD }], margin: [0, 0, 0, 12] });

  // Summary
  const rows: Row[] = r.balances.map((b) => ({
    name: b.name, sku: b.sku, unit: b.unit, opening: b.opening_qty, in: b.in_qty, in_value: b.in_value, out: b.out_qty, out_value: b.out_value, closing: b.closing_qty,
  }));
  const tin = rows.reduce((a, b) => a + Number(b.in_value), 0);
  const tout = rows.reduce((a, b) => a + Number(b.out_value), 0);
  const topen = r.balances.reduce((a, b) => a + Number(b.opening_value), 0);
  const card = (label: string, value: string, dark = false) => ({
    stack: [
      { text: label.toUpperCase(), fontSize: 6.5, bold: true, color: dark ? GOLD : "#666" },
      { text: value, fontSize: 11, bold: true, color: dark ? "#FFFFFF" : INK, margin: [0, 3, 0, 0] },
    ],
    margin: [6, 7, 6, 7],
    fillColor: dark ? INK : "#F6F6F6",
  });
  content.push({
    table: {
      widths: ["*", "*", "*", "*", "*"],
      body: [[
        card("Items moved", String(rows.length)),
        card("Opening stock value", m(topen)),
        card("Value of stock in", m(tin)),
        card("Value of stock out", m(tout)),
        card("Total value moved", m(tin + tout), true),
      ]],
    },
    layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 || i === 5 ? 0 : 3), vLineColor: () => "#FFFFFF" },
  });
  content.push({
    text: [
      { text: String(r.summary.in_count), bold: true }, " stock-in entries  ·  ",
      { text: String(r.summary.out_count), bold: true }, " stock-out entries",
    ],
    fontSize: 8, color: "#444", margin: [0, 6, 0, 0],
  });

  // Main table: one line per item that moved
  content.push({ text: isDay ? "Items that moved today" : "Items that moved in this period", style: "h2" });
  content.push(movementTable(rows, m, true));

  // Day by day for longer periods: each day lists only that day's movers
  if (!isDay) {
    const active = r.days.filter((d) => d.rows.length);
    if (active.length) content.push({ text: "Day by day", style: "h2" });
    for (const d of active) {
      const dayIn = d.rows.reduce((a, x) => a + Number(x.in_value), 0);
      const dayOut = d.rows.reduce((a, x) => a + Number(x.out_value), 0);
      content.push({
        columns: [
          { text: new Date(d.day + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }), bold: true, fontSize: 9.5 },
          { text: `${d.rows.length} item${d.rows.length === 1 ? "" : "s"} · in ${m(dayIn)} · out ${m(dayOut)}`, alignment: "right", fontSize: 8, color: GOLD_DEEP, bold: true },
        ],
        margin: [0, 10, 0, 4],
      });
      content.push(movementTable(d.rows, m, false));
    }
  }

  // Who took stock out
  if (r.byWorker.length) {
    content.push({ text: "Stock out by worker", style: "h2" });
    const body: Cell[][] = [[th("Worker"), th("Times", "right"), th("Items", "right"), th("Value taken", "right")]];
    for (const w of r.byWorker) body.push([w.name, right(String(w.takes)), right(String(w.items)), right(m(w.value))]);
    content.push(table(body, ["*", 60, 60, 100]));
  }

  // Cost of stock out by usage (Kitchen usage, Bar usage, ...), then the same split by item category.
  const outs = r.stockOut.filter((t) => !t.reversed_by_txn_no);
  if (outs.length) {
    type Agg = { value: number; times: number; items: Set<string> };
    const byReason = new Map<string, Agg>();
    const byCat = new Map<string, Map<string, number>>();
    for (const t of outs) {
      const reason = reasonLabel(t.reason) || "Not given";
      const a = byReason.get(reason) ?? { value: 0, times: 0, items: new Set<string>() };
      a.value += Number(t.total_value); a.times += 1; a.items.add(t.item_id);
      byReason.set(reason, a);
      const cat = t.category_name ?? "Uncategorised";
      const cm = byCat.get(cat) ?? new Map<string, number>();
      cm.set(reason, (cm.get(reason) ?? 0) + Number(t.total_value));
      byCat.set(cat, cm);
    }
    const total = [...byReason.values()].reduce((a, x) => a + x.value, 0);

    content.push({ text: "Cost of stock out by usage", style: "h2" });
    const ub: Cell[][] = [[th("Usage"), th("Times", "right"), th("Items", "right"), th("Share", "right"), th("Total cost", "right")]];
    for (const [reason, a] of [...byReason.entries()].sort((x, y) => y[1].value - x[1].value)) {
      ub.push([{ text: reason, bold: true }, right(String(a.times)), right(String(a.items.size)),
        right(total ? `${Math.round((a.value / total) * 100)}%` : "-"), right(m(a.value), { bold: true })]);
    }
    ub.push([{ text: "Total", bold: true, colSpan: 4, alignment: "right", fillColor: GOLD_BG }, "", "", "", { text: m(total), alignment: "right", bold: true, fillColor: GOLD_BG }]);
    content.push(table(ub, ["*", 50, 50, 50, 100]));
    if (Math.abs(total - Number(r.summary.out_value)) > 0.005) {
      content.push({ text: "Stock-outs that were later corrected (reversed) are left out of these usage totals.", fontSize: 7, color: "#777", margin: [0, 4, 0, 0] });
    }

    content.push({ text: "Cost of each usage by item category", style: "h2" });
    content.push({ text: "For each category of items, what was spent on each usage.", fontSize: 8, color: "#666", margin: [0, -2, 0, 6] });
    const cb: Cell[][] = [[th("Category"), th("Usage"), th("Cost", "right")]];
    const cats = [...byCat.entries()].map(([cat, cm]) => ({ cat, cm, sum: [...cm.values()].reduce((a, v) => a + v, 0) })).sort((a, b) => b.sum - a.sum);
    for (const { cat, cm, sum } of cats) {
      const reasons = [...cm.entries()].sort((a, b) => b[1] - a[1]);
      reasons.forEach(([reason, v], i) => {
        cb.push([i === 0 ? { text: cat, bold: true, rowSpan: reasons.length + 1 } : "", reason, right(m(v))]);
      });
      cb.push(["", { text: `${cat} total`, bold: true, color: GOLD_DEEP }, right(m(sum), { bold: true, color: GOLD_DEEP })]);
    }
    cb.push([{ text: "Total", bold: true, colSpan: 2, alignment: "right", fillColor: GOLD_BG }, "", { text: m(total), alignment: "right", bold: true, fillColor: GOLD_BG }]);
    content.push(categoryTable(cb));
  }

  return renderPdf({
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [36, 36, 36, 40],
    info: { title: `${r.settings.store_name}: Stock movement, ${r.periodLabel}`, author: r.settings.store_name },
    defaultStyle: { fontSize: 8, color: INK },
    styles: {
      brand: { fontSize: 20, bold: true, color: INK },
      title: { fontSize: 13, bold: true, margin: [0, 2, 0, 0] },
      h2: { fontSize: 11, bold: true, color: INK, margin: [0, 16, 0, 6] },
    },
    content,
    footer: (page: number, pages: number) => ({
      columns: [
        { text: `${r.settings.store_name} · Stock movement · ${r.periodLabel}`, color: "#777" },
        { text: `Page ${page} of ${pages}`, alignment: "right", color: "#777" },
      ],
      margin: [36, 12, 36, 0],
      fontSize: 7,
    }),
  });
}

function th(t: string, align: "left" | "right" = "left"): Cell {
  return { text: t, bold: true, color: "#FFFFFF", fillColor: INK, fontSize: 7.5, alignment: align };
}
function right(t: string, extra: Record<string, unknown> = {}): Cell {
  return { text: t, alignment: "right", ...extra };
}
function table(body: Cell[][], widths: (number | string)[]) {
  return {
    table: { headerRows: 1, widths, body, dontBreakRows: true },
    layout: {
      hLineWidth: (i: number) => (i === 0 ? 0 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => "#E5E5E5",
      fillColor: (row: number, node: { table: { body: unknown[] } }) =>
        row === node.table.body.length - 1 && row > 0 ? null : row > 0 && row % 2 === 0 ? "#F7F7F7" : null,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
  };
}

function movementTable(rows: Row[], m: (v: string | number) => string, withLeft: boolean) {
  const body: Cell[][] = [[
    th("S/N"), th("Item"), th("Unit"), th("Opening", "right"), th("Qty in", "right"), th("Value in", "right"), th("Qty out", "right"), th("Value out", "right"),
    th("Total value", "right"), ...(withLeft ? [th("Left", "right")] : []),
  ]];
  let tin = 0, tout = 0;
  rows.forEach((x, i) => {
    const vi = Number(x.in_value), vo = Number(x.out_value);
    tin += vi; tout += vo;
    body.push([
      String(i + 1),
      { text: [{ text: x.name, bold: true }, { text: `  ${x.sku}`, color: "#888", fontSize: 7 }] },
      x.unit,
      right(formatQty(x.opening)),
      right(Number(x.in) ? `+${formatQty(x.in)}` : "-"),
      right(vi ? m(vi) : "-"),
      right(Number(x.out) ? `−${formatQty(x.out)}` : "-"),
      right(vo ? m(vo) : "-"),
      right(m(vi + vo), { bold: true }),
      ...(withLeft ? [right(formatQty(x.closing))] : []),
    ]);
  });
  if (!rows.length) body.push([{ text: "Nothing moved in this period.", colSpan: withLeft ? 10 : 9, italics: true, color: "#777" }, ...Array(withLeft ? 9 : 8).fill("")]);
  const total = (t: string, bold = true): Cell => ({ text: t, alignment: "right", bold, fillColor: GOLD_BG, color: INK });
  body.push([
    { text: "Total", bold: true, colSpan: 5, alignment: "right", fillColor: GOLD_BG }, "", "", "", "",
    total(m(tin)), { text: "", fillColor: GOLD_BG }, total(m(tout)), total(m(tin + tout)),
    ...(withLeft ? [{ text: "", fillColor: GOLD_BG }] : []),
  ]);
  return table(body, withLeft ? [18, "*", 26, 40, 38, 58, 38, 58, 62, 34] : [18, "*", 26, 42, 42, 62, 42, 62, 66]);
}

function categoryTable(body: Cell[][]) {
  return {
    table: { headerRows: 1, widths: [130, "*", 110], body, dontBreakRows: true },
    layout: {
      hLineWidth: (i: number) => (i === 0 ? 0 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => "#E5E5E5",
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
  };
}

import "server-only";
import { getTransaction, type TxnRow } from "./inventory";
import { getSettings, type StoreSettings } from "./settings";
import { formatDateTime, formatMoney, formatQty, formatUnitCost, reasonLabel } from "./format";
import { renderPdf } from "./reports/pdf";
import { AppError } from "./errors";

const BURGUNDY = "#111111";

export function receiptTitle(t: TxnRow) {
  if (t.txn_type === "stock_out") return t.source === "count" ? "Stock count adjustment (shortage)" : "Stock-out receipt";
  if (t.txn_type === "stock_in") return t.source === "count" ? "Stock count adjustment (excess)" : t.is_opening ? "Opening stock note" : "Goods received note";
  return "Correction note";
}

export function receiptFileName(t: TxnRow) {
  return `isura-receipt-${t.txn_no}.pdf`;
}

export async function loadReceipt(id: string) {
  const t = await getTransaction(id);
  if (!t) throw new AppError("TXN_NOT_FOUND", "Transaction not found.", 404);
  return { t, s: await getSettings() };
}

/** A5 receipt for one stock movement, with signature lines for the person issuing and receiving. */
export async function receiptPdf(t: TxnRow, s: StoreSettings): Promise<Buffer> {
  const sym = s.currency_symbol;
  const isOut = t.txn_type === "stock_out";
  const sameUnit = t.entered_unit_symbol === t.unit_symbol;
  const row = (label: string, value: string | null | undefined) =>
    value ? [{ text: label, color: "#6b6b6b" }, { text: value, bold: true }] : null;
  const details = [
    isOut ? row("Reason", t.source === "count" ? "Stock count shortage" : reasonLabel(t.reason)) : null,
    isOut ? row("Taken by", t.worker_name) : row("Supplier", t.is_opening ? "Opening stock" : t.supplier_label),
    isOut ? row("Destination / recipient", t.recipient) : null,
    row("Reference", t.reference),
    row("Notes", t.notes),
    row("Recorded by", t.user_name),
    row("Balance after this", `${formatQty(t.balance_after)} ${t.unit_symbol}`),
  ].filter(Boolean) as unknown[][];

  const content: unknown[] = [
    {
      columns: [
        [{ text: s.store_name, fontSize: 18, bold: true, color: BURGUNDY }, { text: receiptTitle(t), fontSize: 11, bold: true, margin: [0, 2, 0, 0] }],
        {
          width: "auto",
          stack: [
            { text: t.txn_no, bold: true, fontSize: 12, alignment: "right" },
            { text: formatDateTime(t.occurred_at, s.timezone), alignment: "right", color: "#555" },
          ],
        },
      ],
    },
    { canvas: [{ type: "line", x1: 0, y1: 6, x2: 363, y2: 6, lineWidth: 1.5, lineColor: BURGUNDY }], margin: [0, 0, 0, 12] },
  ];
  if (t.reversed_by_txn_no) {
    content.push({ text: `CANCELLED: reversed by ${t.reversed_by_txn_no}`, bold: true, color: "#B42318", margin: [0, 0, 0, 10] });
  }
  content.push({
    table: {
      headerRows: 1,
      widths: ["*", 70, 64, 72],
      body: [
        [
          { text: "Item", style: "th" }, { text: "Quantity", style: "th", alignment: "right" },
          { text: "Cost / unit", style: "th", alignment: "right" }, { text: "Value", style: "th", alignment: "right" },
        ],
        [
          { stack: [{ text: t.item_name, bold: true }, { text: [t.item_sku, t.category_name].filter(Boolean).join(" · "), color: "#6b6b6b", fontSize: 8 }] },
          {
            stack: [
              { text: `${formatQty(t.entered_quantity)} ${t.entered_unit_symbol}`, bold: true, alignment: "right" },
              ...(sameUnit ? [] : [{ text: `= ${formatQty(t.quantity)} ${t.unit_symbol}`, color: "#6b6b6b", fontSize: 8, alignment: "right" }]),
            ],
          },
          { text: formatUnitCost(t.entered_unit_cost, sym), alignment: "right" },
          { text: formatMoney(t.total_value, sym), alignment: "right", bold: true },
        ],
      ],
    },
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => "#e5e5e5", paddingTop: () => 6, paddingBottom: () => 6 },
  });
  content.push({ text: isOut ? "Values use the item's weighted-average cost at the time of issue." : "Cost as recorded when the stock was received.", fontSize: 7.5, color: "#6b6b6b", margin: [0, 4, 0, 12] });
  if (details.length) {
    content.push({ table: { widths: [110, "*"], body: details }, layout: "noBorders", margin: [0, 0, 0, 30] });
  }
  content.push({
    columns: [
      { stack: [{ canvas: [{ type: "line", x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 0.7 }] }, { text: isOut ? "Issued by" : "Received by (store)", fontSize: 8, color: "#555", margin: [0, 4, 0, 0] }] },
      { stack: [{ canvas: [{ type: "line", x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 0.7 }] }, { text: isOut ? `Received by${t.worker_name ? ` (${t.worker_name})` : ""}` : "Delivered by", fontSize: 8, color: "#555", margin: [0, 4, 0, 0] }] },
    ],
    columnGap: 40,
  });

  return renderPdf({
    pageSize: "A5",
    pageMargins: [30, 30, 30, 36],
    info: { title: `${s.store_name}: ${receiptTitle(t)} ${t.txn_no}`, author: s.store_name },
    defaultStyle: { fontSize: 9, color: "#111" },
    styles: { th: { bold: true, color: "#FFFFFF", fillColor: BURGUNDY, fontSize: 8 } },
    content,
    footer: () => ({ text: `${s.store_name} · ${t.txn_no} · printed ${formatDateTime(new Date().toISOString(), s.timezone)}`, fontSize: 7, color: "#888", margin: [30, 10, 30, 0] }),
  });
}

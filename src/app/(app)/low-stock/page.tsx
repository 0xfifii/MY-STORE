import Link from "next/link";
import { CheckCircle2, Download } from "@/components/hand-icons";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { StockButtons } from "@/components/stock-dialog";
import { requirePageUser } from "@/lib/auth";
import { listItems } from "@/lib/inventory";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatQty } from "@/lib/format";

export const metadata = { title: "Low Stock" };

export default async function LowStockPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePageUser("view");
  const sp = await searchParams;
  const status = sp.status === "out" ? "out" : sp.status === "low" ? "low" : "attention";
  const s = await getSettings();
  const data = await listItems({ status, sort: "quantity", dir: "asc", pageSize: 100 });
  const pill = (v: string, label: string) => (
    <Link href={v === "attention" ? "/low-stock" : `/low-stock?status=${v}`}
      className={`rounded-full px-3 py-1.5 text-sm font-semibold ${status === v ? "bg-burgundy text-white" : "bg-white text-muted ring-1 ring-line hover:text-burgundy"}`}>
      {label}
    </Link>
  );

  return (
    <div>
      <PageHeader
        title="Low Stock"
        description="Items at or below their minimum level, with items that have run out first."
        actions={
          <a href="/api/reports/export?kind=balance&preset=today&format=pdf" className="inline-flex h-10 items-center gap-2 rounded-full bg-white/80 px-5 text-sm font-semibold shadow-sm ring-1 ring-white hover:bg-white">
            <Download className="size-4" /> Balance report
          </a>
        }
      />
      <div className="mb-4 flex gap-2">{pill("attention", "Low or out")}{pill("out", "Out of stock")}{pill("low", "Low only")}</div>
      <div className="glass overflow-hidden rounded-[var(--radius-card)]">
        {data.rows.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="size-6" />} title="Nothing needs restocking" body="Items appear here when their balance reaches the minimum level you set." />
        ) : (
          <ul className="divide-y divide-white/80">
            {data.rows.map((it) => {
              const pct = Number(it.min_stock_level) > 0 ? Math.min(100, (Number(it.quantity) / Number(it.min_stock_level)) * 100) : 0;
              return (
                <li key={it.id} className={`flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5 ${it.status === "out" ? "bg-bad-bg/40" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link href={`/items/${it.id}`} className="truncate font-semibold hover:text-burgundy hover:underline">{it.name}</Link>
                      <StatusBadge status={it.status} />
                    </div>
                    <p className="text-xs text-muted">{it.sku}{it.category_name ? ` · ${it.category_name}` : ""}{it.supplier_name ? ` · supplier ${it.supplier_name}` : ""}</p>
                    <div className="mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-canvas ring-1 ring-line" aria-hidden>
                      <div className={`h-full ${it.status === "out" ? "bg-bad" : "bg-warn"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <div className="text-right text-sm">
                      <p><span className="font-display text-lg font-bold">{formatQty(it.quantity)}</span> {it.unit_symbol} left</p>
                      <p className="text-xs text-muted">minimum {formatQty(it.min_stock_level)} {it.unit_symbol} · {formatMoney(it.stock_value, s.currency_symbol)}</p>
                    </div>
                    <StockButtons itemId={it.id} name={it.name} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

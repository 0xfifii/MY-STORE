import Link from "next/link";
import clsx from "clsx";
import { PageHeader, Panel } from "@/components/ui/primitives";
import { StockMoveForm } from "@/components/stock-move-form";
import { StockInBatchForm } from "@/components/stock-in-batch-form";
import { requirePageUser } from "@/lib/auth";

export const metadata = { title: "Stock In" };

export default async function StockInPage({ searchParams }: { searchParams: Promise<{ item?: string; mode?: string }> }) {
  await requirePageUser("stock.in");
  const { item, mode } = await searchParams;
  const many = mode === "many" && !item;
  const tab = (on: boolean) => clsx(
    "relative z-10 flex-1 rounded-xl px-3 py-2 text-center text-sm font-semibold transition-colors duration-300",
    on ? "text-white" : "text-[#111111]/60 hover:text-[#111111]",
  );
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Stock In"
        description={many
          ? "A delivery with several items: add up to 20, each with its quantity and cost. They're saved together."
          : "Record stock you've received. The balance and stock value update as soon as you confirm."} />
      <nav className="relative mb-4 flex gap-1 rounded-2xl bg-paper p-1 ring-1 ring-black/5" aria-label="Stock in mode">
        <span aria-hidden className={clsx("tab-pill absolute inset-y-1 left-1 w-[calc(50%-6px)] rounded-xl bg-[#111111] shadow", many && "translate-x-[calc(100%+4px)]")} />
        <Link href="/stock-in" className={tab(!many)} aria-current={!many ? "page" : undefined}>One item</Link>
        <Link href="/stock-in?mode=many" className={tab(many)} aria-current={many ? "page" : undefined} data-testid="tab-many">Several items</Link>
      </nav>
      <Panel>
        {many ? <StockInBatchForm /> : <StockMoveForm key={item ?? "none"} mode="in" initialItemId={item ?? null} />}
      </Panel>
    </div>
  );
}

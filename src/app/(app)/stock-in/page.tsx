import { PageHeader, Panel } from "@/components/ui/primitives";
import { StockMoveForm } from "@/components/stock-move-form";
import { requirePageUser } from "@/lib/auth";

export const metadata = { title: "Stock In" };

export default async function StockInPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  await requirePageUser("stock.in");
  const { item } = await searchParams;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Stock In" description="Record stock you've received. The balance and stock value update as soon as you confirm." />
      <Panel>
        <StockMoveForm key={item ?? "none"} mode="in" initialItemId={item ?? null} />
      </Panel>
    </div>
  );
}

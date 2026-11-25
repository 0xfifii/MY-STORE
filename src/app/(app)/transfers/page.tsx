import { PageHeader } from "@/components/ui/primitives";
import { requirePageUser } from "@/lib/auth";
import { listTransfers, transferTargets } from "@/lib/transfers";
import { TransferPage } from "./transfer-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transfer" };

export default async function TransfersPage() {
  const user = await requirePageUser("stock.out");
  const [targets, transfers] = await Promise.all([transferTargets(user), listTransfers()]);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Transfer"
        description={`Send items from ${user.store_name} to another account. They're taken out here and added there in one step.`} />
      <TransferPage targets={targets} initial={JSON.parse(JSON.stringify(transfers))} storeId={user.store_id} />
    </div>
  );
}


import { PageHeader } from "@/components/ui/primitives";
import { UnitsManager } from "@/components/units-manager";
import { requirePageUser } from "@/lib/auth";
import { listGlobalConversions, listUnits } from "@/lib/catalog";
import { can } from "@/lib/permissions";

export const metadata = { title: "Units" };

export default async function UnitsPage() {
  const user = await requirePageUser("page.setup");
  const [units, rules] = await Promise.all([listUnits(), listGlobalConversions()]);
  return (
    <div>
      <PageHeader title="Units" description="The units items are counted in, and the only conversions the app is allowed to make." />
      <UnitsManager units={units} rules={rules} canAdd={can(user, "catalog.write")} canRules={can(user, "conversion.global")} />
    </div>
  );
}

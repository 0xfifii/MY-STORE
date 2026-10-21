import { PageHeader } from "@/components/ui/primitives";
import { CatalogManager } from "@/components/catalog-manager";
import { requirePageUser } from "@/lib/auth";
import { listWorkers } from "@/lib/catalog";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Workers" };

export default async function WorkersPage() {
  const user = await requirePageUser("page.setup");
  const rows = await listWorkers(true);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Workers" description="People who take items from the store. Pick a name on every Stock Out to see who used what." />
      <CatalogManager
        rows={rows.map((r) => ({
          ...r,
          title: r.name,
          subtitle: [r.department, r.phone, `${r.takes} item${r.takes === 1 ? "" : "s"} taken`, r.last_take ? `last ${formatDate(r.last_take)}` : null].filter(Boolean).join(" · "),
        }))}
        endpoint="/api/workers"
        noun="Worker"
        canWrite={can(user, "workers.manage")}
        canArchive={can(user, "workers.manage")}
        fields={[
          { key: "name", label: "Full name", required: true },
          { key: "department", label: "Department or role", hint: "e.g. Kitchen, Bar, Cleaning" },
          { key: "phone", label: "Phone", type: "tel" },
          { key: "notes", label: "Notes", type: "textarea" },
        ]}
        emptyBody="Add the names of staff who collect items, e.g. cooks, cleaners, bar staff."
      />
    </div>
  );
}

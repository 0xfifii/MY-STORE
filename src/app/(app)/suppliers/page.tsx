import { PageHeader } from "@/components/ui/primitives";
import { CatalogManager } from "@/components/catalog-manager";
import { requirePageUser } from "@/lib/auth";
import { listSuppliers } from "@/lib/catalog";
import { can } from "@/lib/permissions";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const user = await requirePageUser("page.setup");
  const rows = await listSuppliers(true);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Suppliers" description="Who you buy from. Pick a supplier when recording Stock In." />
      <CatalogManager
        rows={rows.map((r) => ({ ...r, title: r.name, subtitle: [r.contact_person, r.phone, r.email, `${r.receipt_count} receipts`].filter(Boolean).join(" · ") }))}
        endpoint="/api/suppliers"
        noun="Supplier"
        canWrite={can(user, "catalog.write")}
        canArchive={can(user, "item.archive")}
        fields={[
          { key: "name", label: "Supplier name", required: true },
          { key: "contact_person", label: "Contact person" },
          { key: "phone", label: "Phone", type: "tel" },
          { key: "email", label: "Email", type: "email" },
          { key: "address", label: "Address", type: "textarea" },
          { key: "notes", label: "Notes", type: "textarea" },
        ]}
        emptyBody="Add the suppliers you receive stock from."
      />
    </div>
  );
}

import { PageHeader, Panel } from "@/components/ui/primitives";
import { linkedAccounts } from "@/lib/account-links";
import { requirePageUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { LinkedAccounts } from "./linked-accounts";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Edit profile" };

export default async function ProfilePage() {
  const user = await requirePageUser("view");
  const [s, linked] = await Promise.all([getSettings(), linkedAccounts(user.id)]);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Edit profile" description="Your name, your password, and the company name shown across the app." />
      <Panel>
        <ProfileForm name={user.name} email={user.email} companyName={s.store_name} canEditCompany={can(user, "settings.write")} />
      </Panel>
      <Panel title="Linked accounts" className="mt-6">
        <LinkedAccounts initial={linked.map((a) => ({ id: a.id, name: a.name, email: a.email, business: a.business, locked: a.locked }))} />
      </Panel>
    </div>
  );
}

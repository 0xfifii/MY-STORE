import { PageHeader, Panel } from "@/components/ui/primitives";
import { requirePageUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Edit profile" };

export default async function ProfilePage() {
  const user = await requirePageUser("view");
  const s = await getSettings();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Edit profile" description="Your name, your password, and the company name shown across the app." />
      <Panel>
        <ProfileForm name={user.name} email={user.email} companyName={s.store_name} canEditCompany={can(user, "settings.write")} />
      </Panel>
    </div>
  );
}

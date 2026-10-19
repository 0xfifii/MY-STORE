import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { hasAnyUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up" };

export default async function SetupPage() {
  if (await hasAnyUser()) redirect("/login");
  const s = await getSettings();
  return (
    <AuthFrame storeName={s.store_name} title="Set up your store" subtitle="Create the owner account. You can add staff afterwards.">
      <SetupForm defaultStoreName={s.store_name} />
    </AuthFrame>
  );
}

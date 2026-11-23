import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { getCurrentUser, hasAnyUser } from "@/lib/auth";
import { signupSettings } from "@/lib/signup";
import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create an account" };

export default async function SignupPage() {
  if (!(await hasAnyUser())) redirect("/setup");
  if (await getCurrentUser()) redirect("/dashboard");
  const s = await signupSettings();
  return (
    <AuthFrame storeName="ÌṢÚRA" title="Create an account"
      subtitle={s.allow
        ? `Set up ÌṢÚRA for your company. ${s.trialDays > 0 ? `Free for ${s.trialDays} days.` : ""} You can add your staff afterwards.`
        : "New accounts can't be created right now."}>
      {s.allow ? <SignupForm /> : (
        <p className="rounded-2xl bg-rose px-4 py-3 text-sm">Please contact ÌṢÚRA to get an account, or <Link href="/login" className="font-semibold underline">sign in</Link> if you already have one.</p>
      )}
    </AuthFrame>
  );
}

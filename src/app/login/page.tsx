import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { getCurrentUser, hasAnyUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; email?: string }> }) {
  if (!(await hasAnyUser())) redirect("/setup");
  if (await getCurrentUser()) redirect("/dashboard");
  const { next, error, email } = await searchParams;
  const s = await getSettings();
  return (
    <AuthFrame storeName={s.store_name} title="Log in" subtitle="Use the email and password your store owner gave you.">
      <LoginForm next={next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard"} initialError={error ?? null} initialEmail={email ?? ""} />
    </AuthFrame>
  );
}

import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await hasAnyUser())) redirect("/setup");
  redirect((await getCurrentUser()) ? "/dashboard" : "/login");
}

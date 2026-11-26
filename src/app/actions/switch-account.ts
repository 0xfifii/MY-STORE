"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { switchAccount } from "@/lib/account-links";

/**
 * Switch to a linked account in ONE round trip: the session cookie changes and the new dashboard
 * (layout included) comes back in the same response, instead of a request followed by two page loads.
 */
export async function switchAccountAction(userId: string): Promise<{ error: string } | never> {
  const me = await getCurrentUser();
  if (!me) return { error: "Please sign in again." };
  try {
    await switchAccount(me, userId);
  } catch (e) {
    return { error: (e as Error).message || "Couldn't switch account." };
  }
  redirect("/dashboard");
}

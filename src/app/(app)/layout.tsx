import { AppProvider } from "@/components/app-context";
import { AppShell } from "@/components/app-shell";
import { linkedAccounts } from "@/lib/account-links";
import { requirePageUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser("view");
  const [s, linked] = await Promise.all([getSettings(), linkedAccounts(user.id).catch(() => [])]);
  return (
    <AppProvider
      value={{
        user,
        storeName: s.store_name,
        linked: linked.map((a) => ({ id: a.id, name: a.name, business: a.business, locked: a.locked })),
        currencySymbol: s.currency_symbol,
        currencyCode: s.currency_code,
        timezone: s.timezone,
      }}
    >
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}

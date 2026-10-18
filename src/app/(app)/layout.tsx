import { AppProvider } from "@/components/app-context";
import { AppShell } from "@/components/app-shell";
import { requirePageUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser("view");
  const s = await getSettings();
  return (
    <AppProvider
      value={{
        user,
        storeName: s.store_name,
        currencySymbol: s.currency_symbol,
        currencyCode: s.currency_code,
        timezone: s.timezone,
      }}
    >
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}

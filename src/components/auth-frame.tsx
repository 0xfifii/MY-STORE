import { VelvetWordmark } from "./logo";
import { Mascot } from "./mascot";

/**
 * Sign-in / set-up layout: the form on a cream card, and a velvet panel with the wordmark and
 * Velvy waving hello.
 */
export function AuthFrame({
  storeName, title, subtitle, corner, children,
}: {
  storeName: string; title: string; subtitle: string; corner?: React.ReactNode; children: React.ReactNode;
}) {
  const tz = "Africa/Lagos";
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: tz }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(now);

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="relative mx-auto grid min-h-dvh max-w-5xl items-center gap-5 px-4 py-8 md:grid-cols-[1fr_1fr] md:px-8">
        <section className="glass-strong page-enter rounded-[32px] p-6 sm:p-9">
          <div className="flex items-start justify-between gap-3">
            <VelvetWordmark className="h-20 w-auto sm:h-24" title={storeName} />
            {corner}
          </div>
          <div className="mt-6 flex items-center gap-3 md:hidden">
            <Mascot mood="wave" className="h-20 w-16 shrink-0" />
            <p className="rounded-2xl rounded-bl-md bg-paper px-3 py-2 text-sm ring-1 ring-kraft">{greeting}! I&apos;m Velvy.</p>
          </div>
          <h1 className="mt-7 text-[30px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
          <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </section>

        <section className="relative hidden min-h-[34rem] flex-col overflow-hidden rounded-[32px] bg-burgundy p-8 text-paper shadow-[0_30px_60px_-30px_rgb(82_8_16/0.8)] md:flex">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-16 opacity-90"
            style={{ backgroundImage: "repeating-linear-gradient(90deg, #fffaf3 0 34px, #9e1018 34px 68px)" }} />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-16 h-5"
            style={{ backgroundImage: "radial-gradient(circle at 17px 0, #fffaf3 16px, transparent 17px), radial-gradient(circle at 51px 0, #9e1018 16px, transparent 17px)", backgroundSize: "68px 20px" }} />
          <div className="relative mt-20">
            <p className="text-sm font-medium text-paper/70">{date}</p>
            <p className="mt-1 text-[34px] font-semibold leading-tight tracking-[-0.02em]">{greeting}.</p>
            <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-paper/80">Every bag, bottle and kilo in its place. Sign in to record today&apos;s stock.</p>
          </div>
          <div className="relative mt-auto flex items-end justify-between gap-4">
            <div className="mb-12 rounded-3xl rounded-br-md bg-paper px-5 py-3.5 text-sm font-medium text-ink shadow-lg">
              Hi, I&apos;m Velvy.<br />Welcome to {storeName}!
            </div>
            <div className="relative shrink-0">
              <div aria-hidden className="absolute inset-x-2 bottom-1 top-6 rounded-full bg-paper shadow-xl" />
              <Mascot mood="wave" className="relative h-48 w-40" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

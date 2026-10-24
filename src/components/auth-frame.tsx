import { Cowry, TAGLINE, Wordmark } from "./logo";

/**
 * Sign-in / set-up layout: the form on a white card, and a black panel with a large white cowry and the
 * tagline (after the black-and-white onboarding reference).
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
            <Wordmark className="h-16 w-auto sm:h-20" title={storeName} />
            {corner}
          </div>
          <div className="mt-6 flex items-center gap-3 rounded-2xl bg-[#111111] p-3 text-white md:hidden">
            <Cowry tone="white" className="size-12 shrink-0" />
            <p className="text-sm font-semibold leading-snug">{greeting}.<br /><span className="font-normal text-white/70">{TAGLINE}</span></p>
          </div>
          <h1 className="mt-7 text-[30px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
          <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </section>

        <section className="relative hidden min-h-[34rem] flex-col overflow-hidden rounded-[32px] bg-[#111111] p-9 text-white shadow-[0_30px_60px_-30px_rgb(0_0_0/0.8)] md:flex">
          {/* big white cowry with soft rings */}
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-10 size-[24rem] rounded-full border border-white/10" />
          <div aria-hidden className="pointer-events-none absolute -right-4 top-2 size-[17rem] rounded-full border border-white/10" />
          <Cowry tone="white" className="cowry-float absolute right-10 top-12 h-52 w-52 drop-shadow-[0_24px_30px_rgb(0_0_0/0.6)]" />
          <div className="relative mt-auto">
            <p className="text-sm font-medium text-white/60">{date} · {greeting}</p>
            <p className="mt-3 max-w-sm text-[40px] font-bold leading-[1.05] tracking-[-0.03em]">{TAGLINE}</p>
            <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-white/70">Every bag, bottle and kilo in its place. Sign in to record today&apos;s stock.</p>
            <div className="mt-8 flex items-center justify-between">
              <div className="flex items-center gap-1.5" aria-hidden>
                <span className="size-1.5 rounded-full bg-white/30" /><span className="size-1.5 rounded-full bg-white/30" />
                <span className="h-1.5 w-5 rounded-full bg-white" /><span className="size-1.5 rounded-full bg-white/30" />
              </div>
              <span className="flex size-12 items-center justify-center rounded-full bg-white text-[#111111]" aria-hidden>
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

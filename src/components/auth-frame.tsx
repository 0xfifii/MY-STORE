/**
 * Sign-in / set-up layout in the style of the reference: a frosted-glass form card, a white
 * "today" card with a soft burgundy orb, and a dark card underneath.
 */
export function AuthFrame({
  storeName, title, subtitle, corner, children,
}: {
  storeName: string; title: string; subtitle: string; corner?: React.ReactNode; children: React.ReactNode;
}) {
  const now = new Date();
  const tz = "Africa/Lagos";
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: tz }).format(now);
  const day = Number(new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: tz }).format(now));
  const month = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: tz }).format(now);
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";

  return (
    <div className="relative min-h-dvh overflow-hidden">
      {/* Scene: soft spheres of light */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="glow-orb absolute -left-24 top-[55%] size-[28rem] rounded-full opacity-40" />
        <div className="absolute right-[8%] top-[6%] size-72 rounded-full bg-white/50 blur-2xl" />
        <div className="absolute bottom-[-6rem] right-[30%] size-80 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff_0%,#f3e7ea_45%,#c86b80_100%)] opacity-70 blur-[2px]" />
      </div>

      <div className="relative mx-auto grid min-h-dvh max-w-5xl items-center gap-4 px-4 py-8 md:grid-cols-[1fr_1fr] md:gap-5 md:px-8">
        {/* Form card */}
        <div className="flex flex-col gap-4">
          <section className="glass rounded-[28px] p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-medium text-muted">{storeName}</span>
              {corner}
            </div>
            <h1 className="mt-10 text-[32px] font-medium leading-none tracking-tight">{title}</h1>
            <p className="mt-2 text-sm text-muted">{subtitle}</p>
            <div className="mt-7">{children}</div>
          </section>

          <section className="hidden rounded-[28px] bg-night p-6 text-white sm:block sm:p-7">
            <p className="text-[26px] font-medium leading-tight">Stock, in order</p>
            <p className="text-[22px] font-light leading-tight text-white/45">Every bag, bottle and kilo</p>
            <p className="mt-6 text-right text-sm text-white/80">In · Out · Balance</p>
          </section>
        </div>

        {/* Today card */}
        <section className="relative hidden min-h-[30rem] overflow-hidden rounded-[28px] bg-white shadow-[0_24px_60px_-30px_rgb(79_16_34/0.45)] md:block">
          <div className="absolute inset-y-3 left-3 w-[44%] overflow-hidden rounded-[22px] bg-[#f5f0f1]">
            <div className="glow-orb absolute -left-16 top-[38%] size-72 rounded-full opacity-80" />
            <div className="relative flex h-full flex-col p-6">
              <p className="text-[56px] font-normal leading-[0.95] tracking-tight">{weekday}</p>
              <p className="text-[56px] font-light leading-[0.95] tracking-tight text-muted/60">
                {day}
                {suffix}
              </p>
              <p className="mt-auto text-sm leading-relaxed text-ink/80">
                {month}
                <br />
                Daily stock report
                <br />
                at 7:00
              </p>
              <div className="mt-8 flex flex-col items-center gap-1 text-xs font-semibold">
                <svg viewBox="0 0 24 24" className="size-6 text-ink" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <path key={i} d="M12 12 L12 3" transform={`rotate(${i * 30} 12 12)`} />
                  ))}
                </svg>
                {storeName}
              </div>
            </div>
          </div>
          <div className="absolute right-[-3rem] top-[34%] size-56 rounded-full bg-[radial-gradient(circle_at_30%_30%,#d65a75,#8e2440_70%)] shadow-[0_0_80px_10px_rgb(184_58_88/0.25)]" aria-hidden />
          <div className="absolute right-6 top-6 text-right text-sm leading-snug">
            Inventory
            <br />
            <span className="text-muted">for {storeName}</span>
          </div>
        </section>
      </div>
    </div>
  );
}

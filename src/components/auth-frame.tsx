export function AuthFrame({ storeName, title, subtitle, children }: { storeName: string; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="relative hidden overflow-hidden bg-claret p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <p className="font-display text-3xl font-extrabold tracking-tight">{storeName}</p>
        <div>
          <p className="font-display text-[56px] font-bold leading-[1.02] tracking-tight">
            Every bag,
            <br />
            bottle and kilo,
            <br />
            accounted for.
          </p>
          <p className="mt-6 max-w-sm text-white/70">
            Record what comes in and what goes out. Balances, stock value and daily reports update themselves.
          </p>
        </div>
        <svg aria-hidden className="absolute -bottom-24 -right-24 size-96 text-white/[0.06]" viewBox="0 0 64 64" fill="none">
          <path d="M14 26 32 16l18 10v22H14z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
          <path d="M24 48V36h16v12" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="flex flex-col justify-center bg-white px-5 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <p className="font-display text-2xl font-extrabold tracking-tight text-claret lg:hidden">{storeName}</p>
          <h1 className="mt-6 font-display text-3xl font-bold tracking-tight lg:mt-0">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

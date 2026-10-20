import Link from "next/link";

export const Th = ({ children, right, className = "" }: { children?: React.ReactNode; right?: boolean; className?: string }) => (
  <th className={`whitespace-nowrap border-b border-white/80 bg-white/40 px-4 py-2.5 font-semibold ${right ? "text-right" : ""} ${className}`}>{children}</th>
);
export const Td = ({ children, right, className = "" }: { children?: React.ReactNode; right?: boolean; className?: string }) => (
  <td className={`px-4 py-2.5 align-top ${right ? "whitespace-nowrap text-right" : ""} ${className}`}>{children}</td>
);

const TONES: Record<string, string> = {
  burgundy: "from-[#9c2a45] to-[#5e1528] text-white",
  blue: "from-[#2a78d6] to-[#1c5cab] text-white",
  rose: "from-[#f6ebee] to-white text-ink",
  amber: "from-[#fff4d6] to-white text-ink",
  green: "from-[#e3f5ec] to-white text-ink",
  plain: "from-white/90 to-white/60 text-ink",
};

/** Summary card that opens the records behind the figure. */
export function StatCard({ label, value, sub, href, tone = "plain", icon }: { label: string; value: string; sub?: React.ReactNode; href: string; tone?: keyof typeof TONES; icon?: React.ReactNode }) {
  const dark = tone === "burgundy" || tone === "blue";
  return (
    <Link href={href} scroll={false}
      className={`group relative block overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br p-4 shadow-[0_10px_30px_-18px_rgb(79_16_34/0.45)] ring-1 ring-white/70 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_-16px_rgb(79_16_34/0.5)] active:scale-[0.98] ${TONES[tone]}`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-xs font-medium ${dark ? "text-white/75" : "text-muted"}`}>{label}</p>
        {icon && <span className={`flex size-8 items-center justify-center rounded-full ${dark ? "bg-white/15" : "bg-white shadow-sm"}`}>{icon}</span>}
      </div>
      <p className="mt-1.5 truncate text-xl font-semibold tracking-tight sm:text-2xl">{value}</p>
      {sub && <p className={`mt-0.5 truncate text-xs ${dark ? "text-white/75" : "text-muted"}`}>{sub}</p>}
      <span className={`mt-2 inline-block text-[11px] font-semibold opacity-0 transition-opacity group-hover:opacity-100 ${dark ? "text-white" : "text-burgundy"}`}>View records</span>
    </Link>
  );
}

/** Segmented control made of links (keeps the rest of the query string). */
export function Seg({ options, value, href }: { options: [string, string][]; value: string; href: (v: string) => string }) {
  return (
    <div className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-white/70 p-1 ring-1 ring-white">
      {options.map(([k, l]) => (
        <Link key={k} href={href(k)} scroll={false} aria-current={value === k ? "true" : undefined}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all duration-200 active:scale-95 ${value === k ? "bg-night text-white shadow-sm" : "text-muted hover:bg-white hover:text-ink"}`}>
          {l}
        </Link>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-muted">{children}</p>;
}

export function ShareBar({ pct, color = "bg-burgundy" }: { pct: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
      <span className="text-xs text-muted">{pct.toFixed(pct < 1 ? 1 : 0)}%</span>
    </div>
  );
}

export function Change({ value, pct, fmt }: { value: number | null; pct: number | null; fmt: (n: number) => string }) {
  if (value === null) return <span className="text-xs text-muted">first purchase</span>;
  if (value === 0) return <span className="text-xs font-semibold text-muted">no change</span>;
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${up ? "bg-bad-bg text-bad" : "bg-ok-bg text-ok"}`}>
      {up ? "+" : "−"}{fmt(Math.abs(value))}{pct !== null ? ` (${up ? "+" : "−"}${Math.abs(pct).toFixed(2)}%)` : ""}
    </span>
  );
}

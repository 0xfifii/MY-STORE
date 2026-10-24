/**
 * ÌṢÚRA brand.
 * Mark: a cowry shell (once used as money, so "every valuable"), drawn as a solid shell with a toothed
 * opening. "black" = black shell, white opening (on light backgrounds); "white" = the reverse (on black).
 * Wordmark: ÌṢÚRA drawn as monoline strokes, so the Yoruba accents render the same everywhere
 * (favicons, emails and PDFs included) without depending on a font.
 */

export const TAGLINE = "Every Valuable, Accounted For.";

// The shell, its slit-shaped opening and the teeth along it, on a 64 x 64 grid.
const SHELL = "M32 3.5C45.5 3.5 54.5 16.5 54.5 32.5S46 60.5 32 60.5 9.5 48.5 9.5 32.5 18.5 3.5 32 3.5Z";
const SLIT = "M32.6 8.5C27.6 17.5 30.4 25.5 28 33 26.6 41 29.2 49.5 32.4 56.5 35.8 49.5 37.6 41 36.2 33 34 25.5 37.2 17.5 32.6 8.5Z";
const GAP = "M32.6 11C31 19 33.6 26 32.2 33S33.4 47 32.4 54";
const RIDGES: [number, number, number][] = [[15, 30.4, 35], [20.5, 29.6, 35.4], [26, 29, 35.6], [31.5, 28.2, 36], [37, 27.8, 36.4], [42.5, 28, 36.6], [48, 29, 36], [52.5, 30.4, 34.6]];

/** The cowry drawing itself (no <svg> wrapper), so it can be placed inside other artwork. */
function Shell({ shell, line, shine = true }: { shell: string; line: string; shine?: boolean }) {
  return (
    <>
      <path d={SHELL} fill={shell} />
      {shine && <path d="M17.5 22.5C19.5 14.5 24.5 9.6 29.5 8.6" fill="none" stroke={line} strokeOpacity=".35" strokeWidth="2.2" strokeLinecap="round" />}
      <path d={SLIT} fill={line} />
      <g stroke={shell} strokeWidth="1.9" strokeLinecap="round">
        {RIDGES.map(([y, a, b]) => <path key={y} d={`M${a} ${y}H${b}`} />)}
      </g>
      <path d={GAP} fill="none" stroke={line} strokeWidth="1.3" strokeLinecap="round" />
    </>
  );
}

export function Cowry({ className = "size-9", tone = "black", title }: { className?: string; tone?: "black" | "white"; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <Shell shell={tone === "black" ? "#111111" : "#ffffff"} line={tone === "black" ? "#ffffff" : "#111111"} />
    </svg>
  );
}

/**
 * Wordmark: cowry + ÌṢÚRA, optionally with the tagline underneath.
 * ink = letters and shell colour; paper = the background it sits on (used for the shell's opening).
 */
export function Wordmark({ className = "h-10", ink = "#111111", paper = "#ffffff", tagline = true, mark = true, title = "ÌṢÚRA" }: {
  className?: string; ink?: string; paper?: string; tagline?: boolean; mark?: boolean; title?: string;
}) {
  const x0 = mark ? 86 : 0;
  const w = x0 + 250;
  return (
    <svg viewBox={`-6 -30 ${w + 12} ${tagline ? 138 : 120}`} className={className} role="img" aria-label={tagline ? `${title}. ${TAGLINE}` : title}>
      {mark && (
        <g transform="translate(-4 -14) scale(1.42)"><Shell shell={ink} line={paper} /></g>
      )}
      <g transform={`translate(${x0} 0)`} fill="none" stroke={ink} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round">
        {/* Ì */}
        <path d="M4 0v60" /><path d="M-4 -22l10 10" />
        {/* Ṣ */}
        <path d="M60 8C56 2 50 0 43.5 0 33 0 26 6 26 15c0 19 36 13 36 31 0 9-7 14-17.5 14C36 60 29 56.5 25 50.5" />
        {/* Ú */}
        <path d="M84 0v38c0 14 7.5 22 19 22s19-8 19-22V0" /><path d="M99 -12l10 -10" />
        {/* R */}
        <path d="M144 60V0h20c11 0 17 7 17 16.5S175 33 164 33h-20M162 33l21 27" />
        {/* A */}
        <path d="M200 60l18-60 18 60M206.5 40h23" />
      </g>
      {/* dot under the S */}
      <circle cx={x0 + 44} cy="76" r="5.2" fill={ink} />
      {tagline && (
        <text x={x0} y="104" fill={ink} fontFamily="'DM Sans Variable', 'DM Sans', Arial, sans-serif" fontSize="14" fontWeight="600" letterSpacing="0.9">
          {TAGLINE}
        </text>
      )}
    </svg>
  );
}

/** Kept for older imports. */
export const VelvetWordmark = Wordmark;

/** Square app mark: black cowry on white, same artwork as /icon.svg (the favicon). */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#ffffff" />
      <g transform="translate(6.4 6.4) scale(.8)"><Shell shell="#111111" line="#ffffff" shine={false} /></g>
    </svg>
  );
}

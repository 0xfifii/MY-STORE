/**
 * Palm Store brand.
 * Mark: an arched shop window with an orange sun and a palm tree, standing on a striped awning.
 * Colours: deep aqua #006D77, seafoam #83C5BE, pale ice #EDF6F9, warm orange #F4A261, terracotta #E76F51.
 * "dark" = aqua artwork (on light backgrounds); "light" = pale artwork (on aqua or dark backgrounds).
 * Wordmark: "Palm Store" in Fraunces (the heavy soft serif), next to the mark.
 */

import { useId } from "react";

export const BRAND = "Palm Store";
export const TAGLINE = "Every Valuable, Accounted For.";

export const BRAND_COLORS = {
  aqua: "#006D77",
  seafoam: "#83C5BE",
  ice: "#EDF6F9",
  orange: "#F4A261",
  terracotta: "#E76F51",
};

const ARCH = "M8 58V28C8 14.7 18.7 4 32 4s24 10.7 24 24v30Z";
const SCALLOPS = "M4 50h56v4.5a3.5 3.5 0 0 1-7 0 3.5 3.5 0 0 1-7 0 3.5 3.5 0 0 1-7 0 3.5 3.5 0 0 1-7 0 3.5 3.5 0 0 1-7 0 3.5 3.5 0 0 1-7 0 3.5 3.5 0 0 1-7 0 3.5 3.5 0 0 1-7 0Z";

/**
 * The drawing on a 64 x 64 grid (no <svg> wrapper): an arched shop window holding an orange sun and a palm tree,
 * standing on a striped awning. `arch` is the window colour, `palm` the tree (they swap on dark backgrounds).
 */
function Shop({ arch, palm, id }: { arch: string; palm: string; id: string }) {
  return (
    <>
      <defs><clipPath id={id}><path d={ARCH} /></clipPath></defs>
      <path d={ARCH} fill={arch} />
      <g clipPath={`url(#${id})`}>
        <circle cx="40" cy="25" r="11" fill={BRAND_COLORS.orange} />
        <path d="M27 58C29 46 31.5 36 31 24" fill="none" stroke={palm} strokeWidth="5" strokeLinecap="round" />
        <g fill={palm}>
          <path d="M31 22C24 14 13 14 6 21 14 20.5 22 22 31 22Z" />
          <path d="M31 22C24.5 23 18 29 16.5 38 22 32 26.5 27 31 22Z" />
          <path d="M31 22C33 12 42 6.5 53 8 46.5 13.5 39 18 31 22Z" />
          <path d="M31 22C40.5 18.5 51 22 56 31.5 48 28.5 39.5 26 31 22Z" />
          <path d="M31 22C28.5 13.5 22 8 13 7.5 19 12 25 17 31 22Z" />
        </g>
        <circle cx="33" cy="25" r="2.3" fill={BRAND_COLORS.terracotta} />
        <circle cx="29.5" cy="26" r="2.1" fill={BRAND_COLORS.terracotta} />
      </g>
      <path d={SCALLOPS} fill={BRAND_COLORS.orange} />
      <g fill={BRAND_COLORS.terracotta}>
        <path d="M11 50h7v4.5a3.5 3.5 0 0 1-7 0Z" /><path d="M25 50h7v4.5a3.5 3.5 0 0 1-7 0Z" />
        <path d="M39 50h7v4.5a3.5 3.5 0 0 1-7 0Z" /><path d="M53 50h7v4.5a3.5 3.5 0 0 1-7 0Z" />
      </g>
      <rect x="4" y="47" width="56" height="3.5" rx="1.2" fill="#0F2A2E" />
    </>
  );
}

/** The Palm Store mark. `tone="white"` (or "light") is for aqua or dark backgrounds. */
export function PalmMark({ className = "size-9", tone = "black", title }: { className?: string; tone?: "black" | "white" | "dark" | "light"; title?: string }) {
  const light = tone === "white" || tone === "light";
  const id = useId();
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <Shop arch={light ? BRAND_COLORS.ice : BRAND_COLORS.aqua} palm={light ? BRAND_COLORS.aqua : BRAND_COLORS.ice} id={`pm${id}`} />
    </svg>
  );
}
/** Older name for the mark, kept so existing imports keep working. */
export const Cowry = PalmMark;

/**
 * Wordmark: the mark + "Palm Store", optionally with the tagline underneath.
 * ink = colour of the letters (aqua on light backgrounds, pale ice on dark ones).
 */
export function Wordmark({ className = "h-10", ink = BRAND_COLORS.aqua, tagline = true, mark = true, title = BRAND }: {
  className?: string; ink?: string; paper?: string; tagline?: boolean; mark?: boolean; title?: string;
}) {
  const light = ink.toLowerCase() === "#ffffff" || ink.toLowerCase() === BRAND_COLORS.ice.toLowerCase();
  const id = useId();
  const x0 = mark ? 74 : 0;
  return (
    <svg viewBox={`0 0 ${x0 + 300} ${tagline ? 96 : 72}`} className={className} role="img" aria-label={tagline ? `${title}. ${TAGLINE}` : title}>
      {mark && (
        <g transform="translate(0 2) scale(1.06)">
          <Shop arch={light ? BRAND_COLORS.ice : BRAND_COLORS.aqua} palm={light ? BRAND_COLORS.aqua : BRAND_COLORS.ice} id={`pw${id}`} />
        </g>
      )}
      <text x={x0} y="56" fill={ink} fontFamily="'Fraunces Variable', 'Fraunces', Georgia, serif" fontSize="50" fontWeight="800"
        letterSpacing="-1.5" style={{ fontVariationSettings: "'SOFT' 100, 'WONK' 0, 'opsz' 72" }}>
        Palm Store
      </text>
      {tagline && (
        <text x={x0 + 2} y="88" fill={ink} fontFamily="'Plus Jakarta Sans Variable', 'Plus Jakarta Sans', Arial, sans-serif" fontSize="15" fontWeight="700" letterSpacing="0.4">
          {TAGLINE}
        </text>
      )}
    </svg>
  );
}

/** Kept for older imports. */
export const VelvetWordmark = Wordmark;

/** Square app mark on pale ice, same artwork as /icon.svg (the favicon). */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" fill={BRAND_COLORS.ice} />
      <g transform="translate(6.4 6.4) scale(.8)"><Shop arch={BRAND_COLORS.aqua} palm={BRAND_COLORS.ice} id={`pl${id}`} /></g>
    </svg>
  );
}

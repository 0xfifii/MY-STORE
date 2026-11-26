/**
 * Palm Store brand.
 * Mark: a terracotta shopping bag with a teal handle and a cream P on the front.
 * Colours: terracotta #C4553A, cream #FBF3E8, beige #F3E6D3, sand orange #F4A261, a little teal #006D77, brown #3A2418.
 * "dark" = terracotta bag (on light backgrounds); "light" = cream bag (on terracotta or dark backgrounds).
 * Wordmark: "Palm Store" in Fraunces (the heavy soft serif), next to the mark.
 */

export const BRAND = "Palm Store";
export const TAGLINE = "Every Valuable, Accounted For.";

export const BRAND_COLORS = {
  terracotta: "#C4553A",
  cream: "#FBF3E8",
  beige: "#F3E6D3",
  orange: "#F4A261",
  teal: "#006D77",
  brown: "#3A2418",
};

/** The letter P from Fraunces (heavy, soft), as an outline so it looks the same everywhere, sized for the bag. */
const LETTER_P = "M1405.3733207210898 877.1828002929688Q1405.3733207210898 740.1526867672801 1338.5632747411728 638.0659200027585Q1271.7532287612557 535.9791532382369 1144.4063417576253 480.2224277742207Q1017.0594547539949 424.4657023102045 835.6889355480671 424.4657023102045Q727.5286088064313 424.4657023102045 632.8052685558796 449.782474771142Q538.0819283053279 475.0992472320795 462.96516805142164 516.4559492990375L482.19856648892164 686.6009440124035Q522.7185567244887 663.5442948415875 556.6882570423186 646.2325830087066Q590.6579573601484 628.9208711758256 628.494359947741 619.594161581248Q666.3307625353336 610.2674519866705 716.0175109878182 610.2674519866705Q791.566890463233 610.2674519866705 851.1047890223563 642.0873130299151Q910.6426875814795 673.9071740731597 945.3008001707494 736.8852687589824Q979.9589127600193 799.8633634448051 979.9589127600193 893.1197237148881Q979.9589127600193 984.7493265792727 941.2342108152807 1054.847331136465Q902.509508870542 1124.9453356936574 832.2701153568923 1165.2234792076051Q762.0307218432426 1205.5016227215528 668.1649971529841 1205.5016227215528H643.5100773125887V301.39209025353193Q643.5100773125887 263.60537638515234 656.3766524270177 245.11371073499322Q669.2432275414467 226.6220450848341 696.446504317224 215.99195597320795L757.1161059588194 192.65179443359375Q789.912945151329 179.6550040692091 804.8930108658969 157.14982137084007Q819.8730765804648 134.64463867247105 819.8730765804648 96.25758097320795Q819.8730765804648 51.0538098141551 793.3261773698032 25.52690490707755Q766.7792781591415 0 712.6088301613927 0H174.74363362789154Q121.06652018427849 0 94.27295369654894 25.52690490707755Q67.47938720881939 51.0538098141551 67.47938720881939 96.25758097320795Q67.47938720881939 166.2748559564352 130.18970174342394 199.36519856750965L162.932621255517 215.99195597320795Q188.5992390960455 229.4487516283989 201.23247680813074 247.41375752910972Q213.865714520216 265.37876342982054 213.865714520216 301.39209025353193V1098.607909746468Q213.865714520216 1134.6445646137 201.23247680813074 1152.6112363673747Q188.5992390960455 1170.5779081210494 162.932621255517 1184.008044026792L130.18970174342394 1200.6348014324903Q67.47938720881939 1233.7251440435648 67.47938720881939 1303.742419026792Q67.47938720881939 1348.9695182293653 94.27295369654894 1374.4847591146827Q121.06652018427849 1400 174.74363362789154 1400H686.6985664889216Q921.8258121758699 1400 1081.816119182855 1331.699951171875Q1241.8064261898398 1263.39990234375 1323.5898734554648 1145.3547910563648Q1405.3733207210898 1027.3096797689795 1405.3733207210898 877.1828002929688Z";
const P_TRANSFORM = "translate(20.51 53) scale(0.01643 -0.01643)";

/**
 * The drawing on a 64 x 64 grid (no <svg> wrapper): a shopping bag with a teal handle and a P on the front.
 * `bag` is the bag colour, `letter` the P (they swap on dark backgrounds).
 */
function Shop({ arch: bag, palm: letter }: { arch: string; palm: string; id?: string }) {
  const fold = bag === BRAND_COLORS.terracotta ? "#A8452E" : BRAND_COLORS.beige;
  return (
    <>
      <path d="M22.5 22V16.5a9.5 9.5 0 0 1 19 0V22" fill="none" stroke={BRAND_COLORS.teal} strokeWidth="4.4" strokeLinecap="round" />
      <path d="M12.2 20.5h39.6a3 3 0 0 1 3 2.8l2 31.4a4.5 4.5 0 0 1-4.5 4.8H11.7a4.5 4.5 0 0 1-4.5-4.8l2-31.4a3 3 0 0 1 3-2.8Z" fill={bag} />
      <path d="M9.4 26.5h45.2l.3-3.2a3 3 0 0 0-3-2.8H12.1a3 3 0 0 0-3 2.8Z" fill={fold} />
      <circle cx="22.5" cy="24" r="1.9" fill={letter === BRAND_COLORS.cream ? "#F4E8D8" : BRAND_COLORS.terracotta} />
      <circle cx="41.5" cy="24" r="1.9" fill={letter === BRAND_COLORS.cream ? "#F4E8D8" : BRAND_COLORS.terracotta} />
      <path transform={P_TRANSFORM} d={LETTER_P} fill={letter} />
    </>
  );
}

/** The Palm Store mark. `tone="white"` (or "light") is for terracotta or dark backgrounds. */
export function PalmMark({ className = "size-9", tone = "black", title }: { className?: string; tone?: "black" | "white" | "dark" | "light"; title?: string }) {
  const light = tone === "white" || tone === "light";
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <Shop arch={light ? BRAND_COLORS.cream : BRAND_COLORS.terracotta} palm={light ? BRAND_COLORS.terracotta : BRAND_COLORS.cream} />
    </svg>
  );
}
/** Older name for the mark, kept so existing imports keep working. */
export const Cowry = PalmMark;

/**
 * Wordmark: the mark + "Palm Store", optionally with the tagline underneath.
 * ink = colour of the letters (terracotta on light backgrounds, cream on dark ones).
 */
export function Wordmark({ className = "h-10", ink = BRAND_COLORS.terracotta, tagline = true, mark = true, title = BRAND }: {
  className?: string; ink?: string; paper?: string; tagline?: boolean; mark?: boolean; title?: string;
}) {
  const light = ink.toLowerCase() === "#ffffff" || ink.toLowerCase() === BRAND_COLORS.cream.toLowerCase();
  const x0 = mark ? 74 : 0;
  return (
    <svg viewBox={`0 0 ${x0 + 300} ${tagline ? 96 : 72}`} className={className} role="img" aria-label={tagline ? `${title}. ${TAGLINE}` : title}>
      {mark && (
        <g transform="translate(0 2) scale(1.06)">
          <Shop arch={light ? BRAND_COLORS.cream : BRAND_COLORS.terracotta} palm={light ? BRAND_COLORS.terracotta : BRAND_COLORS.cream} />
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

/** Square app mark on cream, same artwork as /icon.svg (the favicon). */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" fill={BRAND_COLORS.cream} />
      <g transform="translate(6.4 6.4) scale(.8)"><Shop arch={BRAND_COLORS.terracotta} palm={BRAND_COLORS.cream} /></g>
    </svg>
  );
}

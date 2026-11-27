/**
 * Palm Store brand, aligned with Palmspring Social Eatery (palmspringsocialeatery.com):
 * "PALMSTORE" in wide geometric capitals (Michroma, made heavier) where the L is a palm tree,
 * in Palmspring's burnt orange #C65A29 on white, with charcoal #2B2B2B text.
 * Everything is drawn as outlines, so the logo looks the same in the app, emails, PDFs and icons.
 */

export const BRAND = "Palm Store";
export const TAGLINE = "Every Valuable, Accounted For.";

export const BRAND_COLORS = {
  orange: "#C65A29",
  orangeDeep: "#A84A20",
  charcoal: "#2B2B2B",
  cream: "#FFF8F2",
  white: "#FFFFFF",
};

/** Letters of PALMSTORE (font units, y up per letter); the L is the palm below. */
const LETTERS: [string, string][] = [["translate(0 1936) scale(1 -1)", "M196 0V1536H1224Q1449 1536 1586.5 1514.0Q1724 1492 1795.0 1440.5Q1866 1389 1891.0 1301.5Q1916 1214 1916 1084V1044Q1916 920 1890.5 833.5Q1865 747 1792.0 694.0Q1719 641 1581.0 616.5Q1443 592 1218 592H388V0ZM1724 1084Q1724 1179 1706.0 1236.0Q1688 1293 1634.0 1322.0Q1580 1351 1473.0 1360.5Q1366 1370 1187 1370H388V758H1187Q1366 758 1473.0 769.5Q1580 781 1634.0 811.5Q1688 842 1706.0 898.5Q1724 955 1724 1044Z"], ["translate(1981 1936) scale(1 -1)", "M64 0L960 1536L1216 1536L2112 0L1888 0L1088 1408L288 0Z"], ["translate(4957 1936) scale(1 -1)", "M196 0V1536H482L1411 283L2326 1536H2612V0H2420V1362L1503 101H1329L388 1362V0Z"], ["translate(7755 1936) scale(1 -1)", "M1827 444Q1827 533 1813.0 584.0Q1799 635 1750.0 659.5Q1701 684 1598.0 691.5Q1495 699 1316 702L760 710Q554 713 429.0 735.0Q304 757 240.0 804.5Q176 852 154.5 932.0Q133 1012 133 1132Q133 1263 162.5 1348.0Q192 1433 269.5 1481.0Q347 1529 489.0 1548.5Q631 1568 856 1568H1284Q1488 1568 1624.0 1555.0Q1760 1542 1840.0 1495.0Q1920 1448 1954.5 1349.0Q1989 1250 1989 1077H1797Q1797 1211 1771.5 1279.5Q1746 1348 1687.5 1373.0Q1629 1398 1530.0 1400.0Q1431 1402 1284 1402H866Q687 1402 579.5 1395.0Q472 1388 417.0 1363.0Q362 1338 343.5 1283.0Q325 1228 325 1132Q325 1051 338.0 1002.0Q351 953 396.5 927.5Q442 902 537.0 892.5Q632 883 796 881L1392 873Q1602 870 1727.5 848.5Q1853 827 1915.5 779.0Q1978 731 1998.5 649.5Q2019 568 2019 444Q2019 309 1993.5 217.5Q1968 126 1895.0 71.0Q1822 16 1684.0 -8.0Q1546 -32 1321 -32H853Q648 -32 509.0 -14.0Q370 4 287.5 58.5Q205 113 169.0 221.0Q133 329 133 509H325Q325 368 348.0 291.0Q371 214 428.5 180.5Q486 147 589.5 140.5Q693 134 853 134H1311Q1490 134 1594.0 145.5Q1698 157 1748.0 189.5Q1798 222 1812.5 283.0Q1827 344 1827 444Z"], ["translate(9887 1936) scale(1 -1)", "M862 0V1376H94V1536H1822V1376H1054V0Z"], ["translate(11793 1936) scale(1 -1)", "M871 -32Q646 -32 501.0 -1.5Q356 29 274.5 111.0Q193 193 160.5 347.0Q128 501 128 748V788Q128 992 148.0 1130.5Q168 1269 217.0 1356.0Q266 1443 350.5 1489.0Q435 1535 563.0 1551.5Q691 1568 871 1568H1274Q1454 1568 1582.0 1551.5Q1710 1535 1794.5 1489.0Q1879 1443 1928.0 1356.0Q1977 1269 1997.0 1130.5Q2017 992 2017 788V748Q2017 501 1984.5 347.0Q1952 193 1870.5 111.0Q1789 29 1644.0 -1.5Q1499 -32 1274 -32ZM871 134H1274Q1417 134 1515.0 144.0Q1613 154 1674.5 187.0Q1736 220 1768.5 287.0Q1801 354 1813.0 466.0Q1825 578 1825 748V788Q1825 964 1813.0 1078.0Q1801 1192 1768.5 1258.0Q1736 1324 1674.5 1354.5Q1613 1385 1515.0 1393.5Q1417 1402 1274 1402H871Q728 1402 630.0 1393.5Q532 1385 470.5 1354.5Q409 1324 376.5 1258.0Q344 1192 332.0 1078.0Q320 964 320 788V748Q320 578 332.0 466.0Q344 354 376.5 287.0Q409 220 470.5 187.0Q532 154 630.0 144.0Q728 134 871 134Z"], ["translate(13928 1936) scale(1 -1)", "M196 1536H1224Q1449 1536 1586.5 1516.0Q1724 1496 1795.0 1447.0Q1866 1398 1891.0 1313.0Q1916 1228 1916 1098V1058Q1916 938 1887.5 851.5Q1859 765 1778.0 711.5Q1697 658 1538 636L1872 0H1680L1353 622Q1333 621 1311.5 621.0Q1290 621 1267 621H388V0H196ZM388 787H1237Q1408 787 1506.5 798.5Q1605 810 1651.5 839.0Q1698 868 1711.0 921.0Q1724 974 1724 1058V1098Q1724 1193 1706.0 1248.0Q1688 1303 1634.0 1329.0Q1580 1355 1473.0 1362.5Q1366 1370 1187 1370H388Z"], ["translate(16005 1936) scale(1 -1)", "M192 0V1536H1700V1376H384V864H1645V704H384V160H1728V0Z"]];
/** The palm tree that stands in for the L: [path, extra stroke]. */
const PALM: [string, number][] = [["M4407.0 1996L4707.0 1996L4632.0 600L4512.0 600Z", 0], ["M4567 560C4042 192 3237 262 2940 822C3412 542 3937 525 4567 630Z", 70], ["M4567 560C5092 192 5897 262 6194 822C5722 542 5197 525 4567 630Z", 70], ["M4550 542C4252 105 3814 -140 3447 -158C3780 35 4112 298 4584 595Z", 70], ["M4584 542C4882 105 5320 -140 5687 -158C5354 35 5022 298 4550 595Z", 70], ["M4532 560C4462 210 4550 -105 4690 -262C4707 35 4672 298 4620 560Z", 70]];
const WIDTH = 17797;
const LETTER_WEIGHT = 120;

function Palm({ color }: { color: string }) {
  return (
    <>
      {PALM.map(([d, sw], i) => (
        <path key={i} d={d} fill={color} stroke={sw ? color : undefined} strokeWidth={sw || undefined} strokeLinejoin="round" />
      ))}
    </>
  );
}

/** The palm tree alone: the app icon. `tone="white"` (or "light") for orange or dark backgrounds. */
export function PalmMark({ className = "size-9", tone = "black", title }: { className?: string; tone?: "black" | "white" | "dark" | "light"; title?: string }) {
  const light = tone === "white" || tone === "light";
  return (
    <svg viewBox="2840 -760 3460 3460" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <Palm color={light ? BRAND_COLORS.cream : BRAND_COLORS.orange} />
    </svg>
  );
}
/** Older name for the mark, kept so existing imports keep working. */
export const Cowry = PalmMark;

/**
 * Wordmark: PALMSTORE with the palm L, and the tagline in spaced capitals underneath on the right
 * (like "SOCIAL EATERY" under PALMSPRING). ink = colour of the letters.
 */
export function Wordmark({ className = "h-10", ink = BRAND_COLORS.orange, tagline = true, title = BRAND }: {
  className?: string; ink?: string; paper?: string; tagline?: boolean; mark?: boolean; title?: string;
}) {
  const h = tagline ? 3080 : 2440;
  return (
    <svg viewBox={`-80 -330 ${WIDTH + 160} ${h}`} className={className} role="img" aria-label={tagline ? `${title}. ${TAGLINE}` : title}>
      <g fill={ink}>
        {LETTERS.map(([t, d], i) => (
          <path key={i} transform={t} d={d} stroke={ink} strokeWidth={LETTER_WEIGHT} strokeLinejoin="round" />
        ))}
      </g>
      <Palm color={ink} />
      {tagline && (
        <text x={WIDTH} y="2660" textAnchor="end" fill={ink} fontFamily="'Plus Jakarta Sans Variable', 'Plus Jakarta Sans', Arial, sans-serif"
          fontSize="440" fontWeight="600" letterSpacing="150">
          {TAGLINE.replace(".", "").toUpperCase()}
        </text>
      )}
    </svg>
  );
}

/** Kept for older imports. */
export const VelvetWordmark = Wordmark;

/** Square app icon: the orange palm on white, same artwork as /icon.svg (the favicon). */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="2740 -860 3660 3660" className={className} aria-hidden>
      <rect x="2740" y="-860" width="3660" height="3660" rx="800" fill="#FFFFFF" />
      <Palm color={BRAND_COLORS.orange} />
    </svg>
  );
}

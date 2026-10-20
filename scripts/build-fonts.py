"""One-off: builds DM Sans TTFs with a Naira sign (U+20A6) drawn from the font's own 'N' plus two bars.
DM Sans ships without ₦; this keeps amounts in the same typeface in the app and in PDF reports.
Usage: python3 scripts/build-fonts.py   (needs fontTools; reads @fontsource/dm-sans from node_modules)"""
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.boundsPen import BoundsPen
import os, sys

SRC = "node_modules/@fontsource/dm-sans/files/dm-sans-latin-{w}-normal.woff"
OUT = "assets/fonts"
os.makedirs(OUT, exist_ok=True)
os.makedirs("public/fonts", exist_ok=True)

for w, name in [(400, "Regular"), (500, "Medium"), (700, "Bold")]:
    f = TTFont(SRC.format(w=w))
    f.flavor = None
    gs = f.getGlyphSet()
    cmap = f.getBestCmap()
    nname = cmap[ord("N")]
    hyph = cmap[ord("-")]
    b = BoundsPen(gs); gs[nname].draw(b); x0, y0, x1, y1 = b.bounds
    hb = BoundsPen(gs); gs[hyph].draw(hb); bar = round(hb.bounds[3] - hb.bounds[1])  # stroke weight of the hyphen
    pen = TTGlyphPen(gs)
    gs[nname].draw(pen)
    over = round((x1 - x0) * 0.12)
    for yc in (round(y1 * 0.40), round(y1 * 0.62)):
        lo, hi = yc - bar // 2, yc + bar - bar // 2
        pen.moveTo((x0 - over, lo)); pen.lineTo((x0 - over, hi)); pen.lineTo((x1 + over, hi)); pen.lineTo((x1 + over, lo)); pen.closePath()
    glyph = pen.glyph()
    gname = "uni20A6"
    f["glyf"][gname] = glyph
    f["hmtx"][gname] = f["hmtx"][nname]
    order = f.getGlyphOrder()
    if gname not in order:
        order.append(gname); f.setGlyphOrder(order)
    for t in f["cmap"].tables:
        if t.isUnicode():
            t.cmap[0x20A6] = gname
    f["maxp"].numGlyphs = len(f.getGlyphOrder())
    if "post" in f and f["post"].formatType == 2.0:
        f["post"].extraNames = getattr(f["post"], "extraNames", [])
    f.save(f"{OUT}/DMSans-{name}.ttf")
    # Web: a tiny font with only the Naira sign, used as a per-glyph fallback after DM Sans.
    from fontTools import subset
    opts = subset.Options(); opts.flavor = "woff2" if subset.__dict__.get("brotli") else None
    sub = TTFont(f"{OUT}/DMSans-{name}.ttf")
    s = subset.Subsetter(opts); s.populate(unicodes=[0x20A6]); s.subset(sub)
    sub.flavor = None
    sub.save(f"public/fonts/dm-sans-naira-{w}.ttf")
    print("built", name)

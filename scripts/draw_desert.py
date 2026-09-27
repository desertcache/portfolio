"""Draw the site's desert illustrations into assets/desert.svg.

The homepage carries line drawings of the Sonoran desert: saguaros, prickly
pear in fruit and flower, a palo verde in bloom, a barrel cactus, an
ocotillo, an agave sending up its bloom stalk, the red rocks of Sedona, and
the spring wildflowers (gold poppies, lupine, globemallow, brittlebush,
penstemon, a flowering hedgehog cactus). They are generated rather than
hand-plotted because the details are geometry: a saguaro's ribs follow the
curve of its trunk, a prickly pear's areoles stay inside their pads, a
butte's strata stop at its walls. Change a number here and re-run; the
output is committed and the site never runs this.

Output: one SVG sprite of <symbol>s, used on the page as
    <svg class="illo" viewBox="..."><use href="assets/desert.svg#saguaro"/></svg>

How the page styles them. Every element carries an inline style that reads
CSS custom properties, and custom properties inherit into a <use>, so the
page's CSS picks colour and mode without reaching into the sprite:
    --illo-line    stroke colour of every line
    --illo-paper   fill behind an outline: the section's background, so a pad
                   in front hides the pad behind it; a solid colour instead
                   turns the drawing into a silhouette
    --illo-fruit   prickly pear fruit, saguaro fruit
    --illo-flower  blossoms (palo verde, cactus flowers)
    --illo-ember   ocotillo flowers
    --illo-poppy   Mexican gold poppies
    --illo-lupine  lupine
    --illo-mallow  globemallow
    --illo-pink    penstemon and hedgehog cactus flowers
    --illo-w       stroke width, in the symbol's own units
    --draw         0..1, how much of each line is drawn. Every stroked path
                   has pathLength="1", so this one number animates them all;
                   fruit and flowers bloom in over its last third.

Usage: python3 scripts/draw_desert.py
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "assets" / "desert.svg"
BLOOM_OUT = OUT.parent / "bloom.svg"

_W = "stroke-width:var(--illo-w,1.6)"
_DRAW = "stroke-dasharray:1;stroke-dashoffset:calc(1 - var(--draw,1))"
_BLOOM = "opacity:clamp(0,calc(var(--draw,1) * 3 - 2),1)"
STYLE = {
    "outline": f"fill:var(--illo-paper,none);stroke:var(--illo-line,currentColor);{_W};stroke-linejoin:round;{_DRAW}",
    "line": f"fill:none;stroke:var(--illo-line,currentColor);{_W};stroke-linecap:round;stroke-linejoin:round;{_DRAW}",
    # zero-length subpaths with round caps: the cheapest dots SVG can draw
    "dots": "fill:none;stroke:var(--illo-line,currentColor);stroke-width:calc(var(--illo-w,1.6) * 1.35);stroke-linecap:round;opacity:clamp(0,calc(var(--draw,1) * 2 - .6),1)",
    "fruit": f"fill:var(--illo-fruit,#b8246a);stroke:none;{_BLOOM}",
    "flower": f"fill:var(--illo-flower,#e9b21a);stroke:none;{_BLOOM}",
    "ember": f"fill:var(--illo-ember,#d4452a);stroke:none;{_BLOOM}",
    "poppy": f"fill:var(--illo-poppy,#ee9a14);stroke:none;{_BLOOM}",
    "lupine": f"fill:var(--illo-lupine,#6a4fc4);stroke:none;{_BLOOM}",
    "mallow": f"fill:var(--illo-mallow,#e5703a);stroke:none;{_BLOOM}",
    "pink": f"fill:var(--illo-pink,#c42c6c);stroke:none;{_BLOOM}",
    "centre": f"fill:var(--illo-line,currentColor);stroke:none;{_BLOOM}",
    # petals drawn as round-capped strokes: a flower in a dozen bytes
    "mallow-dots": "fill:none;stroke:var(--illo-mallow,#e5703a);stroke-width:calc(var(--illo-w,1.6) * 2.2);stroke-linecap:round;" + _BLOOM,
    "rays": "fill:none;stroke:var(--illo-flower,#e9b21a);stroke-width:calc(var(--illo-w,1.6) * 1.35);stroke-linecap:round;" + _BLOOM,
    "blooms": "fill:none;stroke:var(--illo-flower,#e9b21a);stroke-width:calc(var(--illo-w,1.6) * 2.6);stroke-linecap:round;" + _BLOOM,
    # the second flush (assets/bloom.svg)
    "blue": f"fill:var(--illo-blue,#3553c9);stroke:none;{_BLOOM}",
    "violet-dots": "fill:none;stroke:var(--illo-violet,#9a3db3);stroke-width:calc(var(--illo-w,1.6) * 2.3);stroke-linecap:round;" + _BLOOM,
    "awns": "fill:none;stroke:var(--illo-violet,#9a3db3);stroke-width:calc(var(--illo-w,1.6) * .8);stroke-linecap:round;" + _BLOOM,
    "cream": f"fill:var(--illo-cream,#fff8e8);stroke:var(--illo-line,currentColor);{_W};stroke-linejoin:round;{_BLOOM}",
    "puff": "fill:none;stroke:var(--illo-pink,#c42c6c);stroke-width:calc(var(--illo-w,1.6) * .7);stroke-linecap:round;" + _BLOOM,
    "pink-dots": "fill:none;stroke:var(--illo-pink,#c42c6c);stroke-width:calc(var(--illo-w,1.6) * 1.6);stroke-linecap:round;" + _BLOOM,
    "gold-dots": "fill:none;stroke:var(--illo-poppy,#ee9a14);stroke-width:calc(var(--illo-w,1.6) * 3);stroke-linecap:round;" + _BLOOM,
}
STROKED = {"outline", "line"}


def n(v: float) -> str:
    """Compact number: one decimal, no trailing zeros."""
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def n0(v: float) -> str:
    """Whole units, for fine detail nobody can see at a tenth of a unit."""
    return str(int(round(v)))


def smooth(points: list[tuple[float, float]], closed: bool = False, tension: float = 1.0) -> str:
    """Catmull-Rom through the points, as cubic Beziers."""
    pts = points + points[:3] if closed else [points[0]] + points + [points[-1]]
    d = f"M{n(pts[1][0])} {n(pts[1][1])}" if closed else f"M{n(points[0][0])} {n(points[0][1])}"
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6 * tension, p1[1] + (p2[1] - p0[1]) / 6 * tension)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6 * tension, p2[1] - (p3[1] - p1[1]) / 6 * tension)
        d += f"C{n(c1[0])} {n(c1[1])} {n(c2[0])} {n(c2[1])} {n(p2[0])} {n(p2[1])}"
    return d + ("Z" if closed else "")


def ellipse_d(x: float, y: float, rx: float, ry: float, rot: float) -> str:
    """An ellipse as two arcs (so it is a path: it can carry pathLength and
    draw on). rx lies along the ellipse's own x axis, turned `rot` degrees."""
    r = math.radians(rot)
    dx, dy = rx * math.cos(r), rx * math.sin(r)
    a = f"a{n(rx)} {n(ry)} {n(rot)} 1 0"
    return f"M{n(x - dx)} {n(y - dy)}{a} {n(2 * dx)} {n(2 * dy)}{a} {n(-2 * dx)} {n(-2 * dy)}Z"


def dots_d(points: list[tuple[float, float]]) -> str:
    return "".join(f"M{n(x)} {n(y)}h0" for x, y in points)


@dataclass
class Symbol:
    id: str
    width: float
    height: float
    parts: list[str] = field(default_factory=list)

    def add(self, d: str, kind: str) -> None:
        if not d:
            return
        extra = ' pathLength="1"' if kind in STROKED else ""
        self.parts.append(f'<path d="{d}"{extra} style="{STYLE[kind]}"/>')

    def svg(self) -> str:
        return f'<symbol id="{self.id}" viewBox="0 0 {n(self.width)} {n(self.height)}">{"".join(self.parts)}</symbol>'


def ground(sym: Symbol, x0: float, x1: float, y: float, rnd: random.Random, tufts: int = 3) -> None:
    d = f"M{n(x0)} {n(y)}L{n(x1)} {n(y)}"
    for _ in range(tufts):
        gx = rnd.uniform(x0 + 8, x1 - 8)
        d += f"M{n(gx)} {n(y)}q1.5 -6 .5 -10M{n(gx + 3)} {n(y)}q1 -4 4 -7"
    sym.add(d, "line")


# ---------------------------------------------------------------------------
# Saguaro


@dataclass(frozen=True)
class Arm:
    side: int          # -1 left, +1 right
    join: float        # y where the arm's lower edge leaves the trunk
    thick: float       # arm thickness where it leaves the trunk
    reach: float       # trunk edge to the upright's centre line
    top: float         # y of the upright's dome
    half: float        # half-width of the upright


def saguaro(sym_id: str, *, cx: float, base: float, top: float, half: float, arms: tuple[Arm, ...],
            ribs: int = 7, blossoms: int = 3, fruit: int = 0, seed: int = 1) -> Symbol:
    """One outline around trunk and arms, ribs that wrap the cylinder, spine
    clusters along each rib, and a crown of May blossoms and red fruit."""
    rnd = random.Random(seed)
    extent = [cx - half, cx + half] + [cx + a.side * (half + a.reach + a.half) for a in arms]
    width = max(extent) + 30
    sym = Symbol(sym_id, width, base + 14)
    left = sorted((a for a in arms if a.side < 0), key=lambda a: -a.join)
    right = sorted((a for a in arms if a.side > 0), key=lambda a: a.join)
    x0, x1 = cx - half, cx + half

    # A trunk is not a pipe: a slight swell below the middle, a touch of lean.
    def edge(side: int, y: float) -> float:
        t = (base - y) / (base - top)
        swell = 1 + .05 * math.sin(t * math.pi * .9)
        return cx + side * half * swell + 2.5 * t

    def trunk_run(side: int, ya: float, yb: float) -> str:
        steps = max(2, int(abs(yb - ya) / 40))
        return "".join(f"L{n(edge(side, ya + (yb - ya) * k / steps))} {n(ya + (yb - ya) * k / steps)}" for k in range(1, steps + 1))

    d = f"M{n(edge(-1, base))} {n(base)}"
    y = base
    for a in left:
        d += trunk_run(-1, y, a.join)
        ex = edge(-1, a.join)
        ax = ex - a.reach
        ox, ix = ax - a.half, ax + a.half
        up = a.join - a.thick
        d += (f"C{n(ex - a.reach * .55)} {n(a.join + 2)} {n(ox)} {n(a.join - a.thick * .05)} {n(ox)} {n(a.join - a.thick * 1.25)}"
              f"L{n(ox)} {n(a.top + a.half)}A{n(a.half)} {n(a.half)} 0 0 1 {n(ix)} {n(a.top + a.half)}"
              f"L{n(ix)} {n(up - a.thick * .55)}C{n(ix)} {n(up - a.thick * .05)} {n(ex - a.reach * .3)} {n(up)} {n(edge(-1, up))} {n(up)}")
        y = up
    d += trunk_run(-1, y, top + half)
    tx0, tx1 = edge(-1, top + half), edge(1, top + half)
    d += f"A{n((tx1 - tx0) / 2)} {n(half)} 0 0 1 {n(tx1)} {n(top + half)}"
    y = top + half
    for a in right:
        up = a.join - a.thick
        d += trunk_run(1, y, up)
        ex = edge(1, up)
        ax = edge(1, a.join) + a.reach
        ix, ox = ax - a.half, ax + a.half
        d += (f"C{n(ex + a.reach * .3)} {n(up)} {n(ix)} {n(up - a.thick * .05)} {n(ix)} {n(up - a.thick * .55)}"
              f"L{n(ix)} {n(a.top + a.half)}A{n(a.half)} {n(a.half)} 0 0 1 {n(ox)} {n(a.top + a.half)}"
              f"L{n(ox)} {n(a.join - a.thick * 1.25)}C{n(ox)} {n(a.join - a.thick * .05)} {n(edge(1, a.join) + a.reach * .55)} {n(a.join + 2)} {n(edge(1, a.join))} {n(a.join)}")
        y = a.join
    d += trunk_run(1, y, base)
    sym.add(d, "outline")

    rib_d, dots = "", []

    def column(cxx: float, hw: float, y_top: float, y_bottom: float, count: int, lean: float = 0.0) -> None:
        nonlocal rib_d
        for k in range(count):
            t = -1 + 2 * (k + .5) / count
            dx = hw * math.sin(t * math.pi / 2 * .9)
            y_dome = y_top + hw - math.sqrt(max(hw * hw - dx * dx, 0))
            xb = cxx + dx * (1.04 if lean else 1)
            xt = cxx + dx + lean
            rib_d += f"M{n(xb)} {n(y_bottom)}L{n(xt)} {n(y_top + hw)}Q{n(xt)} {n(y_dome + 1.5)} {n(cxx + lean + dx * .2)} {n(y_top + 2.5)}"
            step = 13 + 7 * abs(t)
            yy = y_top + hw + rnd.uniform(2, step)
            while yy < y_bottom - 5:
                f = (y_bottom - yy) / max(1, y_bottom - y_top - hw)
                dots.append((xb + (xt - xb) * f, yy))
                yy += step

    column(cx, half, top, base - 3, ribs, lean=2.5)
    tips = [(cx + 2.5, top, half)]
    for a in arms:
        ax = (edge(1, a.join) + a.reach) if a.side > 0 else (edge(-1, a.join) - a.reach)
        column(ax, a.half, a.top, a.join - a.thick * 1.3, 3)
        tips.append((ax, a.top, a.half))
    sym.add(rib_d, "line")
    sym.add(dots_d(dots), "dots")

    # blossoms: cups of petals with a gold heart; fruit ripening beside them
    petals, hearts = "", []
    for i in range(blossoms):
        tx, ty, hw = tips[i % len(tips)]
        ang = rnd.uniform(-.9, .9)
        bx, by = tx + math.sin(ang) * hw * .75, ty + hw - math.cos(ang) * hw - 1.5
        for p in range(5):
            pa = -math.pi / 2 + (p - 2) * .42 + ang * .5
            petals += ellipse_d(bx + math.cos(pa) * 4, by + math.sin(pa) * 4, 2, 3.6, math.degrees(pa) + 90)
        hearts.append((bx, by + .5))
    sym.add(petals, "flower")
    fruit_d = ""
    for i in range(fruit):
        tx, ty, hw = tips[(i + 1) % len(tips)]
        fruit_d += ellipse_d(tx + rnd.uniform(-.55, .55) * hw, ty + 1, 2.8, 4.4, rnd.uniform(-25, 25))
    sym.add(fruit_d, "fruit")
    sym.add(dots_d(hearts), "fruit")
    ground(sym, cx - half * 3, cx + half * 3.3, base, rnd)
    return sym


# ---------------------------------------------------------------------------
# Prickly pear


@dataclass(frozen=True)
class Pad:
    x: float
    y: float
    rx: float
    ry: float
    rot: float                        # degrees, 0 = upright
    fruit: tuple[float, ...] = ()     # rim angles (degrees from the pad's top) bearing a fruit
    flowers: tuple[float, ...] = ()   # rim angles bearing an open flower


def rim(p: Pad, deg: float, out: float = 0.0) -> tuple[float, float, float]:
    """A point `out` beyond the pad's rim at `deg`, and the outward angle."""
    a = math.radians(deg)
    lx, ly = math.sin(a) * (p.rx + out), -math.cos(a) * (p.ry + out)
    r = math.radians(p.rot)
    return p.x + lx * math.cos(r) - ly * math.sin(r), p.y + lx * math.sin(r) + ly * math.cos(r), deg + p.rot


def flower(x: float, y: float, facing: float, size: float) -> str:
    """An open cactus flower: a cup of petals opening along `facing` degrees."""
    d = ""
    for k in range(6):
        pa = math.radians(facing - 90 + (k - 2.5) * 24)
        d += ellipse_d(x + math.cos(pa) * size * .9, y + math.sin(pa) * size * .9, size * .45, size * .95, math.degrees(pa) + 90)
    return d


def prickly_pear(sym_id: str, pads: tuple[Pad, ...], width: float, height: float, base: float, seed: int = 3) -> Symbol:
    """Pads back to front, each filled with the paper colour so the pad in
    front hides the one behind; areoles on a diagonal lattice inside each pad
    with a few spines; magenta fruit and gold flowers on the rims."""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, width, height)
    for p in pads:
        sym.add(ellipse_d(p.x, p.y, p.rx, p.ry, p.rot), "outline")
        r = math.radians(p.rot)
        step = max(11.0, p.rx / 3)
        dots, spines = [], ""
        for i in range(-6, 7):
            for j in range(-8, 9):
                lx, ly = i * step + (j % 2) * step / 2, j * step * .85
                if (lx / (p.rx - 6)) ** 2 + (ly / (p.ry - 6)) ** 2 >= 1:
                    continue
                x = p.x + lx * math.cos(r) - ly * math.sin(r)
                y = p.y + lx * math.sin(r) + ly * math.cos(r)
                dots.append((x, y))
                if rnd.random() < .22:
                    a = rnd.uniform(0, math.tau)
                    spines += f"M{n(x)} {n(y)}l{n(math.cos(a) * 4.5)} {n(math.sin(a) * 4.5)}"
        sym.add(dots_d(dots), "dots")
        sym.add(spines, "line")
        fruit = "".join(ellipse_d(*rim(p, deg, 7)[:2], 5, 8, rim(p, deg)[2]) for deg in p.fruit)
        sym.add(fruit, "fruit")
        petals, hearts = "", []
        for deg in p.flowers:
            x, y, a = rim(p, deg, 5)
            petals += flower(x, y, a, 7)
            hearts.append((x, y))
        sym.add(petals, "flower")
        sym.add(dots_d(hearts), "fruit")
    ground(sym, width * .06, width * .95, base, rnd, tufts=2)
    return sym


# ---------------------------------------------------------------------------
# Barrel cactus


def barrel(sym_id: str, *, cx: float, base: float, rx: float, height: float, ribs: int = 9, seed: int = 5) -> Symbol:
    """A fishhook barrel: a squat column whose ribs meet at the crown, and a
    ring of gold flowers and fruit on top."""
    rnd = random.Random(seed)
    top = base - height
    sym = Symbol(sym_id, cx * 2, base + 12)
    outline = [(cx - rx * .92, base), (cx - rx, base - height * .45), (cx - rx * .82, top + height * .16), (cx - rx * .42, top + 2),
               (cx, top - 2), (cx + rx * .42, top + 2), (cx + rx * .82, top + height * .16), (cx + rx, base - height * .45), (cx + rx * .92, base)]
    sym.add(smooth(outline), "outline")
    rib_d, dots = "", []
    for k in range(ribs):
        t = -1 + 2 * (k + .5) / ribs
        s = math.sin(t * math.pi / 2 * .92)
        pts = [(cx + s * rx * .9, base - 2), (cx + s * rx * .97, base - height * .45), (cx + s * rx * .72, top + height * .18), (cx + s * rx * .18, top + 3)]
        rib_d += smooth(pts)
        for f in (.15, .3, .45, .6, .75):
            j = min(len(pts) - 2, int(f * (len(pts) - 1)))
            u = f * (len(pts) - 1) - j
            dots.append((pts[j][0] + (pts[j + 1][0] - pts[j][0]) * u, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * u))
    sym.add(rib_d, "line")
    sym.add(dots_d(dots), "dots")
    petals, fruit = "", ""
    for k in range(5):
        a = -math.pi + (k + .5) / 5 * math.pi
        x, y = cx + math.cos(a) * rx * .55, top + 3 + math.sin(a) * 4
        if k % 2:
            fruit += ellipse_d(x, y - 3, 3.2, 5, math.degrees(a) + 90)
        else:
            petals += flower(x, y - 2, math.degrees(a) + 90, 5)
    sym.add(petals, "flower")
    sym.add(fruit, "flower")
    ground(sym, cx - rx * 1.6, cx + rx * 1.7, base, rnd, tufts=2)
    return sym


# ---------------------------------------------------------------------------
# Ocotillo


def ocotillo(sym_id: str, *, cx: float, base: float, canes: int = 11, height: float = 300, seed: int = 7) -> Symbol:
    """A fan of whip-thin canes, leafed out after rain, each tipped with a
    scarlet flower spike."""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, cx * 2, base + 12)
    cane_d, leaves, tips = "", "", ""
    for k in range(canes):
        t = -1 + 2 * k / (canes - 1)
        ang = math.radians(t * 34 + rnd.uniform(-4, 4))
        h = height * rnd.uniform(.72, 1.0) * (1 - .18 * abs(t))
        x0 = cx + t * 7
        ex, ey = x0 + math.sin(ang) * h, base - math.cos(ang) * h
        bend = rnd.uniform(-12, 12)
        mx, my = (x0 + ex) / 2 + bend, (base + ey) / 2
        cane_d += f"M{n(x0)} {n(base)}Q{n(mx)} {n(my)} {n(ex)} {n(ey)}"
        for f in [i / 9 for i in range(2, 9)]:
            # a point on the quadratic, and short leaves off both sides
            x = (1 - f) ** 2 * x0 + 2 * (1 - f) * f * mx + f * f * ex
            y = (1 - f) ** 2 * base + 2 * (1 - f) * f * my + f * f * ey
            s = 1 if rnd.random() < .5 else -1
            leaves += f"M{n(x)} {n(y)}l{n(s * 5)} {n(-4)}"
        tips += ellipse_d(ex, ey - 7, 2.6, 8, math.degrees(ang))
    sym.add(cane_d, "line")
    sym.add(leaves, "line")
    sym.add(tips, "ember")
    ground(sym, cx - 60, cx + 64, base, rnd, tufts=2)
    return sym


# ---------------------------------------------------------------------------
# Palo verde


def palo_verde(sym_id: str, *, cx: float, base: float, seed: int = 11) -> Symbol:
    """Arizona's state tree in April: a short trunk splitting low into green
    limbs that zig-zag outward into a wide, rounded crown, tiny leaves, and a
    haze of yellow blossom through the whole canopy."""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, cx * 2, base + 12)
    limbs, twigs, leaves, blooms = "", "", [], []

    def grow(x: float, y: float, ang: float, length: float, depth: int) -> None:
        nonlocal limbs, twigs
        ex = x + math.sin(ang) * length
        ey = y - math.cos(ang) * length
        kink = rnd.uniform(-.16, .16) * length                  # palo verde limbs zig-zag
        mx = (x + ex) / 2 + kink * math.cos(ang)
        my = (y + ey) / 2 + kink * math.sin(ang)
        seg = (f"M{n(x)} {n(y)}Q{n(mx)} {n(my)} {n(ex)} {n(ey)}" if depth >= 3
               else f"M{n0(x)} {n0(y)}Q{n0(mx)} {n0(my)} {n0(ex)} {n0(ey)}")
        if depth >= 3:
            limbs += seg
        else:
            twigs += seg
        if depth <= 2:                                           # leaf and bloom along the outer wood
            for _ in range(3 if depth == 0 else 2):
                f = rnd.uniform(.3, 1)
                px = x + (ex - x) * f + rnd.uniform(-7, 7)
                py = y + (ey - y) * f + rnd.uniform(-6, 4)
                (blooms if rnd.random() < .58 else leaves).append((px, py))
        if depth == 0:
            return
        forks = 3 if depth in (4, 3) and rnd.random() < .4 else 2
        for i in range(forks):
            spread = (i - (forks - 1) / 2) * rnd.uniform(.5, .8)
            out = .12 * (1 if ang >= 0 else -1)                  # keep reaching outward, not up
            nxt = max(-1.35, min(1.35, ang + spread + out))
            grow(ex, ey, nxt, length * rnd.uniform(.7, .82), depth - 1)

    fork_y = base - 58
    for ang in (-1.0, -.42, .18, .78):
        grow(cx + ang * 6, fork_y, ang, 64, 5)
    # a short trunk, drawn as two strokes, splitting low the way palo verdes do
    trunk = (f"M{n(cx - 8)} {n(base)}Q{n(cx - 5)} {n(base - 30)} {n(cx - 7)} {n(fork_y)}"
             f"M{n(cx + 8)} {n(base)}Q{n(cx + 6)} {n(base - 30)} {n(cx + 5)} {n(fork_y)}")
    sym.add(trunk + limbs, "line")
    sym.add(twigs, "line")
    sym.add(dots_d(leaves), "dots")
    sym.add(dots_d(blooms), "blooms")
    ground(sym, cx - 150, cx + 160, base, rnd, tufts=3)
    return sym


# ---------------------------------------------------------------------------
# Sedona buttes


def sedona(sym_id: str, *, width: float, base: float, seed: int = 13) -> Symbol:
    """Cathedral Rock and Bell Rock, roughly: stepped red-rock walls, spires,
    and the horizontal strata that make Sedona look like Sedona; juniper at
    the foot."""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, width, base + 12)
    cathedral = [(40, base), (70, base - 60), (92, base - 70), (104, base - 118), (126, base - 128), (138, base - 176),
                 (150, base - 182), (158, base - 238), (170, base - 244), (182, base - 206), (196, base - 212),
                 (206, base - 262), (218, base - 270), (230, base - 222), (250, base - 216), (262, base - 170),
                 (286, base - 160), (300, base - 110), (330, base - 96), (352, base - 50), (390, base - 30), (420, base)]
    bell = [(430, base), (452, base - 40), (470, base - 74), (486, base - 128), (500, base - 160), (512, base - 166),
            (524, base - 158), (538, base - 124), (552, base - 76), (572, base - 40), (600, base)]
    for rock in (cathedral, bell):
        sym.add(smooth(rock, tension=.55), "outline")
        # strata: for each level, the span inside the rock, inset, gently wavy
        strata = ""
        top_y = min(y for _, y in rock)
        for y in [base - 16 - k * 17 for k in range(20)]:
            if y < top_y + 10:
                break
            xs = []
            for (xa, ya), (xb, yb) in zip(rock, rock[1:]):
                if (ya - y) * (yb - y) < 0:
                    xs.append(xa + (xb - xa) * (y - ya) / (yb - ya))
            xs.sort()
            for xa, xb in zip(xs[0::2], xs[1::2]):
                if xb - xa < 18:
                    continue
                pts = [(xa + 6, y)] + [(xa + (xb - xa) * f, y + rnd.uniform(-1.6, 1.6)) for f in (.25, .5, .75)] + [(xb - 6, y)]
                strata += smooth(pts)
        sym.add(strata, "line")
    # juniper and scrub at the foot
    for x in sorted(rnd.uniform(20, width - 20) for _ in range(10)):
        # a juniper: a lumpy, rounded bush, wider than it is tall
        r = rnd.uniform(6, 12)
        lumps = [(x - r * 1.2, base)]
        for k in range(7):
            a = math.pi * (1 - k / 6)
            rr = r * rnd.uniform(.82, 1.12)
            lumps.append((x + math.cos(a) * rr * 1.2, base - 2 - math.sin(a) * rr * .95))
        lumps.append((x + r * 1.2, base))
        sym.add(smooth(lumps), "outline")
    ground(sym, 0, width, base, rnd, tufts=0)
    return sym


# ---------------------------------------------------------------------------
# Spring wildflowers and a few more plants
#
# Shared idea: stems and leaves are lines (or outlines filled with the
# paper colour), petals are colour. Every helper returns path data; the
# symbol decides which colour class it gets.


def rotate_pts(pts: list[tuple[float, float]], cx: float, cy: float, deg: float) -> list[tuple[float, float]]:
    r = math.radians(deg)
    c, s_ = math.cos(r), math.sin(r)
    return [(cx + (x - cx) * c - (y - cy) * s_, cy + (x - cx) * s_ + (y - cy) * c) for x, y in pts]


def cup_d(x: float, y: float, w: float, h: float, tilt: float, notch: float = .2) -> str:
    """A flower cup seen from the side, opening upward from (x, y), with a
    rim dipping `notch` of the height where the petals overlap."""
    pts = [(x - w / 2, y - h), (x - w * .42, y - h * .35), (x - w * .16, y - h * .04), (x, y),
           (x + w * .16, y - h * .04), (x + w * .42, y - h * .35), (x + w / 2, y - h),
           (x + w * .22, y - h * (1 - notch)), (x, y - h * (1 - notch * .2)), (x - w * .22, y - h * (1 - notch))]
    return smooth(rotate_pts(pts, x, y, tilt), closed=True, tension=.9)


def stem_d(x0: float, y0: float, x1: float, y1: float, bend: float) -> str:
    mx, my = (x0 + x1) / 2 + bend, (y0 + y1) / 2
    return f"M{n(x0)} {n(y0)}Q{n(mx)} {n(my)} {n(x1)} {n(y1)}"


def on_quad(x0: float, y0: float, mx: float, my: float, x1: float, y1: float, t: float) -> tuple[float, float]:
    return ((1 - t) ** 2 * x0 + 2 * (1 - t) * t * mx + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * my + t * t * y1)


def poppies(sym_id: str, *, width: float, base: float, count: int = 6, seed: int = 21) -> Symbol:
    """Mexican gold poppies: silky cups on bare stems over a lace of
    finely cut leaves. Some open, some cupped, one still in bud."""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, width, base + 6)
    leaves, stems, cups, insides, centres = "", "", "", "", []
    for _ in range(5):                                    # basal leaves: feathery fans
        x = rnd.uniform(width * .15, width * .85)
        for k in range(5):
            a = math.radians(-70 + k * 35 + rnd.uniform(-8, 8))
            L = rnd.uniform(9, 15)
            ex, ey = x + math.sin(a) * L, base - math.cos(a) * L * .7
            leaves += f"M{n(x)} {n(base)}L{n(ex)} {n(ey)}"
            for f in (.45, .75):
                px, py = x + (ex - x) * f, base + (ey - base) * f
                leaves += f"M{n(px)} {n(py)}l{n(math.cos(a) * 3)} {n(-2.4)}M{n(px)} {n(py)}l{n(-math.cos(a) * 3)} {n(-2.4)}"
    for i in range(count):
        x0 = width * (.12 + .76 * (i + rnd.uniform(.2, .8)) / count)
        h = rnd.uniform(.5, .92) * (base - 16)
        x1 = x0 + rnd.uniform(-14, 14)
        y1 = base - h
        stems += stem_d(x0, base, x1, y1, rnd.uniform(-8, 8))
        kind = "bud" if i == count // 2 else ("open" if i % 3 == 1 else "cup")
        if kind == "bud":
            cups += ellipse_d(x1, y1 - 5, 3, 6, rnd.uniform(-15, 15))
        elif kind == "cup":                               # a silky bowl, its gold inside catching the light
            w, h, tilt = rnd.uniform(17, 21), rnd.uniform(10, 12), rnd.uniform(-16, 16)
            cups += cup_d(x1, y1 + 1, w, h, tilt, notch=.05)
            ix, iy = rotate_pts([(x1, y1 + 1 - h * .93)], x1, y1 + 1, tilt)[0]
            insides += ellipse_d(ix, iy, w * .44, h * .26, tilt)
        else:
            r = rnd.uniform(6.5, 8)
            for k in range(4):
                a = rnd.uniform(0, 90) + k * 90
                ax, ay = x1 + math.cos(math.radians(a)) * r * .62, y1 - 6 + math.sin(math.radians(a)) * r * .62
                cups += ellipse_d(ax, ay, r * .72, r * .58, a)
            centres.append((x1, y1 - 6))
    sym.add(leaves, "line")
    sym.add(stems, "line")
    sym.add(cups, "poppy")
    sym.add(insides, "flower")
    sym.add(dots_d(centres), "centre")
    return sym


def lupine(sym_id: str, *, width: float, base: float, spikes: int = 3, seed: int = 23) -> Symbol:
    """Desert lupine: spikes of pea flowers in blue-violet, smaller toward the
    tip, over palm-shaped leaves."""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, width, base + 6)
    stalks, leaves, flowers = "", "", ""
    for i in range(spikes):
        x0 = width * (.2 + .6 * (i + .5) / spikes) + rnd.uniform(-6, 6)
        h = rnd.uniform(.62, .95) * (base - 8)
        bend = rnd.uniform(-6, 6)
        x1, y1 = x0 + bend * .8, base - h
        mx, my = x0 + bend, base - h / 2
        stalks += f"M{n(x0)} {n(base)}Q{n(mx)} {n(my)} {n(x1)} {n(y1)}"
        whorls = int(h / 8)
        for k in range(whorls):
            t = .42 + .58 * k / max(1, whorls - 1)
            px, py = on_quad(x0, base, mx, my, x1, y1, t)
            size = 4.6 - 2.6 * (k / whorls)
            for side in (-1, 1):
                flowers += ellipse_d(px + side * size * .9, py + size * .25, size, size * .62, side * 28)
        # palmate leaves near the ground
        for side in (-1, 1):
            lx, ly = x0 + side * rnd.uniform(9, 14), base - rnd.uniform(9, 16)
            leaves += f"M{n(x0)} {n(base - 2)}Q{n((x0 + lx) / 2)} {n(ly + 4)} {n(lx)} {n(ly)}"
            for k in range(7):
                a = math.radians(-100 + k * 33 + side * 10)
                leaves += f"M{n(lx)} {n(ly)}l{n(math.cos(a) * 6.5)} {n(math.sin(a) * 6.5)}"
    sym.add(leaves, "line")
    sym.add(stalks, "line")
    sym.add(flowers, "lupine")
    return sym


def daisy(x: float, y: float, r: float, rays: int = 8) -> str:
    """Ray petals as short strokes out from the disc (style "rays")."""
    return "".join(f"M{n(x + math.cos(a) * r * .45)} {n(y + math.sin(a) * r * .45)}l{n(math.cos(a) * r)} {n(math.sin(a) * r)}"
                   for a in (k / rays * math.tau + .2 for k in range(rays)))


def globemallow(sym_id: str, *, width: float, base: float, wands: int = 4, seed: int = 25) -> Symbol:
    """Desert globemallow: tall wands with small apricot cups along their
    upper reach and little three-lobed leaves below."""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, width, base + 6)
    stems, leaves, petals, hearts = "", "", "", []
    for i in range(wands):
        x0 = width / 2 + (i - (wands - 1) / 2) * rnd.uniform(5, 8)
        ang = math.radians((i - (wands - 1) / 2) * 11 + rnd.uniform(-5, 5))
        h = rnd.uniform(.7, .96) * (base - 10)
        x1, y1 = x0 + math.sin(ang) * h, base - math.cos(ang) * h
        mx, my = (x0 + x1) / 2 + rnd.uniform(-6, 6), (base + y1) / 2
        stems += f"M{n(x0)} {n(base)}Q{n(mx)} {n(my)} {n(x1)} {n(y1)}"
        for k in range(5):
            t = .55 + .45 * k / 4
            px, py = on_quad(x0, base, mx, my, x1, y1, t)
            side = -1 if k % 2 else 1
            fx, fy = px + side * 5, py - 1
            petals += dots_d([(fx + math.cos(math.radians(q * 72 - 90)) * 2.3, fy + math.sin(math.radians(q * 72 - 90)) * 2.3) for q in range(5)])
            hearts.append((fx, fy))
        for t in (.18, .3, .42):
            px, py = on_quad(x0, base, mx, my, x1, y1, t)
            side = 1 if rnd.random() < .5 else -1
            leaves += f"M{n(px)} {n(py)}l{n(side * 6)} {n(-3)}l{n(side * 2)} {n(-3)}M{n(px + side * 6)} {n(py - 3)}l{n(side * 3)} {n(1.5)}"
    sym.add(leaves, "line")
    sym.add(stems, "line")
    sym.add(petals, "mallow-dots")
    sym.add(dots_d(hearts), "centre")
    return sym


def brittlebush(sym_id: str, *, width: float, base: float, seed: int = 27) -> Symbol:
    """Brittlebush in March: a silver-green dome, and yellow daisies held
    well above it on bare stalks."""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, width, base + 6)
    cx, rx, ry = width / 2, width * .36, (base) * .34
    dome = [(cx - rx, base)]
    for k in range(9):
        a = math.pi * (1 - k / 8)
        rr = rnd.uniform(.9, 1.06)
        dome.append((cx + math.cos(a) * rx * rr, base - 1 - math.sin(a) * ry * rr))
    dome.append((cx + rx, base))
    sym.add(smooth(dome), "outline")
    texture = ""
    for _ in range(26):                                  # leaf texture inside the dome
        a = rnd.uniform(.15, math.pi - .15)
        f = rnd.uniform(.25, .82)
        x, y = cx + math.cos(a) * rx * f, base - 2 - math.sin(a) * ry * f
        texture += f"M{n(x)} {n(y)}q{n(2.5)} {n(-2.5)} {n(5)} {n(-.5)}"
    sym.add(texture, "line")
    stalks, rays, disks = "", "", []
    for k in range(9):
        a = math.pi * (.08 + .84 * (k + rnd.uniform(.2, .8)) / 9)
        sx, sy = cx + math.cos(a) * rx * .7, base - math.sin(a) * ry * .7
        tx = sx + math.cos(a) * rnd.uniform(4, 14)
        ty = base - ry - rnd.uniform(12, base - ry - 12)
        stalks += stem_d(sx, sy, tx, ty, rnd.uniform(-4, 4))
        rays += daisy(tx, ty, rnd.uniform(4.2, 5.4))
        disks.append((tx, ty))
    sym.add(stalks, "line")
    sym.add(rays, "rays")
    sym.add(dots_d(disks), "centre")
    return sym


def trumpet_d(x: float, y: float, length: float, mouth: float, angle: float) -> str:
    """A tubular flower leaving a stalk at (x, y): narrow at the base,
    flaring to a two-lobed mouth. `angle` is the direction it points,
    degrees clockwise from straight down."""
    a = math.radians(angle)
    ux, uy = math.sin(a), math.cos(a)              # along the tube
    vx, vy = uy, -ux                               # across it

    def at(t: float, w: float) -> tuple[float, float]:
        return (x + ux * length * t + vx * w, y + uy * length * t + vy * w)
    pts = [at(0, -.5), at(.6, -mouth * .3), at(.98, -mouth * .5), at(.94, 0), at(.98, mouth * .5), at(.6, mouth * .3), at(0, .5)]
    return smooth(pts, closed=True, tension=.8)


def penstemon(sym_id: str, *, width: float, base: float, stalks: int = 3, seed: int = 29, colour: str = "pink") -> Symbol:
    """Parry's penstemon: tall stalks hung with rose-pink trumpets,
    hummingbird food in March. (colour="ember" makes it Eaton's firecracker
    penstemon.)"""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, width, base + 6)
    stems, leaves, tubes = "", "", ""
    for i in range(stalks):
        x0 = width * (.3 + .4 * (i + .5) / stalks) + rnd.uniform(-4, 4)
        h = rnd.uniform(.72, .97) * (base - 6)
        bend = rnd.uniform(-10, 10)
        x1, y1 = x0 + bend * .7, base - h
        mx, my = x0 + bend, base - h / 2
        stems += f"M{n(x0)} {n(base)}Q{n(mx)} {n(my)} {n(x1)} {n(y1)}"
        for k in range(8):
            t = .45 + .55 * k / 7
            px, py = on_quad(x0, base, mx, my, x1, y1, t)
            side = -1 if k % 2 else 1
            tubes += trumpet_d(px, py, 8.5 - 3 * k / 7, 4.2 - 1.2 * k / 7, side * rnd.uniform(58, 78) + 180)
        for side in (-1, 1):                              # lance-shaped basal leaves
            L = rnd.uniform(15, 20)
            a = math.radians(side * rnd.uniform(58, 72))
            tip = (x0 + math.sin(a) * L, base - 1 - math.cos(a) * L)
            mid = (x0 + math.sin(a) * L * .5, base - 1 - math.cos(a) * L * .5)
            nx, ny = math.cos(a) * 3.2, math.sin(a) * 3.2
            leaves += smooth([(x0, base - 1), (mid[0] - nx, mid[1] - ny), tip, (mid[0] + nx, mid[1] + ny), (x0, base - 1)], tension=.8)
    sym.add(leaves, "outline")
    sym.add(stems, "line")
    sym.add(tubes, colour)
    return sym


def hedgehog(sym_id: str, *, width: float, base: float, seed: int = 31, colour: str = "pink",
             stems: list[tuple[float, float, float]] | None = None) -> Symbol:
    """A hedgehog cactus clump in April: stubby ribbed stems and big
    magenta cups sitting right on the spines. (colour="ember" and a different
    clump make it a claret cup.)"""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, width, base + 6)
    stems = stems or [(width * .32, 36, 13), (width * .5, 48, 15), (width * .68, 32, 12), (width * .43, 24, 11)]
    ribs, dots, cups, hearts = "", [], "", []
    for x, h, hw in stems:
        top = base - h
        sym.add(f"M{n(x - hw)} {n(base)}L{n(x - hw)} {n(top + hw)}A{n(hw)} {n(hw)} 0 0 1 {n(x + hw)} {n(top + hw)}L{n(x + hw)} {n(base)}", "outline")
        for k in range(4):
            t = -1 + 2 * (k + .5) / 4
            dx = hw * math.sin(t * math.pi / 2 * .85)
            ribs += f"M{n(x + dx)} {n(base - 1)}L{n(x + dx)} {n(top + hw)}Q{n(x + dx)} {n(top + 3)} {n(x + dx * .3)} {n(top + 2)}"
            yy = top + hw + 2
            while yy < base - 3:
                dots.append((x + dx, yy))
                yy += 6.5
    for x, h, hw in stems[:2]:
        fx, fy = x + rnd.uniform(-3, 3), base - h - 2
        cups += cup_d(fx, fy + 4, hw * 1.7, hw * 1.35, rnd.uniform(-10, 10))
        hearts.append((fx, fy - hw * .5))
    sym.add(ribs, "line")
    sym.add(dots_d(dots), "dots")
    sym.add(cups, colour)
    sym.add(dots_d(hearts), "flower")
    ground(sym, width * .1, width * .9, base, rnd, tufts=1)
    return sym


def agave(sym_id: str, *, width: float, base: float, seed: int = 33) -> Symbol:
    """A century plant in its one bloom: a rosette of armoured leaves and a
    stalk three times its height, branching into gold flower clusters."""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, width, base + 6)
    cx = width / 2
    rosette = []
    for k in range(11):
        t = -1 + 2 * k / 10
        ang = t * 72 + rnd.uniform(-5, 5)
        L = (1 - .38 * abs(t)) * rnd.uniform(62, 74)
        rosette.append((abs(t), ang, L))
    rosette.sort(key=lambda r: -r[0])                    # outer leaves behind, inner in front
    spines = ""
    for _, ang, L in rosette:
        a = math.radians(ang)
        tipx, tipy = cx + math.sin(a) * L, base - 4 - math.cos(a) * L
        w = 12.5                                          # broad at the base, like a real agave
        nx, ny = math.cos(a) * w, math.sin(a) * w
        leaf = [(cx - nx, base - 2 + ny * .2), (cx - nx * .75 + math.sin(a) * L * .55, base - 4 - math.cos(a) * L * .55),
                (tipx, tipy), (cx + nx * .75 + math.sin(a) * L * .55, base - 4 - math.cos(a) * L * .55), (cx + nx, base - 2 - ny * .2)]
        sym.add(smooth(leaf, tension=.7), "outline")
        spines += f"M{n(tipx)} {n(tipy)}l{n(math.sin(a) * 4)} {n(-math.cos(a) * 4)}"
    sym.add(spines, "line")
    # the bloom stalk and its candelabra of branches
    top = 18
    stalk = f"M{n(cx)} {n(base - 30)}Q{n(cx + 4)} {n((base + top) / 2)} {n(cx + 2)} {n(top)}"
    branches, clusters = "", []
    for k in range(7):
        y = top + 12 + k * 13
        span = 16 + k * 3.5
        for side in (-1, 1):
            ex, ey = cx + 2 + side * span, y - 7 - rnd.uniform(0, 4)
            branches += f"M{n(cx + 2 - (y - top) * .02)} {n(y)}Q{n(cx + 2 + side * span * .6)} {n(y + 2)} {n(ex)} {n(ey)}"
            for _ in range(6):
                clusters.append((ex + rnd.uniform(-4.5, 4.5), ey + rnd.uniform(-4.5, 2)))
    sym.add(stalk + branches, "line")
    sym.add(dots_d(clusters), "blooms")
    ground(sym, cx - 80, cx + 80, base, rnd, tufts=2)
    return sym


def grass(sym_id: str, *, width: float, base: float, seed: int = 35) -> Symbol:
    """A tuft of desert grass with seed heads."""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, width, base + 4)
    d, heads = "", []
    for k in range(9):
        a = math.radians(-50 + k * 12.5 + rnd.uniform(-5, 5))
        L = rnd.uniform(.55, 1) * (base - 4)
        x0 = width / 2 + (k - 4) * .8
        ex, ey = x0 + math.sin(a) * L, base - math.cos(a) * L
        d += stem_d(x0, base, ex, ey, math.sin(a) * L * .25)
        if k % 3 == 1:
            heads.append((ex, ey))
    sym.add(d, "line")
    sym.add(dots_d(heads), "dots")
    return sym


# ---------------------------------------------------------------------------
# The second flush of bloom (assets/bloom.svg): more species, and seeded
# variants of the first ones, so no two beds on the page share a drawing.
# scripts/test_draw_desert.py holds the page to that.


def fairy_duster(sym_id: str, *, width: float, base: float, seed: int = 41) -> Symbol:
    """Fairy duster: a low, airy shrub of fine twigs and feathery leaves,
    holding pink powder puffs, each a burst of long stamens."""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, width, base + 6)
    cx = width / 2
    twigs, leaves, puffs, tips = "", "", "", []
    for i in range(8):
        a = math.radians(-66 + i * 19 + rnd.uniform(-6, 6))
        L = rnd.uniform(.5, .88) * (base - 12)
        x0 = cx + rnd.uniform(-4, 4)
        x1, y1 = x0 + math.sin(a) * L * 1.15, base - math.cos(a) * L
        mx, my = x0 + math.sin(a) * L * .45 + rnd.uniform(-4, 4), base - math.cos(a) * L * .62
        twigs += f"M{n(x0)} {n(base)}Q{n(mx)} {n(my)} {n(x1)} {n(y1)}"
        for t in (.3, .46, .62, .78):
            px, py = on_quad(x0, base, mx, my, x1, y1, t)
            for side in (-1, 1):
                leaves += f"M{n(px)} {n(py)}l{n(side * 3.2)} {n(-2.2)}"
        if i % 3 != 1:
            r = rnd.uniform(6.5, 8.5)
            for k in range(15):
                b = math.radians(-205 + k * 16 + rnd.uniform(-5, 5))
                ex, ey = x1 + math.cos(b) * r * rnd.uniform(.7, 1), y1 + math.sin(b) * r * rnd.uniform(.7, 1)
                puffs += f"M{n(x1)} {n(y1)}L{n(ex)} {n(ey)}"
                tips.append((ex, ey))
    sym.add(twigs, "line")
    sym.add(leaves, "line")
    sym.add(puffs, "puff")
    sym.add(dots_d(tips), "pink-dots")
    return sym


def chuparosa(sym_id: str, *, width: float, base: float, seed: int = 43) -> Symbol:
    """Chuparosa: a mound of bare green stems tipped with red tubular
    flowers. The name means hummingbird."""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, width, base + 6)
    cx = width / 2
    stems, tubes = "", ""
    for i in range(10):
        a = math.radians(-72 + i * 16 + rnd.uniform(-5, 5))
        L = rnd.uniform(.62, .95) * (base - 8) * (1 - .2 * abs(math.sin(a)))
        x0 = cx + rnd.uniform(-3, 3)
        x1, y1 = x0 + math.sin(a) * L * 1.2, base - math.cos(a) * L
        mx, my = x0 + math.sin(a) * L * .3, base - math.cos(a) * L * 1.05
        stems += f"M{n(x0)} {n(base)}Q{n(mx)} {n(my)} {n(x1)} {n(y1)}"
        for t in (.58, .78, .97):
            if rnd.random() < .72:
                px, py = on_quad(x0, base, mx, my, x1, y1, t)
                lean = math.degrees(a) * .8 + rnd.uniform(-22, 22)
                tubes += trumpet_d(px, py, rnd.uniform(7.5, 9.5), rnd.uniform(3, 3.8), 180 - lean)
    sym.add(stems, "line")
    sym.add(tubes, "ember")
    return sym


def bluebells(sym_id: str, *, width: float, base: float, seed: int = 45) -> Symbol:
    """Desert bluebells: a low plant of round, scalloped leaves and open
    bells of the deepest blue in the desert."""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, width, base + 6)
    stems, bells, hearts = "", "", []
    for k in range(5):
        x = width * (.18 + .64 * k / 4) + rnd.uniform(-3, 3)
        r = rnd.uniform(5.5, 7.5)
        y = base - r * .75 - rnd.uniform(0, 3)
        pts = [(x + math.cos(t) * r * (1 + .1 * math.cos(7 * t)), y + math.sin(t) * r * .78 * (1 + .1 * math.cos(7 * t)))
               for t in (j / 21 * math.tau for j in range(21))]
        sym.add(smooth(pts, closed=True), "outline")
    for i in range(7):
        x0 = width * (.2 + .6 * (i + rnd.uniform(.2, .8)) / 7)
        h = rnd.uniform(.45, .9) * (base - 12)
        x1, y1 = x0 + rnd.uniform(-9, 9), base - 6 - h
        stems += stem_d(x0, base - 4, x1, y1, rnd.uniform(-5, 5))
        w = rnd.uniform(9, 11)
        tilt = (x1 - x0) * 1.4 + rnd.uniform(-8, 8)
        bells += cup_d(x1, y1 + 1, w, w * .8, tilt, notch=.14)
        hearts.append(rotate_pts([(x1, y1 - w * .45)], x1, y1 + 1, tilt)[0])
    sym.add(stems, "line")
    sym.add(bells, "blue")
    sym.add(dots_d(hearts), "centre")
    return sym


def owls_clover(sym_id: str, *, width: float, base: float, spikes: int = 4, seed: int = 47) -> Symbol:
    """Owl's clover: stout spikes of magenta bracts tipped pale gold; after
    a wet winter they carpet whole slopes."""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, width, base + 6)
    stems, leaves, bracts, tips = "", "", "", []
    for i in range(spikes):
        x0 = width * (.16 + .68 * (i + .5) / spikes) + rnd.uniform(-4, 4)
        h = rnd.uniform(.55, .95) * (base - 6)
        x1, y1 = x0 + rnd.uniform(-5, 5), base - h
        stems += f"M{n(x0)} {n(base)}L{n(x1)} {n(y1)}"
        for side in (-1, 1):
            leaves += f"M{n(x0)} {n(base - 3)}q{n(side * 4)} {n(-6)} {n(side * 7.5)} {n(-11)}"
        rows = max(4, int(h * .5 / 3.6))
        for k in range(rows):
            t = .5 + .5 * k / (rows - 1)
            px, py = x0 + (x1 - x0) * t, base - h * t
            w = 5.4 - 2.6 * k / rows
            for side in (-1, 1):
                bracts += ellipse_d(px + side * w * .42, py, w * .62, w * .42, -side * 28)
            if k >= rows - 3:
                tips.append((px + rnd.uniform(-1.4, 1.4), py - 1.6))
    sym.add(leaves, "line")
    sym.add(stems, "line")
    sym.add(bracts, "pink")
    sym.add(dots_d(tips), "blooms")
    return sym


def sand_verbena(sym_id: str, *, width: float, base: float, seed: int = 49) -> Symbol:
    """Sand verbena: stems trailing over the sand, oval leaves, and round
    heads of little violet trumpets held up on short stalks."""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, width, base + 6)
    stems, heads = "", []
    for _ in range(3):
        xa, xb = width * rnd.uniform(.04, .3), width * rnd.uniform(.7, .96)
        stems += f"M{n(xa)} {n(base)}Q{n((xa + xb) / 2)} {n(base - rnd.uniform(8, 13))} {n(xb)} {n(base - rnd.uniform(1, 4))}"
    for k in range(7):
        x = width * (.1 + .8 * k / 6) + rnd.uniform(-4, 4)
        sym.add(ellipse_d(x, base - rnd.uniform(4, 8), rnd.uniform(4, 5.4), rnd.uniform(2.3, 3.1), rnd.uniform(-35, 35)), "outline")
    for k in range(5):
        x0 = width * (.14 + .72 * k / 4) + rnd.uniform(-5, 5)
        y0 = base - rnd.uniform(6, 9)
        x1, top = x0 + rnd.uniform(-4, 4), y0 - rnd.uniform(12, base * .55)
        stems += stem_d(x0, y0, x1, top + 4, rnd.uniform(-3, 3))
        r = rnd.uniform(5.6, 7)
        # a ball of florets: a ring, an inner ring, a heart
        for ring, count, off in ((1, 11, 0), (.52, 6, .3), (0, 1, 0)):
            for j in range(count):
                b = (j + off) / count * math.tau + rnd.uniform(-.12, .12)
                heads.append((x1 + math.cos(b) * r * ring, top + math.sin(b) * r * ring * .92))
    sym.add(stems, "line")
    sym.add(dots_d(heads), "violet-dots")
    return sym


def pincushion(sym_id: str, *, width: float, base: float, seed: int = 51) -> Symbol:
    """Pincushion cactus: little globes set with spiralled spines, each
    wearing a ring of pink flowers like a crown."""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, width, base + 6)
    spines, flowers = [], ""
    for x, r in ((width * .4, base * .36), (width * .66, base * .27), (width * .24, base * .2)):
        top = base - r * 1.85
        sym.add(f"M{n(x - r)} {n(base)}C{n(x - r * 1.12)} {n(base - r * 1.2)} {n(x - r * .8)} {n(top)} {n(x)} {n(top)}"
                f"C{n(x + r * .8)} {n(top)} {n(x + r * 1.12)} {n(base - r * 1.2)} {n(x + r)} {n(base)}", "outline")
        for i in range(int(r * 2.6)):
            a = i * 2.39996
            f = math.sqrt((i + .5) / (r * 2.6))
            spines.append((x + math.cos(a) * r * .82 * f, base - r * .95 - math.sin(a) * r * .8 * f))
        for k in range(7):
            t = math.pi * (k / 6)
            fx, fy = x + math.cos(t) * r * .62, top + 2.5 - math.sin(t) * r * .12
            flowers += ellipse_d(fx, fy - 1.6, 1.9, 2.7, math.degrees(math.cos(t)) * .5 * 57 / 57)
    sym.add(dots_d(spines), "dots")
    sym.add(flowers, "pink")
    return sym


def marigold(sym_id: str, *, width: float, base: float, seed: int = 53) -> Symbol:
    """Desert marigold: a woolly grey mound of lobed leaves, and big layered
    yellow daisies on long bare stems."""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, width, base + 6)
    cx, rx, ry = width / 2, width * .3, base * .15
    mound = [(cx - rx, base)]
    for k in range(9):
        a = math.pi * (1 - k / 8)
        mound.append((cx + math.cos(a) * rx * rnd.uniform(.9, 1.08), base - 1 - math.sin(a) * ry * rnd.uniform(.8, 1.2)))
    mound.append((cx + rx, base))
    sym.add(smooth(mound), "outline")
    wool = ""
    for _ in range(12):
        a, f = rnd.uniform(.2, math.pi - .2), rnd.uniform(.3, .8)
        x, y = cx + math.cos(a) * rx * f, base - 2 - math.sin(a) * ry * f
        wool += f"M{n(x)} {n(y)}q{n(1.5)} {n(-2)} {n(3)} 0"
    sym.add(wool, "line")
    stems, rays, disks = "", "", []
    for k in range(6):
        sx = cx + rx * (-.7 + 1.4 * (k + rnd.uniform(.2, .8)) / 6)
        tx = sx + rnd.uniform(-12, 12)
        ty = base - ry - rnd.uniform(base * .3, base - ry - 14)
        stems += stem_d(sx, base - ry * .6, tx, ty, rnd.uniform(-6, 6))
        r = rnd.uniform(5.6, 7)
        rays += daisy(tx, ty, r, rays=12) + daisy(tx, ty, r * .72, rays=9)
        disks.append((tx, ty))
    sym.add(stems, "line")
    sym.add(rays, "rays")
    sym.add(dots_d(disks), "gold-dots")
    return sym


def datura(sym_id: str, *, width: float, base: float, seed: int = 55) -> Symbol:
    """Sacred datura: a mound of broad leaves, great white trumpets that open
    at dusk into five-pointed stars, a furled bud and a spiny seed pod."""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, width, base + 6)
    cx = width / 2
    ribs = ""
    for k in range(7):
        a = math.radians(-84 + k * 28 + rnd.uniform(-5, 5))
        L = rnd.uniform(24, 31)
        x0, y0 = cx + math.sin(a) * 4, base - 1
        tip = (x0 + math.sin(a) * L, y0 - math.cos(a) * L * .78)
        mid = (x0 + math.sin(a) * L * .5, y0 - math.cos(a) * L * .4)
        nx, ny = math.cos(a) * 8.5, math.sin(a) * 6
        sym.add(smooth([(x0, y0), (mid[0] - nx, mid[1] - ny), tip, (mid[0] + nx, mid[1] + ny), (x0, y0)], tension=.85), "outline")
        ribs += f"M{n(x0)} {n(y0)}L{n(tip[0] * .88 + x0 * .12)} {n(tip[1] * .88 + y0 * .12)}"
    sym.add(ribs, "line")
    # the pod, low in the leaves
    px, py, pr = cx + 24, base - 9, 5
    sym.add(ellipse_d(px, py, pr, pr, 0), "outline")
    sym.add("".join(f"M{n(px + math.cos(t) * pr)} {n(py + math.sin(t) * pr)}l{n(math.cos(t) * 2.4)} {n(math.sin(t) * 2.4)}"
                    for t in (j / 11 * math.tau for j in range(11))), "line")
    # a trumpet from the side, and a furled bud
    sym.add(trumpet_d(cx + 20, base - 24, 21, 13, 128) + trumpet_d(cx - 30, base - 16, 17, 4.5, 232), "cream")
    # two flowers facing you: five points, the pleats drawn in, a pale throat
    star, pleats, throats = "", "", []
    for fx, fy, r, tilt in ((cx - 12, base - 30, 12.5, -8), (cx + 4, base - 17, 10, 14)):
        pts = []
        for k in range(5):
            a = math.radians(-90 + tilt + k * 72)
            pts.append((fx + math.cos(a) * r, fy + math.sin(a) * r * .84))
            b = a + math.radians(36)
            pts.append((fx + math.cos(b) * r * .8, fy + math.sin(b) * r * .8 * .84))
            pleats += f"M{n(fx + math.cos(a) * r * .22)} {n(fy + math.sin(a) * r * .2)}L{n(fx + math.cos(a) * r * .86)} {n(fy + math.sin(a) * r * .72)}"
        star += smooth(pts, closed=True, tension=.75)
        throats.append((fx, fy))
    sym.add(star, "cream")
    sym.add(pleats, "line")
    sym.add(dots_d(throats), "centre")
    return sym


def cholla(sym_id: str, *, width: float, base: float, seed: int = 57) -> Symbol:
    """Teddy bear cholla: a short dark trunk with stubby arms, crowded at the
    top with fat joints so thick with pale spines they glow in low sun."""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, width, base + 6)
    cx = width / 2
    crown = (cx + 1, base * .4)
    sym.add(f"M{n(cx - 6)} {n(base)}C{n(cx - 5)} {n(base - 34)} {n(cx - 4)} {n(crown[1] + 16)} {n(cx - 2)} {n(crown[1] + 4)}"
            f"L{n(cx + 4)} {n(crown[1] + 4)}C{n(cx + 5)} {n(crown[1] + 18)} {n(cx + 6)} {n(base - 34)} {n(cx + 7)} {n(base)}", "outline")
    # old joints fall and leave the lower trunk dark and knobbed
    knobs = "".join(f"M{n(cx - 4 + rnd.uniform(0, 8))} {n(y)}l{n(rnd.uniform(-2, 2))} {n(3)}" for y in range(int(base - 8), int(crown[1] + 20), -9))
    sym.add(knobs, "line")
    spines = []
    # (angle from straight up, distance from the crown, length, half-width); two
    # arms part-way down the trunk carry joints of their own
    joints = [(-62, 11, 19, 6.2), (-28, 13, 21, 6.6), (4, 14, 22, 6.8), (34, 12, 20, 6.4), (66, 10, 18, 6),
              (-90, 8, 16, 5.6), (92, 8, 15, 5.4), (-12, 26, 16, 5.8), (22, 25, 15, 5.6)]
    arms = [((cx - 3, crown[1] + 30), -58, 12, 16, 5.8), ((cx + 5, crown[1] + 24), 52, 11, 15, 5.6)]
    placed = [(crown, a, d, L, w) for a, d, L, w in joints] + arms
    for (ox, oy), a, d, L, w in placed:
        t = math.radians(a)
        jx, jy = ox + math.sin(t) * (d + L * .45), oy - math.cos(t) * (d + L * .45)
        sym.add(ellipse_d(jx, jy, L / 2, w, a - 90), "outline")
        for i in range(18):
            ang, f = i * 2.39996, math.sqrt((i + .5) / 18) * .86
            u, v = math.cos(ang) * L / 2 * f, math.sin(ang) * w * f
            r = math.radians(a - 90)
            spines.append((jx + u * math.cos(r) - v * math.sin(r), jy + u * math.sin(r) + v * math.cos(r)))
    sym.add(dots_d(spines), "dots")
    return sym


def threeawn(sym_id: str, *, width: float, base: float, seed: int = 59) -> Symbol:
    """Purple three-awn: a fine tuft whose seed heads, each with three long
    bristles, turn spring slopes purple."""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, width, base + 4)
    blades, awns = "", ""
    for k in range(11):
        a = math.radians(-48 + k * 9.6 + rnd.uniform(-4, 4))
        L = rnd.uniform(.55, 1) * (base - 8)
        x0 = width / 2 + (k - 5) * .7
        ex, ey = x0 + math.sin(a) * L, base - math.cos(a) * L
        blades += stem_d(x0, base, ex, ey, math.sin(a) * L * .3)
        if k % 2 == 0:
            for spread in (-24, 0, 24):
                b = a + math.radians(spread) + math.radians(rnd.uniform(-6, 6))
                awns += f"M{n(ex)} {n(ey)}l{n(math.sin(b) * 7)} {n(-math.cos(b) * 7)}"
    sym.add(blades, "line")
    sym.add(awns, "awns")
    return sym


def creosote(sym_id: str, *, width: float, base: float, seed: int = 61) -> Symbol:
    """Creosote bush, the smell of desert rain: slender stems fanning up
    from the base, tiny leaves, small yellow flowers and white fuzzy fruit."""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, width, base + 6)
    cx = width / 2
    stems, leaves, flowers, fruit = "", [], [], ""
    for i in range(11):
        a = math.radians(-44 + i * 8.8 + rnd.uniform(-3, 3))
        L = rnd.uniform(.7, .98) * (base - 6)
        x0 = cx + rnd.uniform(-3, 3)
        x1, y1 = x0 + math.sin(a) * L, base - math.cos(a) * L
        stems += stem_d(x0, base, x1, y1, rnd.uniform(-5, 5))
        fx, fy = x0 + (x1 - x0) * .62, base + (y1 - base) * .62          # a fork
        side = 1 if a > 0 else -1
        bx, by = fx + side * rnd.uniform(8, 14), fy - rnd.uniform(10, 18)
        stems += f"M{n(fx)} {n(fy)}L{n(bx)} {n(by)}"
        for t in (.45, .6, .75, .9):
            leaves.append((x0 + (x1 - x0) * t + rnd.uniform(-2.2, 2.2), base + (y1 - base) * t))
        flowers += [(x1, y1 - 1.5), (bx, by - 1.5)] if i % 2 else [(x1, y1 - 1.5)]
        if i % 3 == 1:
            fruit += ellipse_d(bx + side * 2, by + 5, 2.4, 2.4, 0)
    sym.add(stems, "line")
    sym.add(dots_d(leaves), "dots")
    sym.add(dots_d(flowers), "blooms")
    sym.add(fruit, "cream")
    return sym


def yucca(sym_id: str, *, width: float, base: float, seed: int = 63) -> Symbol:
    """Soaptree yucca: a shaggy trunk under a round head of needle leaves,
    and a tall stalk hung thick with cream bells."""
    rnd = random.Random(seed)
    sym = Symbol(sym_id, width, base + 6)
    cx = width / 2
    head_y = base * .56
    sym.add(f"M{n(cx - 6)} {n(base)}C{n(cx - 5)} {n(base - 40)} {n(cx - 7)} {n(head_y + 30)} {n(cx - 5)} {n(head_y + 8)}"
            f"L{n(cx + 5)} {n(head_y + 8)}C{n(cx + 6)} {n(head_y + 30)} {n(cx + 5)} {n(base - 40)} {n(cx + 7)} {n(base)}", "outline")
    skirt = "".join(f"M{n(cx + rnd.uniform(-6, 6))} {n(y)}l{n(rnd.uniform(-5, 5))} {n(rnd.uniform(9, 14))}"
                    for y in (head_y + 10 + k * 5.5 for k in range(9)))
    leaves = ""
    for k in range(34):
        a = math.radians(-180 + k * (360 / 34) + rnd.uniform(-4, 4))
        L = rnd.uniform(18, 27) * (1 if math.sin(a) < .3 else .75)
        leaves += f"M{n(cx)} {n(head_y)}l{n(math.cos(a) * L)} {n(math.sin(a) * L * .9)}"
    top = 12.0
    low = head_y - 26
    stalk = f"M{n(cx)} {n(head_y - 4)}Q{n(cx + 3)} {n((head_y + top) / 2)} {n(cx + 1)} {n(top)}"
    bells = ""
    count = 22
    for k in range(count):
        t = k / (count - 1)
        y = top + 4 + t * (low - top - 4)
        reach = 3 + 9 * math.sin(math.pi * min(1, t * 1.25))     # a spindle: full in the middle
        side = -1 if k % 2 else 1
        ex, ey = cx + 1 + side * reach * rnd.uniform(.7, 1), y + rnd.uniform(1, 3)
        stalk += f"M{n(cx + 1)} {n(y)}L{n(ex)} {n(ey - 1)}"
        bells += cup_d(ex, ey + 3.4, 5.6, 5, 180 + side * rnd.uniform(4, 16), notch=.1)
    sym.add(skirt + leaves + stalk, "line")
    sym.add(bells, "cream")
    return sym


def build_bloom() -> str:
    """assets/bloom.svg: the second flush, and seeded variants of the first."""
    symbols = [
        # variants of the first flush: same plants, different individuals
        poppies("poppies-b", width=92, base=62, count=4, seed=77),
        poppies("poppies-c", width=132, base=56, count=8, seed=5),
        lupine("lupine-b", width=70, base=124, spikes=2, seed=41),
        globemallow("globemallow-b", width=84, base=108, wands=3, seed=19),
        brittlebush("brittlebush-b", width=100, base=76, seed=53),
        grass("grass-b", width=50, base=36, seed=12),
        penstemon("firecracker", width=70, base=118, stalks=2, seed=67, colour="ember"),
        hedgehog("claret-cup", width=100, base=70, seed=71, colour="ember",
                 stems=[(36, 30, 11), (52, 40, 13), (68, 27, 10.5), (46, 20, 10), (60, 18, 9)]),
        # new species
        fairy_duster("fairy-duster", width=100, base=70),
        chuparosa("chuparosa", width=112, base=80),
        bluebells("bluebells", width=80, base=56),
        owls_clover("owls-clover", width=76, base=72),
        sand_verbena("sand-verbena", width=110, base=56),
        pincushion("pincushion", width=72, base=46),
        marigold("marigold", width=100, base=98),
        datura("datura", width=120, base=66),
        cholla("cholla", width=92, base=118),
        threeawn("threeawn", width=64, base=58),
        creosote("creosote", width=110, base=122),
        yucca("yucca", width=112, base=262),
    ]
    return '<svg xmlns="http://www.w3.org/2000/svg">' + "".join(s.svg() for s in symbols) + "</svg>\n"


def build() -> str:
    symbols = [
        saguaro("saguaro", cx=120, base=520, top=40, half=26, seed=4, blossoms=5, fruit=2, arms=(
            Arm(side=-1, join=318, thick=32, reach=42, top=176, half=17),
            Arm(side=+1, join=262, thick=30, reach=40, top=126, half=16),
        )),
        saguaro("saguaro-young", cx=70, base=330, top=40, half=20, seed=9, blossoms=3, ribs=5, arms=(
            Arm(side=+1, join=210, thick=22, reach=28, top=120, half=12),
        )),
        prickly_pear("prickly-pear", width=360, height=300, base=292, pads=(
            Pad(98, 214, 42, 56, -34, fruit=(-20,)),
            Pad(262, 210, 40, 54, 30, fruit=(8, 32), flowers=(-24,)),
            Pad(178, 230, 50, 64, -4),
            Pad(126, 132, 38, 52, -22, fruit=(-10, 18), flowers=(40,)),
            Pad(222, 128, 40, 54, 16, fruit=(-28, 4, 30)),
        )),
        barrel("barrel", cx=70, base=150, rx=46, height=92),
        ocotillo("ocotillo", cx=150, base=330),
        palo_verde("palo-verde", cx=200, base=330),
        sedona("sedona", width=620, base=290),
        agave("agave", width=200, base=300),
        poppies("poppies", width=110, base=70),
        lupine("lupine", width=80, base=110),
        globemallow("globemallow", width=90, base=120),
        brittlebush("brittlebush", width=130, base=90),
        penstemon("penstemon", width=70, base=130),
        hedgehog("hedgehog", width=110, base=80),
        grass("grass", width=60, base=44),
    ]
    return '<svg xmlns="http://www.w3.org/2000/svg">' + "".join(s.svg() for s in symbols) + "</svg>\n"


if __name__ == "__main__":
    OUT.write_text(build(), encoding="utf-8")
    BLOOM_OUT.write_text(build_bloom(), encoding="utf-8")
    for out in (OUT, BLOOM_OUT):
        print(f"wrote {out} ({out.stat().st_size / 1024:.1f} KB)")

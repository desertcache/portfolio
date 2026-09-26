"""Draw the site's desert illustrations into assets/desert.svg.

The homepage's sections carry line drawings of the Sonoran desert: saguaros,
prickly pear in fruit and flower, a palo verde in bloom, a barrel cactus, an
ocotillo, and the red rocks of Sedona. They are generated rather than
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
    "blooms": "fill:none;stroke:var(--illo-flower,#e9b21a);stroke-width:calc(var(--illo-w,1.6) * 2.6);stroke-linecap:round;" + _BLOOM,
}
STROKED = {"outline", "line"}


def n(v: float) -> str:
    """Compact number: one decimal, no trailing zeros."""
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


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
        seg = f"M{n(x)} {n(y)}Q{n(mx)} {n(my)} {n(ex)} {n(ey)}"
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
    ]
    return '<svg xmlns="http://www.w3.org/2000/svg">' + "".join(s.svg() for s in symbols) + "</svg>\n"


if __name__ == "__main__":
    OUT.write_text(build(), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KB)")

"""Draw the site's desert animals into assets/fauna.svg and js/fauna-data.js.

The desert drawings (scripts/draw_desert.py) hold still or sway; these move.
A greater roadrunner runs along the hero's flower bed and across the Lab's
sunset as you scroll, and birds cross the sunset sky. They are drawn in the
same hand as the plants (the same line, paper fill and colour properties),
so a roadrunner among the poppies looks like it belongs there.

Output: one SVG sprite, used on the page as
    <svg class="runner" viewBox="..."><use href="assets/fauna.svg#roadrunner"/></svg>
and js/fauna-data.js, the numbers the page needs to animate it (which frame
is which pose, how far one stride carries the bird). Both are generated from
this file so they cannot drift apart; the output is committed and the site
never runs this.

The roadrunner is a flip-book. Its symbol holds every pose, and one inherited
custom property picks which is showing:
    --frame   0..5   the run cycle, one stride in six poses
              6, 7   standing, and standing with the tail flicked up
Each pose's opacity is 1 - |--frame - k|, so exactly one is visible. The page
steps --frame by how far the bird has run (js/wildlife.js), which keeps its
feet planted on the ground instead of skating.

The legs are solved, not drawn: each foot follows a stride loop (planted and
sweeping back, then lifted and swung forward) and the heel is placed by
two-bone inverse kinematics, bending backward the way a bird's does.

Colours come from the same properties as the plants, so the Lab's silhouette
rule works on the animals too:
    --illo-line, --illo-paper, --illo-w   as for the plants
    --illo-eye      the eye, the one solid mark (defaults to the line)
    --illo-lupine   the bare blue skin behind the roadrunner's eye
    --illo-ember    ...and the red-orange behind that
    --illo-fruit    the red-tailed hawk's tail
    --illo-far      opacity of the far leg (depth; 1 in silhouette)

Usage: python3 scripts/draw_fauna.py
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path

from draw_desert import STYLE as PLANT_STYLE, dots_d, ellipse_d, n, smooth

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "fauna.svg"
DATA_OUT = ROOT / "js" / "fauna-data.js"

STYLE = {
    **PLANT_STYLE,
    # plumage streaks: a touch heavier than the outline so they survive at 50 px
    "streak": "fill:none;stroke:var(--illo-line,currentColor);stroke-width:calc(var(--illo-w,1.6) * 1.15);stroke-linecap:round",
    # the eye is the one solid dark mark, so the bird has a face at any size
    "eye": "fill:var(--illo-eye,var(--illo-line,currentColor));stroke:none",
    # the far leg sits a step back in depth
    "far": "fill:none;stroke:var(--illo-line,currentColor);stroke-width:var(--illo-w,1.6);stroke-linecap:round;stroke-linejoin:round;opacity:var(--illo-far,.5)",
    # a solid shape: the distant birds against the sunset
    "solid": "fill:var(--illo-line,currentColor);stroke:none",
}
STROKED = {"outline", "line"}

Pt = tuple[float, float]

# The roadrunner stands on this line, in the symbol's own units.
GROUND = 100.0
RUN_FRAMES = 6
STAND, FLICK = 6, 7

# Legs: the knee sits just inside the belly; the visible leg is the
# tibiotarsus (drumstick) down to the heel, then the long bare tarsus.
HIP: Pt = (94.0, 56.0)
THIGH, SHIN = 21.0, 29.0   # long enough to reach both ends of the stride
STRIDE = 34.0          # how far a planted foot sweeps back, in units
LIFT = 13.0            # how high a swinging foot rises
STANCE = 0.46          # share of the cycle a foot is on the ground
# A planted foot is still relative to the ground, so while it sweeps back by
# STRIDE the bird moves forward by the same amount; a whole cycle (stance
# and swing) therefore carries the bird STRIDE / STANCE units.
CYCLE = STRIDE / STANCE


def rot(p: Pt, c: Pt, deg: float) -> Pt:
    """Rotate p about c; positive is clockwise on screen (y points down)."""
    a = math.radians(deg)
    dx, dy = p[0] - c[0], p[1] - c[1]
    return (c[0] + dx * math.cos(a) - dy * math.sin(a), c[1] + dx * math.sin(a) + dy * math.cos(a))


def lerp(a: Pt, b: Pt, t: float) -> Pt:
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def bend(pts: list[Pt], c: Pt, deg: float, x0: float, x1: float) -> list[Pt]:
    """Rotate points about c by an angle that ramps from 0 at x0 to deg at x1,
    so a neck can lift without a kink where it meets the body."""
    out = []
    for p in pts:
        t = min(1.0, max(0.0, (p[0] - x0) / (x1 - x0)))
        out.append(rot(p, c, deg * t * t * (3 - 2 * t)))
    return out


def solve_leg(hip: Pt, foot: Pt, thigh: float = THIGH, shin: float = SHIN) -> Pt:
    """Where the heel goes: the two-bone IK solution that bends backward
    (behind the hip-to-foot line), clamped when the foot is out of reach."""
    dx, dy = foot[0] - hip[0], foot[1] - hip[1]
    dist = math.hypot(dx, dy)
    d = min(max(dist, abs(thigh - shin) + 1e-6), thigh + shin - 1e-6)
    a = (thigh * thigh - shin * shin + d * d) / (2 * d)
    h = math.sqrt(max(thigh * thigh - a * a, 0.0))
    ux, uy = dx / dist, dy / dist
    mx, my = hip[0] + ux * a, hip[1] + uy * a
    # of the two perpendiculars, take the one that points backward (-x)
    px, py = -uy, ux
    if px > 0:
        px, py = -px, -py
    return (mx + px * h, my + py * h)


def foot_at(u: float) -> tuple[Pt, bool]:
    """Where a foot is at phase u (0..1) of the stride, and whether it is
    planted. Planted, it sweeps from front to back along the ground at an even
    pace; lifted, it swings forward on an arc that rises quickly and lands."""
    u %= 1.0
    front, back = HIP[0] + STRIDE * 0.5, HIP[0] - STRIDE * 0.5
    if u < STANCE:
        t = u / STANCE
        return (front + (back - front) * t, GROUND), True
    t = (u - STANCE) / (1 - STANCE)
    e = t * t * (3 - 2 * t)
    return (back + (front - back) * e, GROUND - LIFT * math.sin(math.pi * t) ** 0.6), False


def leg_d(u: float) -> str:
    """One leg at phase u: drumstick, tarsus and toes as a single path."""
    foot, planted = foot_at(u)
    heel = solve_leg(HIP, foot)
    fx, fy = foot
    d = f"M{n(HIP[0])} {n(HIP[1])}L{n(heel[0])} {n(heel[1])}L{n(fx)} {n(fy)}"
    if planted:
        # zygodactyl: two toes forward and two back; from the side, the
        # forward pair and one back toe
        d += f"M{n(fx)} {n(fy)}l9 0M{n(fx)} {n(fy)}l7.5 -1.6M{n(fx)} {n(fy)}l-6 .3"
    else:
        # lifted, the toes fold and trail
        d += f"M{n(fx)} {n(fy)}l-5.5 2.2M{n(fx)} {n(fy)}l-3 4M{n(fx)} {n(fy)}l1.5 4.5"
    return d


# ---------------------------------------------------------------------------
# The roadrunner, facing right. Body, neck and head are one outline so the
# paper fill has no seams; the tail, crest and bill are separate shapes.

BODY: list[Pt] = [
    (60, 44), (78, 37.5), (98, 34), (114, 31.5), (126, 28), (135, 23), (143, 19.5),
    (150.5, 19.5), (156, 23), (157.5, 28.5), (153.5, 33.5), (145, 37), (135, 40.5),
    (124, 45.5), (110, 52.5), (96, 57), (82, 57.5), (70, 54.5), (61, 49),
]
TAIL: list[Pt] = [
    (68, 41), (44, 37), (20, 33), (9, 31.5), (4.5, 35), (7.5, 40), (20, 42.5),
    (44, 46.5), (68, 51),
]
# A shaggy crest, laid back along the crown and nape; its underside is
# hidden by the head, which is drawn over it.
CREST: list[Pt] = [
    (151.5, 21.5), (149, 15.5), (143.5, 13), (141, 15.8), (135, 10.5), (133.5, 15.2),
    (126, 11.8), (127.2, 16.8), (118.5, 17.5), (124, 23.5), (140, 24),
]
BILL: list[Pt] = [(155.5, 23.3), (163, 24.8), (170, 27.2), (174.5, 30.4), (171.2, 30.8), (163, 30.9), (156.5, 32)]
WING: list[Pt] = [(118, 38.5), (104, 36.5), (88, 38.5), (72, 42.5), (60, 47), (74, 48.5), (92, 49), (108, 46.5)]
EYE: Pt = (149.8, 25.6)
RUN_TILT = -4.0         # a runner leans its body a little nose-up

# streaks as (x, y, angle); spots on the throat and breast
STREAKS = [(90, 40.5, 10), (103, 39, 6), (80, 43.5, 14), (115, 35.5, 0), (125, 32, -16), (133.5, 28, -28), (97, 45, 8), (86, 47.5, 10)]
SPOTS = [(138, 34.5), (130.5, 38.5), (123, 42.5), (132.5, 33.5), (117, 47)]


def tail_lines(tail: list[Pt]) -> str:
    """The shaft down the middle of the tail, and the pale tips across its
    end (a roadrunner's outer tail feathers are tipped white)."""
    root = lerp(tail[0], tail[-1], 0.5)
    tip = lerp(tail[3], tail[5], 0.5)
    a, b = lerp(root, tip, 0.1), lerp(root, tip, 0.8)
    m1, m2 = lerp(tail[2], tail[3], 0.4), lerp(tail[6], tail[5], 0.4)
    return f"M{n(a[0])} {n(a[1])}L{n(b[0])} {n(b[1])}M{n(m1[0])} {n(m1[1])}L{n(m2[0])} {n(m2[1])}"


def streaks_d(pts: list[tuple[float, float, float]]) -> str:
    """Short dashes for the streaked back and neck."""
    d = ""
    for x, y, a in pts:
        dx, dy = 3.2 * math.cos(math.radians(a)), 3.2 * math.sin(math.radians(a))
        d += f"M{n(x - dx)} {n(y - dy)}L{n(x + dx)} {n(y + dy)}"
    return d


@dataclass(frozen=True)
class Pose:
    body: list[Pt]
    tail: list[Pt]
    crest: list[Pt]
    bill: list[Pt]
    wing: list[Pt]
    eye: Pt
    streaks: list[tuple[float, float, float]]
    spots: list[Pt]

    def points(self) -> list[Pt]:
        return self.body + self.tail + self.crest + self.bill + self.wing


def turn(pose: Pose, c: Pt, deg: float) -> Pose:
    """The whole bird rotated about c."""
    def r(pts: list[Pt]) -> list[Pt]:
        return [rot(p, c, deg) for p in pts]
    return Pose(r(pose.body), r(pose.tail), r(pose.crest), r(pose.bill), r(pose.wing), rot(pose.eye, c, deg),
                [(*rot((x, y), c, deg), a + deg) for x, y, a in pose.streaks], r(pose.spots))


def run_pose() -> Pose:
    return turn(Pose(BODY, TAIL, CREST, BILL, WING, EYE, STREAKS, SPOTS), HIP, RUN_TILT)


def stand_pose(flick: bool) -> Pose:
    """Standing: body tipped up, neck raised, bill level, crest up, tail
    cocked. The tail flick is the same stance with the tail thrown higher."""
    tilt, lift = -17.0, -20.0
    neck = (118.0, 36.0)
    head = (148.0, 27.0)

    def carry(pts: list[Pt]) -> list[Pt]:
        # the neck lifts (ramping in along it), then the head turns back down
        # so the bill stays level: tilt + lift + level = 0
        pts = bend(pts, neck, lift, 108, 140)
        pts = bend(pts, rot(head, neck, lift), -(tilt + lift), 134, 146)
        return [rot(p, HIP, tilt) for p in pts]

    tail_root = (66.0, 46.0)
    tail = [rot(rot(p, tail_root, 62.0 if flick else 40.0), HIP, tilt) for p in TAIL]
    crest = [rot(p, (151.5, 21.5), 24.0) for p in CREST]  # raised when alert
    return Pose(
        body=carry(BODY),
        tail=tail,
        crest=carry(crest),
        bill=carry(BILL),
        wing=[rot(p, HIP, tilt) for p in WING],
        eye=carry([EYE])[0],
        streaks=[(*carry([(x, y)])[0], a + tilt) for x, y, a in STREAKS],
        spots=carry(SPOTS),
    )


# Standing, the feet are planted a little apart under the body.
STAND_FEET: tuple[Pt, Pt] = ((89.0, GROUND), (99.0, GROUND))  # far, near


def stand_leg_d(foot: Pt) -> str:
    heel = solve_leg(HIP, foot)
    fx, fy = foot
    return (f"M{n(HIP[0])} {n(HIP[1])}L{n(heel[0])} {n(heel[1])}L{n(fx)} {n(fy)}"
            f"M{n(fx)} {n(fy)}l9 0M{n(fx)} {n(fy)}l7.5 -1.6M{n(fx)} {n(fy)}l-6 .3")


def eye_patch(eye: Pt, lean: float) -> tuple[str, str]:
    """The bare skin behind the eye: blue next to it, red-orange behind."""
    ex, ey = eye
    back = (math.cos(math.radians(lean)), math.sin(math.radians(lean)))
    b = (ex - back[0] * 3.4, ey - back[1] * 3.4 + 0.3)
    r = (ex - back[0] * 7.4, ey - back[1] * 7.4 + 0.6)
    return ellipse_d(*b, 2.2, 1.25, lean), ellipse_d(*r, 2.6, 1.2, lean)


class Sprite:
    """A minimal SVG builder: styled paths, grouped by pose."""

    def __init__(self) -> None:
        self.parts: list[str] = []

    def path(self, d: str, kind: str) -> None:
        if d:
            extra = ' pathLength="1"' if kind in STROKED else ""
            self.parts.append(f'<path d="{d}"{extra} style="{STYLE[kind]}"/>')

    def open(self, style: str) -> None:
        self.parts.append(f'<g style="{style}">')

    def close(self) -> None:
        self.parts.append("</g>")

    def svg(self) -> str:
        return "".join(self.parts)


def shown_when(k: int) -> str:
    """Opacity 1 when --frame is k and 0 otherwise: 1 - |frame - k|."""
    return f"opacity:calc(1 - max(var(--frame,{STAND}) - {k},{k} - var(--frame,{STAND})))"


def draw_roadrunner(s: Sprite, pose: Pose) -> None:
    s.path(smooth(pose.tail, closed=True), "outline")
    s.path(tail_lines(pose.tail), "line")
    s.path(smooth(pose.crest, closed=True, tension=0.8), "outline")
    s.path(smooth(pose.body, closed=True), "outline")
    s.path(smooth(pose.wing, closed=True), "outline")
    s.path(streaks_d(pose.streaks), "streak")
    s.path(dots_d(pose.spots), "dots")
    s.path(smooth(pose.bill, closed=True), "outline")
    lean = math.degrees(math.atan2(pose.bill[3][1] - pose.bill[0][1], pose.bill[3][0] - pose.bill[0][0])) - 12
    blue, red = eye_patch(pose.eye, lean)
    s.path(red, "ember")
    s.path(blue, "lupine")
    s.path(ellipse_d(*pose.eye, 2.1, 2.1, 0), "eye")


def roadrunner_bounds() -> tuple[float, float, float, float]:
    """The viewBox: every pose and leg position, padded for strokes and the
    Catmull-Rom curves' overshoot; the bottom is the ground plus a stroke."""
    pts = run_pose().points() + stand_pose(False).points() + stand_pose(True).points()
    for k in range(RUN_FRAMES * 4):
        foot, _ = foot_at(k / (RUN_FRAMES * 4))
        pts += [foot, solve_leg(HIP, foot)]
    pad = 3.0
    x0 = math.floor(min(p[0] for p in pts) - pad)
    y0 = math.floor(min(p[1] for p in pts) - pad)
    x1 = math.ceil(max(p[0] for p in pts) + pad)
    return (x0, y0, x1 - x0, GROUND + 2 - y0)


def roadrunner() -> tuple[str, dict]:
    s = Sprite()
    run = run_pose()
    # every running pose shares the body; only the legs change
    s.open(f"opacity:clamp(0,calc({STAND} - var(--frame,{STAND})),1)")
    for k in range(RUN_FRAMES):
        s.open(shown_when(k))
        s.path(leg_d(k / RUN_FRAMES + 0.5), "far")  # behind the body
        s.close()
    draw_roadrunner(s, run)
    for k in range(RUN_FRAMES):
        s.open(shown_when(k))
        s.path(leg_d(k / RUN_FRAMES), "line")
        s.close()
    s.close()
    for k, flick in ((STAND, False), (FLICK, True)):
        s.open(shown_when(k))
        far_foot, near_foot = STAND_FEET
        s.path(stand_leg_d(far_foot), "far")
        draw_roadrunner(s, stand_pose(flick))
        s.path(stand_leg_d(near_foot), "line")
        s.close()
    x0, y0, w, h = roadrunner_bounds()
    data = {
        "viewBox": [int(v) if float(v).is_integer() else v for v in (x0, y0, w, h)],
        "runFrames": RUN_FRAMES,
        "stand": STAND,
        "flick": FLICK,
        "cycle": round(CYCLE, 3),
        "pivot": round((HIP[0] - x0) / w, 4),
    }
    return f'<symbol id="roadrunner" viewBox="{n(x0)} {n(y0)} {n(w)} {n(h)}">{s.svg()}</symbol>', data


# ---------------------------------------------------------------------------
# A distant bird against the sunset, wings raised. The page flaps it by
# scaling it vertically through zero (wings up, level, down): at 20-30 px
# that reads as a wingbeat, and it costs the compositor nothing.

BIRD_W, BIRD_H = 44.0, 16.0


def bird() -> str:
    s = Sprite()
    # shoulder to tip: up and out, the tip turned down a little (a gull wing)
    wing = [(21, 8.8), (16, 5.2), (10.5, 2.2), (5, 1.4), (0.6, 3.6), (5.4, 3.3), (10.5, 4.6), (16, 8), (21, 11)]
    s.path(smooth(wing, closed=True), "solid")
    s.path(smooth([(BIRD_W - x, y) for x, y in wing], closed=True), "solid")
    s.path(ellipse_d(22, 9.6, 3.6, 1.9, -4) + ellipse_d(25.6, 8.9, 1.6, 1.4, 0), "solid")
    return f'<symbol id="bird" viewBox="0 0 {n(BIRD_W)} {n(BIRD_H)}">{s.svg()}</symbol>'


# ---------------------------------------------------------------------------
# A red-tailed hawk seen from above, soaring: wings spread and fingered at the
# tips, tail fanned and rufous. It points up the page; the hero turns it
# around a thermal over Camelback.

HAWK_W, HAWK_H = 132.0, 84.0


def hawk() -> str:
    s = Sprite()
    cx = HAWK_W / 2
    # one wing, the left; the right mirrors it
    # broad, as a red-tail's are, with the primaries splayed into fingers
    wing = [
        (cx - 5, 25), (cx - 18, 19.5), (cx - 34, 18), (cx - 48, 19.5), (cx - 58, 22.5),
        (cx - 63.5, 27), (cx - 60, 29), (cx - 64, 32.2), (cx - 59, 33.6), (cx - 62, 37),
        (cx - 56.5, 37.8), (cx - 58, 41.5), (cx - 52, 42.5), (cx - 42, 44.5), (cx - 30, 45),
        (cx - 18, 45.5), (cx - 6, 45),
    ]
    right = [(HAWK_W - x, y) for x, y in wing]
    tail = [(cx - 4.5, 52), (cx - 9, 60), (cx - 12.5, 69), (cx - 9, 74.5), (cx, 76), (cx + 9, 74.5),
            (cx + 12.5, 69), (cx + 9, 60), (cx + 4.5, 52)]
    body = [(cx, 13), (cx + 4.2, 17), (cx + 6.4, 28), (cx + 6, 42), (cx + 4, 54), (cx, 57),
            (cx - 4, 54), (cx - 6, 42), (cx - 6.4, 28), (cx - 4.2, 17)]
    s.path(smooth(tail, closed=True), "fruit")
    s.path(smooth(tail, closed=True), "line")  # unfilled, so the rufous shows
    s.path(smooth(wing, closed=True, tension=0.85), "outline")
    s.path(smooth(right, closed=True, tension=0.85), "outline")
    # the covert line along each wing, and the primaries' gaps
    for side in (-1, 1):
        def x(v: float) -> float:
            return cx + side * v
        s.path(f"M{n(x(8))} {n(32)}C{n(x(22))} {n(29)} {n(x(38))} {n(29)} {n(x(50))} {n(32)}"
               f"M{n(x(51))} {n(33.5)}L{n(x(59))} {n(31.5)}M{n(x(50))} {n(35.5)}L{n(x(58))} {n(35.5)}"
               f"M{n(x(48))} {n(37.5)}L{n(x(54))} {n(39)}", "line")
    s.path(smooth(body, closed=True), "outline")
    s.path(ellipse_d(cx, 17.2, 3.4, 4.2, 90), "outline")
    return f'<symbol id="hawk" viewBox="0 0 {n(HAWK_W)} {n(HAWK_H)}">{s.svg()}</symbol>'


def build() -> tuple[str, str]:
    """The sprite, and the JS data module that goes with it."""
    rr, data = roadrunner()
    svg = '<svg xmlns="http://www.w3.org/2000/svg">' + rr + bird() + hawk() + "</svg>\n"
    js = (
        "// @ts-check\n"
        "// Generated by scripts/draw_fauna.py from the same numbers that drew\n"
        "// assets/fauna.svg. Do not edit; change the script and re-run it.\n\n"
        "/**\n"
        " * The roadrunner flip-book. `--frame` 0..runFrames-1 is the run cycle,\n"
        " * `stand` and `flick` the standing poses; one whole cycle carries the\n"
        " * bird `cycle` units (its own viewBox units) along the ground; it turns\n"
        " * around at `pivot` (a fraction of its width: the hip).\n"
        " * @type {{ viewBox: number[], runFrames: number, stand: number, flick: number, cycle: number, pivot: number }}\n"
        " */\n"
        f"export const ROADRUNNER = {json.dumps(data, separators=(', ', ': '))};\n"
    )
    return svg, js


if __name__ == "__main__":
    svg, js = build()
    OUT.write_text(svg, encoding="utf-8")
    DATA_OUT.write_text(js, encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KB) and {DATA_OUT}")

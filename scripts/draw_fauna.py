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
import re
from dataclasses import dataclass
from pathlib import Path

from draw_desert import STYLE as PLANT_STYLE, dots_d, ellipse_d, n, smooth

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "fauna.svg"
DATA_OUT = ROOT / "js" / "fauna-data.js"
CRITTERS_OUT = ROOT / "assets" / "critters.svg"
CRITTER_DATA_OUT = ROOT / "js" / "critter-data.js"

STYLE = {
    **PLANT_STYLE,
    # the rattlesnake's tongue
    "tongue": "fill:none;stroke:var(--illo-ember,#d4452a);stroke-width:calc(var(--illo-w,1.6) * .8);stroke-linecap:round;stroke-linejoin:round",
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


def solve_leg(hip: Pt, foot: Pt, thigh: float = THIGH, shin: float = SHIN, prefer: Pt = (-1.0, 0.0)) -> Pt:
    """Where the middle joint goes: the two-bone IK solution on the `prefer`
    side of the hip-to-foot line (backward, for a bird's heel or a hock;
    forward for a foreleg's knee; up for a scorpion's), clamped when the foot
    is out of reach."""
    dx, dy = foot[0] - hip[0], foot[1] - hip[1]
    dist = math.hypot(dx, dy)
    d = min(max(dist, abs(thigh - shin) + 1e-6), thigh + shin - 1e-6)
    a = (thigh * thigh - shin * shin + d * d) / (2 * d)
    h = math.sqrt(max(thigh * thigh - a * a, 0.0))
    ux, uy = dx / dist, dy / dist
    mx, my = hip[0] + ux * a, hip[1] + uy * a
    # of the two perpendiculars, take the one on the preferred side
    px, py = -uy, ux
    if px * prefer[0] + py * prefer[1] < 0:
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
        self.ds: list[str] = []

    def path(self, d: str, kind: str) -> None:
        if d:
            extra = ' pathLength="1"' if kind in STROKED else ""
            self.parts.append(f'<path d="{d}"{extra} style="{STYLE[kind]}"/>')
            self.ds.append(d)

    def view_box(self, ground: float, pad: float = 2.5) -> tuple[float, float, float, float]:
        """Everything drawn, padded for strokes; the bottom edge is the ground
        (plus a stroke), so the animal stands on whatever its box sits on."""
        pts = [q for d in self.ds for q in path_points(d)]
        x0 = math.floor(min(q[0] for q in pts) - pad)
        y0 = math.floor(min(q[1] for q in pts) - pad)
        x1 = math.ceil(max(q[0] for q in pts) + pad)
        return (x0, y0, x1 - x0, ground + 2 - y0)

    def open(self, style: str) -> None:
        self.parts.append(f'<g style="{style}">')

    def close(self) -> None:
        self.parts.append("</g>")

    def svg(self) -> str:
        return "".join(self.parts)


def path_points(d: str) -> list[Pt]:
    """Every point a path passes through or pulls toward, control points and
    arc extremes included: a safe over-estimate of how far it reaches. Knows
    the commands this file writes (M L C Q Z, and relative l q h a)."""
    toks = re.findall(r"[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)", d)
    pts: list[Pt] = []
    i, cmd = 0, ""
    cx = cy = sx = sy = 0.0

    def take(k: int) -> list[float]:
        nonlocal i
        vals = [float(v) for v in toks[i:i + k]]
        i += k
        return vals
    while i < len(toks):
        if toks[i].isalpha():
            cmd = toks[i]
            i += 1
            if cmd in "Zz":
                cx, cy = sx, sy
            continue
        if cmd == "M":
            cx, cy = take(2)
            sx, sy = cx, cy
            pts.append((cx, cy))
            cmd = "L"
        elif cmd == "L":
            cx, cy = take(2)
            pts.append((cx, cy))
        elif cmd == "l":
            dx, dy = take(2)
            cx, cy = cx + dx, cy + dy
            pts.append((cx, cy))
        elif cmd == "h":
            cx += take(1)[0]
            pts.append((cx, cy))
        elif cmd == "C":
            x1, y1, x2, y2, cx, cy = take(6)
            pts += [(x1, y1), (x2, y2), (cx, cy)]
        elif cmd == "Q":
            x1, y1, cx, cy = take(4)
            pts += [(x1, y1), (cx, cy)]
        elif cmd == "q":
            x1, y1, x, y = take(4)
            pts += [(cx + x1, cy + y1), (cx + x, cy + y)]
            cx, cy = cx + x, cy + y
        elif cmd == "a":
            rx, ry, _, _, _, x, y = take(7)
            r = max(rx, ry)
            for px, py in ((cx, cy), (cx + x, cy + y)):
                pts += [(px - r, py - r), (px + r, py + r)]
            cx, cy = cx + x, cy + y
        else:
            raise ValueError(f"path_points doesn't know {cmd!r}")
    return pts


def symbol(sym_id: str, box: tuple[float, float, float, float], body: str) -> str:
    """A symbol whose viewBox starts at 0 0, with the drawing shifted into it.
    A <use> lays its symbol's viewport at the outer <svg>'s origin, so a
    viewBox that starts anywhere else sinks or lifts the drawing by that much
    (the roadrunner once stood 13 units below its own feet)."""
    x0, y0, w, h = box
    inner = f'<g transform="translate({n(-x0)} {n(-y0)})">{body}</g>' if (x0, y0) != (0, 0) else body
    return f'<symbol id="{sym_id}" viewBox="0 0 {n(w)} {n(h)}">{inner}</symbol>'


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
        "viewBox": [0, 0, int(w) if float(w).is_integer() else w, int(h) if float(h).is_integer() else h],
        "runFrames": RUN_FRAMES,
        "stand": STAND,
        "flick": FLICK,
        "cycle": round(CYCLE, 3),
        "pivot": round((HIP[0] - x0) / w, 4),
    }
    return symbol("roadrunner", (x0, y0, w, h), s.svg()), data


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


# ---------------------------------------------------------------------------
# The rest of the neighbourhood (assets/critters.svg): each is a flip-book on
# the roadrunner's scheme, and each has its own way of getting about. Frames
# 0..5 are the gait, 6 is at rest, 7+ are what it does while resting.


def gait_foot(u: float, hip_x: float, ground: float, stride: float, stance: float, lift: float) -> tuple[Pt, bool]:
    """A foot on a stride loop (as foot_at, for any leg): planted, it sweeps
    back evenly; lifted, it swings forward on a low arc."""
    u %= 1.0
    front, back = hip_x + stride / 2, hip_x - stride / 2
    if u < stance:
        return (front + (back - front) * u / stance, ground), True
    t = (u - stance) / (1 - stance)
    e = t * t * (3 - 2 * t)
    return (back + (front - back) * e, ground - lift * math.sin(math.pi * t) ** .7), False


def tube(centre: list[Pt], widths: list[float]) -> list[Pt]:
    """The outline of a tube (a snake's body) along a centreline: one edge
    out, the other back."""
    left, right = [], []
    for i, (x, y) in enumerate(centre):
        (x0, y0), (x1, y1) = centre[max(i - 1, 0)], centre[min(i + 1, len(centre) - 1)]
        tx, ty = x1 - x0, y1 - y0
        L = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / L, tx / L
        w = widths[i] / 2
        left.append((x + nx * w, y + ny * w))
        right.append((x - nx * w, y - ny * w))
    return left + right[::-1]


def smoothstep(e0: float, e1: float, v: float) -> float:
    t = min(1.0, max(0.0, (v - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def bounds(pts: list[Pt], ground: float, pad: float = 3.0) -> tuple[float, float, float, float]:
    x0 = math.floor(min(p[0] for p in pts) - pad)
    y0 = math.floor(min(p[1] for p in pts) - pad)
    x1 = math.ceil(max(p[0] for p in pts) + pad)
    return (x0, y0, x1 - x0, ground + 2 - y0)


# --- the javelina (collared peccary), trotting --------------------------------

J_GROUND = 100.0
J_SHOULDER: Pt = (82.0, 73.0)
J_HIP: Pt = (32.0, 72.0)
J_UPPER, J_LOWER = 16.0, 16.5
J_STRIDE, J_STANCE, J_LIFT = 20.0, 0.5, 7.0
J_CYCLE = J_STRIDE / J_STANCE

J_BODY: list[Pt] = [
    (18, 65), (21, 56), (28, 49), (42, 44.5), (58, 41), (71, 38.5), (83, 40.5), (91, 45), (99, 49.5),
    (109, 54), (120, 59.5), (128.5, 63.5), (132.8, 66.2), (133, 71), (127.5, 72.8), (116, 72.6),
    (106, 72.2), (97, 74.5), (88, 78.5), (76, 81.5), (58, 82.5), (42, 81.5), (30, 78.5), (22, 73),
]
J_COLLAR: list[Pt] = [(80.5, 40), (87.5, 42.5), (92, 56), (99.5, 72.5), (93.5, 76.5), (86, 59)]
J_EAR: list[Pt] = [(92, 48.5), (89.5, 40), (96.5, 45.5)]
J_EYE: Pt = (109.5, 58.5)
J_NOSE: Pt = (132.4, 68.6)


def hoof_d(foot: Pt, planted: bool, forward: float = 1.0) -> str:
    fx, fy = foot
    if planted:
        return f"M{n(fx - 1.2)} {n(fy)}L{n(fx + 3.4 * forward)} {n(fy)}L{n(fx + .6)} {n(fy - 3.2)}Z"
    return f"M{n(fx)} {n(fy)}l{n(-2.6)} {n(2.4)}l{n(2.9)} {n(1)}Z"


def j_leg(shoulder: Pt, foot: Pt, planted: bool, front: bool) -> str:
    knee = solve_leg(shoulder, foot, J_UPPER, J_LOWER, prefer=(1.0, 0.0) if front else (-1.0, 0.0))
    return f"M{n(shoulder[0])} {n(shoulder[1])}L{n(knee[0])} {n(knee[1])}L{n(foot[0])} {n(foot[1])}" + hoof_d(foot, planted)


def j_head_down(pts: list[Pt], deg: float) -> list[Pt]:
    return bend(pts, (88.0, 58.0), deg, 84, 100)


def draw_javelina(s: Sprite, rooting: bool = False) -> None:
    deg = 34.0 if rooting else 0.0
    body = j_head_down(J_BODY, deg)
    s.path(smooth(body, closed=True), "outline")
    s.path(smooth(j_head_down(J_COLLAR, deg), closed=True, tension=.8), "cream")
    s.path(smooth(j_head_down(J_EAR, deg), closed=True, tension=.7), "outline")
    # the mane along the back, and a grizzled coat
    mane = ""
    for k in range(13):
        x = 30 + k * 5
        y = next(py for px, py in zip([p[0] for p in J_BODY[2:8]], [p[1] for p in J_BODY[2:8]]) if px >= x) if x < 91 else 45
        top = min((py for px, py in J_BODY[:9] if abs(px - x) < 8), default=y)
        mane += f"M{n(x)} {n(top + 1)}l{n(-2.2)} {n(-4.2 - (k % 3))}"
    s.path(mane, "line")
    grizzle = "".join(f"M{n(x)} {n(y)}l{n(3.4)} {n(1.2)}" for x, y in ((40, 58), (52, 54), (64, 56), (46, 68), (60, 66), (72, 62), (34, 64)))
    s.path(grizzle, "streak")
    eye, nose = j_head_down([J_EYE, J_NOSE], deg)
    s.path(ellipse_d(*eye, 1.6, 1.6, 0), "eye")
    s.path(ellipse_d(*nose, 1.7, 2.6, deg * .6), "eye")
    m0, m1 = j_head_down([(130.5, 71.6), (117, 71.4)], deg)
    s.path(f"M{n(m0[0])} {n(m0[1])}L{n(m1[0])} {n(m1[1])}", "line")


def javelina() -> tuple[str, dict]:
    s = Sprite()
    far_off = (-3.0, -2.0)
    fs, fh = (J_SHOULDER[0] + far_off[0], J_SHOULDER[1] + far_off[1]), (J_HIP[0] + far_off[0], J_HIP[1] + far_off[1])
    s.open(f"opacity:clamp(0,calc({STAND} - var(--frame,{STAND})),1)")
    # a trot: diagonal pairs together (near fore with far hind, far fore with near hind)
    phases = {"nf": 0.0, "fh": 0.0, "ff": 0.5, "nh": 0.5}
    for k in range(RUN_FRAMES):
        u = k / RUN_FRAMES
        s.open(shown_when(k))
        d = ""
        for key, hip, front in (("ff", fs, True), ("fh", fh, False)):
            foot, planted = gait_foot(u + phases[key], hip[0], J_GROUND, J_STRIDE, J_STANCE, J_LIFT)
            d += j_leg(hip, foot, planted, front)
        s.path(d, "far")
        s.close()
    draw_javelina(s)
    for k in range(RUN_FRAMES):
        u = k / RUN_FRAMES
        s.open(shown_when(k))
        d = ""
        for key, hip, front in (("nf", J_SHOULDER, True), ("nh", J_HIP, False)):
            foot, planted = gait_foot(u + phases[key], hip[0], J_GROUND, J_STRIDE, J_STANCE, J_LIFT)
            d += j_leg(hip, foot, planted, front)
        s.path(d, "line")
        s.close()
    s.close()
    for k, rooting in ((STAND, False), (FLICK, True)):
        s.open(shown_when(k))
        s.path(j_leg(fs, (fs[0] + 2, J_GROUND), True, True) + j_leg(fh, (fh[0] - 1, J_GROUND), True, False), "far")
        draw_javelina(s, rooting)
        s.path(j_leg(J_SHOULDER, (J_SHOULDER[0] + 1, J_GROUND), True, True) + j_leg(J_HIP, (J_HIP[0], J_GROUND), True, False), "line")
        s.close()
    x0, y0, w, h = s.view_box(J_GROUND)
    data = {"viewBox": [x0, y0, w, h], "runFrames": RUN_FRAMES, "stand": STAND, "cycle": round(J_CYCLE, 3),
            "pivot": round(((J_SHOULDER[0] + J_HIP[0]) / 2 - x0) / w, 4)}
    return symbol("javelina", (x0, y0, w, h), s.svg()), data


# --- the western diamondback, slithering ------------------------------------

S_GROUND = 40.0
S_HEAD_X = 160.0     # the snout
S_LEN = 150.0        # snout to the root of the rattle, along the body
S_WAVE = 56.0        # the body's undulation, snout to tail; one wave per 56 units run
S_SAMPLES = 40


def s_width(s: float) -> float:
    """Thickness along the body: a neck behind the head, full through the
    middle, tapering to the tail."""
    return 6.4 + 3.4 * smoothstep(14, 42, s) - 6.2 * smoothstep(92, S_LEN, s)


def s_centre(phase: float, amp: float, rattle_lift: float = 0.0) -> list[Pt]:
    pts = []
    for i in range(S_SAMPLES + 1):
        s = S_LEN * i / S_SAMPLES
        env = smoothstep(4, 26, s) * (0.45 + 0.55 * (1 - smoothstep(110, S_LEN, s)))
        y = S_GROUND - s_width(s) / 2 - amp * env * (1 + math.sin(2 * math.pi * s / S_WAVE - phase)) / 2
        y -= 3.2 * (1 - smoothstep(0, 16, s))                    # the head carried a little up
        y -= rattle_lift * smoothstep(128, S_LEN, s) ** 2        # the tail tip raised to rattle
        pts.append((S_HEAD_X - s, y))
    return pts


def rattle_d(centre: list[Pt], tilt: float) -> str:
    """The rattle: five dry segments off the tail tip."""
    tx, ty = centre[-1]
    ax, ay = centre[-3]
    ang = math.degrees(math.atan2(ty - ay, tx - ax)) + tilt
    rat = ""
    for k in range(5):
        d = 1.2 + k * 2.9
        cx, cy = tx + math.cos(math.radians(ang)) * d, ty + math.sin(math.radians(ang)) * d
        rat += ellipse_d(cx, cy, 1.9, 2.1 - k * .12, ang)
    return rat


def draw_snake(s: Sprite, phase: float, amp: float, tongue: bool = False, rattle: float = 0.0,
               rattle_tilt: float | None = 0.0) -> None:
    """One whole snake; rattle_tilt=None leaves the rattle to the caller."""
    centre = s_centre(phase, amp, rattle)
    widths = [s_width(S_LEN * i / S_SAMPLES) for i in range(S_SAMPLES + 1)]
    if rattle_tilt is not None:
        s.path(rattle_d(centre, rattle_tilt), "cream")        # first, so the tail overlaps its root
    s.path(smooth(tube(centre, widths), closed=True), "outline")
    # diamonds down the back, then the black-and-white bands before the rattle
    marks = ""
    for sd in range(24, 116, 11):
        i = round(sd / S_LEN * S_SAMPLES)
        (x, y), (xa, ya), (xb, yb) = centre[i], centre[max(i - 1, 0)], centre[i + 1]
        a = math.atan2(yb - ya, xb - xa)
        L, W = 4.6, s_width(sd) * .36
        ux, uy, vx, vy = math.cos(a), math.sin(a), -math.sin(a), math.cos(a)
        marks += f"M{n(x - ux * L)} {n(y - uy * L)}L{n(x + vx * W)} {n(y + vy * W)}L{n(x + ux * L)} {n(y + uy * L)}L{n(x - vx * W)} {n(y - vy * W)}Z"
    for sd in (121, 131, 141):
        i0, i1 = round(sd / S_LEN * S_SAMPLES), max(round(sd / S_LEN * S_SAMPLES) + 1, round((sd + 4.5) / S_LEN * S_SAMPLES))
        seg = centre[i0:i1 + 1]
        marks += smooth(tube(seg, [s_width(S_LEN * (i0 + j) / S_SAMPLES) for j in range(len(seg))]), closed=True, tension=.6)
    s.path(marks, "solid")
    # the head: broad at the jaws, blunt at the snout
    hx, hy = centre[0]
    head = [(hx + 1.5, hy + .6), (hx - 2, hy - 3.1), (hx - 8, hy - 4.6), (hx - 14.5, hy - 4.4), (hx - 17.5, hy - 1.8),
            (hx - 16.5, hy + 2.6), (hx - 11, hy + 4.2), (hx - 3.5, hy + 3.4)]
    s.path(smooth(head, closed=True, tension=.8), "outline")
    s.path(f"M{n(hx - 5)} {n(hy - 1.4)}L{n(hx - 15)} {n(hy + 2.4)}M{n(hx + .8)} {n(hy + 1.6)}L{n(hx - 9)} {n(hy + 2.3)}", "line")
    s.path(ellipse_d(hx - 6.2, hy - 1.6, 1.3, 1.3, 0), "eye")
    if tongue:
        s.path(f"M{n(hx + 1)} {n(hy + 1.5)}l5.5 .6l2.4 -1.6M{n(hx + 6.5)} {n(hy + 2.1)}l2.3 1.5", "tongue")


def snake() -> tuple[str, dict]:
    s = Sprite()
    for k in range(RUN_FRAMES):
        s.open(shown_when(k))
        draw_snake(s, 2 * math.pi * k / RUN_FRAMES, 4.4, tongue=k in (1, 4))
        s.close()
    # resting: one body for 6 and 7 (7 adds the tongue), one with the tail
    # raised for 8 and 9, which differ only in the rattle's angle (a buzz)
    s.open(f"opacity:clamp(0,calc(1 - max(var(--frame,{STAND}) - {FLICK},{STAND} - var(--frame,{STAND}))),1)")
    draw_snake(s, 0.9, 1.6)
    s.open(shown_when(FLICK))
    hx, hy = s_centre(0.9, 1.6)[0]
    s.path(f"M{n(hx + 1)} {n(hy + 1.5)}l5.5 .6l2.4 -1.6M{n(hx + 6.5)} {n(hy + 2.1)}l2.3 1.5", "tongue")
    s.close()
    s.close()
    s.open(f"opacity:clamp(0,calc(1 - max(var(--frame,{STAND}) - 9,8 - var(--frame,{STAND}))),1)")
    raised = s_centre(0.9, 1.6, 7)
    for k, tilt in ((8, -16), (9, 10)):
        s.open(shown_when(k))
        s.path(rattle_d(raised, tilt), "cream")
        s.close()
    draw_snake(s, 0.9, 1.6, rattle=7, rattle_tilt=None)
    s.close()
    x0, y0, w, h = s.view_box(S_GROUND)
    data = {"viewBox": [x0, y0, w, h], "runFrames": RUN_FRAMES, "stand": STAND, "cycle": S_WAVE,
            "pivot": round((S_HEAD_X - S_LEN / 2 - x0) / w, 4)}
    return symbol("rattlesnake", (x0, y0, w, h), s.svg()), data


# --- the desert hairy scorpion ------------------------------------------------

K_GROUND = 60.0
K_BODY: list[Pt] = [(39, 44), (46, 40.5), (58, 38.5), (70, 38.3), (80, 39.6), (86.5, 42.2), (88.5, 45.6),
                    (84, 48.4), (70, 49.6), (56, 49.4), (44, 48.4), (37.5, 46.4)]
K_HIPS = [(80.0, 47.5), (73.0, 48.6), (65.0, 49.0), (57.0, 48.8)]    # front to back, near side
K_FEET = [11.0, 3.0, -5.0, -12.0]                                   # where each foot rests, from its hip
K_FEMUR, K_TIBIA = 9.5, 12.5
K_STRIDE, K_STANCE, K_LIFT = 8.0, 0.5, 3.4
K_CYCLE = K_STRIDE / K_STANCE
# the tail: five segments and the sting, arched over the back; raised in threat
K_TAIL_REST = [(35.5, 41), (31.5, 33), (32.5, 24.5), (38, 18.5), (46, 16), (54.5, 17.8)]
K_TAIL_THREAT = [(35.5, 40), (32.5, 30.5), (35, 21.5), (41.5, 14.5), (50.5, 11.5), (59, 13.5)]


def k_leg(hip: Pt, foot: Pt, planted: bool) -> str:
    knee = solve_leg(hip, foot, K_FEMUR, K_TIBIA, prefer=(0.0, -1.0))
    tip = f"l{n(2.2 if foot[0] >= hip[0] else -2.2)} 0" if planted else "l0 1.6"
    return f"M{n(hip[0])} {n(hip[1])}L{n(knee[0])} {n(knee[1])}L{n(foot[0])} {n(foot[1])}{tip}"


def k_legs(u: float, near: bool) -> str:
    d = ""
    for i, (hip, rest) in enumerate(zip(K_HIPS, K_FEET)):
        h = hip if near else (hip[0] - 2.5, hip[1] - 2.2)
        phase = (0.0 if i % 2 == 0 else 0.5) + (0.0 if near else 0.5)
        foot, planted = gait_foot(u + phase, h[0] + rest, K_GROUND, K_STRIDE, K_STANCE, K_LIFT)
        d += k_leg(h, foot, planted)
    return d


def k_claw(base: Pt, open_: bool, dy: float = 0.0) -> str:
    x, y = base
    y += dy
    arm = f"M{n(x)} {n(y)}L{n(x + 8)} {n(y - 5.5)}L{n(x + 16)} {n(y - 2.4)}"
    return arm


def draw_scorpion(s: Sprite, tail: list[Pt], claws_open: bool) -> None:
    lift = -3.0 if claws_open else 0.0
    # the far pincer, then the tail, the body and the near pincer
    for near, off in ((False, (-2.5, -2.2)), (True, (0.0, 0.0))):
        bx, by = 85 + off[0], 45.5 + off[1]
        arm = f"M{n(bx)} {n(by)}L{n(bx + 7)} {n(by - 5.5 + lift)}L{n(bx + 14.5)} {n(by - 2.8 + lift)}"
        hx, hy = bx + 21, by - 3 + lift
        hand = ellipse_d(hx, hy, 6.6, 4.1, -6)
        if claws_open:
            fingers = f"M{n(hx + 5.5)} {n(hy - 1.8)}q{n(4)} {n(-3.2)} {n(7)} {n(-4.4)}M{n(hx + 5.8)} {n(hy + 1.2)}q{n(4)} {n(1.6)} {n(7.4)} {n(2.2)}"
        else:
            fingers = f"M{n(hx + 5.5)} {n(hy - 1.4)}q{n(4.4)} {n(-.9)} {n(7.6)} {n(.4)}M{n(hx + 5.8)} {n(hy + 1.3)}q{n(4)} {n(.2)} {n(7.2)} {n(-.6)}"
        if near:
            continue_near = (arm, hand, fingers)
        else:
            s.path(arm + fingers, "far")
            s.path(hand, "far")
    segs = ""
    for i in range(5):
        (x0, y0), (x1, y1) = tail[i], tail[i + 1]
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        L = math.hypot(x1 - x0, y1 - y0) / 2 + 1.2
        segs += ellipse_d(cx, cy, L, 3.1 - i * .12, math.degrees(math.atan2(y1 - y0, x1 - x0)))
    s.path(segs, "outline")
    tx, ty = tail[-1]
    s.path(ellipse_d(tx + 1.8, ty + 1.2, 4.2, 3.1, 25), "outline")
    s.path(f"M{n(tx + 5)} {n(ty + 2.8)}q{n(3)} {n(1.4)} {n(2.6)} {n(6.2)}", "line")
    s.path(smooth(K_BODY, closed=True), "outline")
    tergites = "".join(f"M{n(x)} {n(39.5 if x < 70 else 40)}q{n(-1.4)} {n(4.5)} 0 {n(9.2)}" for x in (47, 53, 59, 65, 71, 78))
    s.path(tergites, "line")
    s.path(dots_d([(84.5, 41.8), (82.8, 41.2)]), "dots")
    arm, hand, fingers = continue_near
    s.path(arm + fingers, "line")
    s.path(hand, "outline")


def scorpion() -> tuple[str, dict]:
    s = Sprite()
    s.open(f"opacity:clamp(0,calc({STAND} - var(--frame,{STAND})),1)")
    for k in range(RUN_FRAMES):
        s.open(shown_when(k))
        s.path(k_legs(k / RUN_FRAMES, near=False), "far")
        s.close()
    draw_scorpion(s, K_TAIL_REST, False)
    for k in range(RUN_FRAMES):
        s.open(shown_when(k))
        s.path(k_legs(k / RUN_FRAMES, near=True), "line")
        s.close()
    s.close()
    for k, threat in ((STAND, False), (FLICK, True)):
        s.open(shown_when(k))
        s.path("".join(k_leg((h[0] - 2.5, h[1] - 2.2), (h[0] - 2.5 + r, K_GROUND), True) for h, r in zip(K_HIPS, K_FEET)), "far")
        draw_scorpion(s, K_TAIL_THREAT if threat else K_TAIL_REST, threat)
        s.path("".join(k_leg(h, (h[0] + r, K_GROUND), True) for h, r in zip(K_HIPS, K_FEET)), "line")
        s.close()
    x0, y0, w, h = s.view_box(K_GROUND)
    data = {"viewBox": [x0, y0, w, h], "runFrames": RUN_FRAMES, "stand": STAND, "cycle": round(K_CYCLE, 3),
            "pivot": round((64 - x0) / w, 4)}
    return symbol("scorpion", (x0, y0, w, h), s.svg()), data


# --- the Sonoran Desert toad --------------------------------------------------

T_GROUND = 60.0
T_BODY: list[Pt] = [(15, 58.6), (11.5, 51), (15, 43), (25, 36.5), (37, 33.2), (47, 33.4), (53, 31.2), (58.5, 29.6),
                    (63, 31.6), (68, 37), (71.5, 41.8), (69, 45.2), (62, 47.6), (55.5, 50.5), (49, 54.5),
                    (40, 57.6), (28, 58.8)]
T_EYE: Pt = (58.6, 35.4)
T_HOP = 50.0         # one hop, in its own units (about two thirds of its length)
T_HOP_H = 15.0


def draw_toad(s: Sprite, pose: str) -> None:
    """pose: sit, blink, throat, crouch or leap."""
    pivot = (30.0, 52.0)
    body = T_BODY
    if pose == "crouch":
        body = [(x, T_GROUND - (T_GROUND - y) * .86) for x, y in body]
    elif pose == "leap":
        body = [rot(p, pivot, -24) for p in body]
    tf = (lambda p: p) if pose not in ("crouch", "leap") else (
        (lambda p: (p[0], T_GROUND - (T_GROUND - p[1]) * .86)) if pose == "crouch" else (lambda p: rot(p, pivot, -24)))
    if pose == "leap":
        # the hind legs thrown out behind, the front ones reaching for the landing
        hip = tf((24.0, 50.0))
        s.path(f"M{n(hip[0])} {n(hip[1])}L{n(hip[0] - 13)} {n(hip[1] + 9)}L{n(hip[0] - 24)} {n(hip[1] + 13)}l{n(-6)} {n(1.5)}"
               f"M{n(hip[0] - 24)} {n(hip[1] + 13)}l{n(-5)} {n(3.5)}M{n(hip[0] - 24)} {n(hip[1] + 13)}l{n(-6.5)} {n(-1)}", "line")
    s.path(smooth(body, closed=True), "outline")
    gland = [tf(p) for p in ((41.5, 38.4), (46, 36.4), (52.5, 37), (51, 39.8), (44, 40.6))]
    s.path(smooth(gland, closed=True), "outline")
    warts = [tf(p) for p in ((24, 44), (30, 40.5), (36, 38.5), (21, 50), (33, 47), (40, 45), (46, 47.5))]
    s.path(dots_d(warts), "dots")
    mouth = [tf(p) for p in ((70.5, 43.4), (64, 44.4), (57.5, 43.6))]
    s.path(f"M{n(mouth[0][0])} {n(mouth[0][1])}Q{n(mouth[1][0])} {n(mouth[1][1])} {n(mouth[2][0])} {n(mouth[2][1])}", "line")
    if pose == "throat":
        s.path(ellipse_d(58.5, 49.4, 5.2, 3.2, -18), "outline")
    ex, ey = tf(T_EYE)
    s.path(ellipse_d(ex, ey, 3.3, 3.3, 0), "outline" if pose == "blink" else "flower")
    if pose == "blink":
        s.path(f"M{n(ex - 3)} {n(ey + .4)}q{n(3)} {n(1.6)} {n(6)} 0", "line")
    else:
        s.path(ellipse_d(ex + .4, ey, 1.6, 1, 0), "eye")
    if pose == "leap":
        c = tf((52.0, 50.0))
        s.path(f"M{n(c[0])} {n(c[1])}L{n(c[0] + 9)} {n(c[1] + 8)}l{n(3)} {n(.4)}M{n(c[0] + 9)} {n(c[1] + 8)}l{n(1.4)} {n(2.4)}", "line")
        return
    # folded hind leg: the thigh along the flank, the long foot flat forward
    thigh = [tf(p) for p in ((13.5, 53), (18, 46.5), (28, 47.5), (35.5, 53.5), (31, 57.5), (19, 58))]
    s.path(smooth(thigh, closed=True), "outline")
    heel, toe = tf((22.0, 59.2)), tf((44.0, 59.6))
    s.path(f"M{n(heel[0])} {n(heel[1])}L{n(toe[0])} {n(toe[1])}l{n(3.5)} {n(-.6)}M{n(toe[0])} {n(toe[1])}l{n(3)} {n(.5)}", "line")
    sh, hand = tf((52.0, 50.5)), tf((56.5, T_GROUND - .4))
    s.path(f"M{n(sh[0])} {n(sh[1])}Q{n(sh[0] + 1)} {n((sh[1] + hand[1]) / 2)} {n(hand[0])} {n(hand[1])}"
           f"l{n(3)} {n(.3)}M{n(hand[0])} {n(hand[1])}l{n(2.4)} {n(-1.2)}M{n(hand[0])} {n(hand[1])}l{n(-2)} {n(.4)}", "line")


def toad() -> tuple[str, dict]:
    s = Sprite()
    # 0 crouch (take-off and landing), 1 in the air; 6 sitting, 7 blinking, 8 breathing
    for k, pose in ((0, "crouch"), (1, "leap"), (STAND, "sit"), (FLICK, "blink"), (8, "throat")):
        s.open(shown_when(k))
        draw_toad(s, pose)
        s.close()
    x0, y0, w, h = s.view_box(T_GROUND)
    data = {"viewBox": [x0, y0, w, h], "stand": STAND, "crouch": 0, "leap": 1, "hop": T_HOP, "hopHeight": T_HOP_H,
            "pivot": round((40 - x0) / w, 4)}
    return symbol("toad", (x0, y0, w, h), s.svg()), data


def build_critters() -> tuple[str, str]:
    """assets/critters.svg and js/critter-data.js."""
    parts, data = [], {}
    for name, make in (("javelina", javelina), ("rattlesnake", snake), ("scorpion", scorpion), ("toad", toad)):
        svg, d = make()
        parts.append(svg)
        data[name] = {k: (int(v) if isinstance(v, float) and v.is_integer() else v) for k, v in d.items()}
        data[name]["viewBox"] = [0, 0] + [int(v) if float(v).is_integer() else v for v in d["viewBox"][2:]]
    svg = '<svg xmlns="http://www.w3.org/2000/svg">' + "".join(parts) + "</svg>\n"
    js = (
        "// @ts-check\n"
        "// Generated by scripts/draw_fauna.py from the same numbers that drew\n"
        "// assets/critters.svg. Do not edit; change the script and re-run it.\n\n"
        "/**\n"
        " * Flip-books for the rest of the neighbourhood, on the roadrunner's\n"
        " * scheme (see fauna-data.js): `--frame` 0..runFrames-1 is the gait,\n"
        " * `stand` is at rest, and one gait cycle covers `cycle` viewBox units.\n"
        " * The toad hops instead: `crouch` and `leap` are its frames, and a hop\n"
        " * is `hop` units long and `hopHeight` high.\n"
        " * @type {Record<string, { viewBox: number[], stand: number, pivot: number, runFrames?: number, cycle?: number,\n"
        " *   crouch?: number, leap?: number, hop?: number, hopHeight?: number }>}\n"
        " */\n"
        f"export const CRITTERS = {json.dumps(data, separators=(', ', ': '))};\n"
    )
    return svg, js


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
    for (svg, js), (svg_out, js_out) in ((build(), (OUT, DATA_OUT)), (build_critters(), (CRITTERS_OUT, CRITTER_DATA_OUT))):
        svg_out.write_text(svg, encoding="utf-8")
        js_out.write_text(js, encoding="utf-8")
        print(f"wrote {svg_out} ({svg_out.stat().st_size / 1024:.1f} KB) and {js_out}")

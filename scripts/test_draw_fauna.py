"""Tests for draw_fauna.py: the animals are well-formed, and the roadrunner's
flip-book and legs behave.

Run: python3 -m pytest scripts/test_draw_fauna.py
"""

from __future__ import annotations

import math
import re
import xml.etree.ElementTree as ET

import pytest

import draw_fauna as df

SVG_NS = "{http://www.w3.org/2000/svg}"


@pytest.fixture(scope="module")
def built() -> tuple[ET.Element, str]:
    svg, js = df.build()
    return ET.fromstring(svg), js


def symbols(sprite: ET.Element) -> dict[str, ET.Element]:
    return {s.get("id"): s for s in sprite.iter(f"{SVG_NS}symbol")}


def test_every_animal_is_a_symbol_with_a_viewbox(built):
    sprite, _ = built
    syms = symbols(sprite)
    assert set(syms) == {"roadrunner", "bird", "hawk"}
    for sid, s in syms.items():
        w, h = map(float, s.get("viewBox").split()[2:])
        assert w > 0 and h > 0, sid


def test_every_viewbox_starts_at_the_origin(built):
    # <use> lays a symbol's viewport at the outer <svg>'s origin: a symbol
    # whose viewBox starts elsewhere is drawn shifted by that much.
    sprite, _ = built
    critters = ET.fromstring(df.build_critters()[0])
    for s in list(sprite.iter(f"{SVG_NS}symbol")) + list(critters.iter(f"{SVG_NS}symbol")):
        assert s.get("viewBox").split()[:2] == ["0", "0"], s.get("id")


def test_the_page_uses_the_same_viewboxes(built):
    # index.html repeats each symbol's viewBox on its outer <svg>, so the
    # drawing keeps its proportions; a regenerated sprite must not drift.
    sprite, _ = built
    html = open(df.ROOT / "index.html", encoding="utf-8").read()
    critters = ET.fromstring(df.build_critters()[0])
    for file, s in [("fauna", s) for s in sprite.iter(f"{SVG_NS}symbol")] + [("critters", s) for s in critters.iter(f"{SVG_NS}symbol")]:
        used = re.findall(rf'viewBox="([^"]+)"[^>]*><use href="assets/{file}.svg#{s.get("id")}"', html)
        assert used, f"{s.get('id')} is not on the page"
        assert set(used) == {s.get("viewBox")}, s.get("id")


def frame_of(style: str) -> int | None:
    m = re.search(r"max\(var\(--frame,\d+\) - (\d+),", style or "")
    return int(m.group(1)) if m else None


def test_exactly_one_pose_shows_for_every_frame(built):
    # Evaluate each group's opacity rule the way CSS will, for every --frame.
    sprite, _ = built
    rr = symbols(sprite)["roadrunner"]
    groups = [g for g in rr.iter(f"{SVG_NS}g")]
    poses = {frame_of(g.get("style")) for g in groups} - {None}
    assert poses == set(range(df.RUN_FRAMES)) | {df.STAND, df.FLICK}
    for frame in range(df.FLICK + 1):
        standing = [g for g in groups if frame_of(g.get("style")) in (df.STAND, df.FLICK)]
        showing = {frame_of(g.get("style")) for g in standing if 1 - abs(frame - frame_of(g.get("style"))) > 0}
        run_body_on = frame < df.STAND
        if run_body_on:
            assert not showing, frame
        else:
            assert showing == {frame}, frame


def test_the_run_body_hides_when_standing(built):
    sprite, _ = built
    rr = symbols(sprite)["roadrunner"]
    outer = next(g for g in rr.iter(f"{SVG_NS}g") if g.get("style"))
    assert f"calc({df.STAND} - var(--frame,{df.STAND}))" in outer.get("style")


def test_stroked_paths_can_draw_on(built):
    sprite, _ = built
    for p in sprite.iter(f"{SVG_NS}path"):
        style = p.get("style")
        if "stroke-dasharray" in style:
            assert p.get("pathLength") == "1"
        d = p.get("d")
        assert d and "nan" not in d.lower() and "inf" not in d.lower()
        assert re.fullmatch(r"[MLCQAZahlmqz0-9 .\-]+", d), d[:80]


def test_sprite_stays_small(built):
    sprite, _ = built
    assert len(ET.tostring(sprite)) < 40_000


def test_the_heel_is_where_the_bones_say_and_bends_backward():
    for k in range(24):
        foot, _ = df.foot_at(k / 24)
        heel = df.solve_leg(df.HIP, foot)
        assert math.isclose(math.dist(df.HIP, heel), df.THIGH, abs_tol=1e-6)
        assert math.isclose(math.dist(heel, foot), df.SHIN, abs_tol=1e-6)
        # behind the hip-to-foot line: a bird's heel points back
        cross = (foot[0] - df.HIP[0]) * (heel[1] - df.HIP[1]) - (foot[1] - df.HIP[1]) * (heel[0] - df.HIP[0])
        assert cross > 0, k


def test_a_planted_foot_sweeps_back_evenly_along_the_ground():
    # No skating: while planted, the foot moves back at a constant rate, so
    # the page can advance the flip-book by distance covered.
    xs = []
    for k in range(9):
        foot, planted = df.foot_at(k / 8 * df.STANCE * 0.999)
        assert planted and foot[1] == df.GROUND
        xs.append(foot[0])
    steps = [a - b for a, b in zip(xs, xs[1:])]
    assert all(s > 0 for s in steps)
    assert max(steps) - min(steps) < 1e-6
    assert math.isclose(xs[0] - xs[-1], df.STRIDE, rel_tol=0.01)
    assert math.isclose(df.CYCLE, df.STRIDE / df.STANCE)


def test_a_lifted_foot_clears_the_ground_and_lands_where_it_started():
    for k in range(1, 20):
        u = df.STANCE + (1 - df.STANCE) * k / 20
        foot, planted = df.foot_at(u)
        assert not planted and foot[1] < df.GROUND
    landed, planted = df.foot_at(0)
    assert planted and math.isclose(landed[0], df.HIP[0] + df.STRIDE / 2)


def test_the_data_module_matches_the_drawing(built):
    sprite, js = built
    vb = symbols(sprite)["roadrunner"].get("viewBox")
    m = re.search(r'"viewBox": \[([^\]]+)\]', js)
    assert m and [float(v) for v in m.group(1).split(",")] == [float(v) for v in vb.split()]
    assert f'"cycle": {round(df.CYCLE, 3)}' in js
    # and the committed files are what the script makes now
    assert (df.ROOT / "assets" / "fauna.svg").read_text(encoding="utf-8") == df.build()[0]
    assert (df.ROOT / "js" / "fauna-data.js").read_text(encoding="utf-8") == js


# --- the rest of the neighbourhood (assets/critters.svg) ----------------------

@pytest.fixture(scope="module")
def critters() -> tuple[ET.Element, str]:
    svg, js = df.build_critters()
    return ET.fromstring(svg), js


def opacity(style: str | None, frame: int) -> float:
    """Evaluate a pose group's opacity rule the way CSS does, for a --frame."""
    m = re.search(r"opacity:(.*)", style or "")
    if not m:
        return 1.0
    expr = re.sub(r"var\(--frame,\d+\)", str(frame), m.group(1)).replace("calc(", "(")
    return min(1.0, max(0.0, eval(expr, {"max": max, "clamp": lambda lo, v, hi: min(hi, max(lo, v))})))  # noqa: S307


def shown(symbol: ET.Element, frame: int) -> int:
    """How many paths are visible at this frame (every ancestor group open)."""
    def walk(el: ET.Element, on: bool) -> int:
        on = on and opacity(el.get("style"), frame) > 0 if el.tag == f"{SVG_NS}g" else on
        return (1 if el.tag == f"{SVG_NS}path" and on else 0) + sum(walk(ch, on) for ch in el)
    return walk(symbol, True)


FRAMES = {"javelina": range(8), "rattlesnake": range(10), "scorpion": range(8), "toad": (0, 1, 6, 7, 8)}


def test_every_pose_shows_and_nothing_else_does(critters):
    sprite, _ = critters
    syms = symbols(sprite)
    assert set(syms) == set(FRAMES)
    for name, frames in FRAMES.items():
        for f in frames:
            assert shown(syms[name], f) > 0, (name, f)
        assert shown(syms[name], 11) == 0, name              # an undefined frame is empty, not a pile-up
    for name in ("javelina", "rattlesnake", "scorpion"):     # every step of a gait draws the same parts...
        counts = [shown(syms[name], f) for f in range(df.RUN_FRAMES)]
        assert max(counts) - min(counts) <= (1 if name == "rattlesnake" else 0), (name, counts)  # ...bar a tongue


def test_javelina_knees_and_hocks_bend_the_right_way():
    for k in range(12):
        foot, _ = df.gait_foot(k / 12, df.J_SHOULDER[0], df.J_GROUND, df.J_STRIDE, df.J_STANCE, df.J_LIFT)
        knee = df.solve_leg(df.J_SHOULDER, foot, df.J_UPPER, df.J_LOWER, prefer=(1.0, 0.0))
        assert math.isclose(math.dist(df.J_SHOULDER, knee), df.J_UPPER, abs_tol=1e-6)
        assert math.isclose(math.dist(knee, foot), df.J_LOWER, abs_tol=1e-6)
        assert knee[0] > min(df.J_SHOULDER[0], foot[0]) - 1e-6    # a foreleg's knee comes forward
        hind, _ = df.gait_foot(k / 12, df.J_HIP[0], df.J_GROUND, df.J_STRIDE, df.J_STANCE, df.J_LIFT)
        hock = df.solve_leg(df.J_HIP, hind, df.J_UPPER, df.J_LOWER, prefer=(-1.0, 0.0))
        assert math.isclose(math.dist(hock, hind), df.J_LOWER, abs_tol=1e-6)
        assert hock[0] < max(df.J_HIP[0], hind[0]) + 1e-6         # a hock points back


def test_scorpion_knees_stand_up():
    for hip, rest in zip(df.K_HIPS, df.K_FEET):
        for k in range(12):
            foot, _ = df.gait_foot(k / 12, hip[0] + rest, df.K_GROUND, df.K_STRIDE, df.K_STANCE, df.K_LIFT)
            knee = df.solve_leg(hip, foot, df.K_FEMUR, df.K_TIBIA, prefer=(0.0, -1.0))
            # on the upper side of the hip-to-foot line (y points down)
            cross = (foot[0] - hip[0]) * (knee[1] - hip[1]) - (foot[1] - hip[1]) * (knee[0] - hip[0])
            assert cross * (1 if foot[0] >= hip[0] else -1) < 0, (hip, k)


def test_critters_stay_small(critters):
    sprite, _ = critters
    assert len(ET.tostring(sprite)) < 90_000


def test_critter_data_matches_the_drawing(critters):
    sprite, js = critters
    for name, s in symbols(sprite).items():
        w, h = s.get("viewBox").split()[2:]
        assert re.search(rf'"{name}": {{"viewBox": \[0, 0, {w}, {h}\]', js), name
    assert f'"cycle": {df.S_WAVE:g}' in js                   # the snake: one wave per wavelength run
    assert (df.ROOT / "assets" / "critters.svg").read_text(encoding="utf-8") == df.build_critters()[0]
    assert (df.ROOT / "js" / "critter-data.js").read_text(encoding="utf-8") == js

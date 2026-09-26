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


def test_the_page_uses_the_same_viewboxes(built):
    # index.html repeats each symbol's viewBox on its outer <svg>, so the
    # drawing keeps its proportions; a regenerated sprite must not drift.
    sprite, _ = built
    html = open(df.ROOT / "index.html", encoding="utf-8").read()
    for s in sprite.iter(f"{SVG_NS}symbol"):
        used = re.findall(rf'viewBox="([^"]+)"[^>]*><use href="assets/fauna.svg#{s.get("id")}"', html)
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
    outer = rr.find(f"{SVG_NS}g")
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

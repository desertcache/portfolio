"""Tests for draw_desert.py: the sprite is well-formed and animates.

Run: python3 -m pytest scripts/test_draw_desert.py
"""

from __future__ import annotations

import math
import re
import xml.etree.ElementTree as ET

import pytest

import draw_desert as dd

SVG_NS = "{http://www.w3.org/2000/svg}"
EXPECTED = {"saguaro", "saguaro-young", "prickly-pear", "barrel", "ocotillo", "palo-verde", "sedona",
            "agave", "poppies", "lupine", "globemallow", "brittlebush", "penstemon", "hedgehog", "grass"}


@pytest.fixture(scope="module")
def sprite() -> ET.Element:
    return ET.fromstring(dd.build())


def test_every_drawing_is_a_symbol_with_a_viewbox(sprite):
    symbols = {s.get("id"): s for s in sprite.iter(f"{SVG_NS}symbol")}
    assert set(symbols) == EXPECTED
    for sid, s in symbols.items():
        w, h = map(float, s.get("viewBox").split()[2:])
        assert w > 0 and h > 0, sid


def test_the_page_uses_the_same_viewboxes(sprite):
    # index.html repeats each symbol's viewBox on its outer <svg>, so the
    # drawing keeps its proportions; a regenerated sprite must not drift.
    html = open(dd.OUT.parent.parent / "index.html", encoding="utf-8").read()
    for s in sprite.iter(f"{SVG_NS}symbol"):
        used = re.findall(rf'viewBox="([^"]+)"[^>]*><use href="assets/desert.svg#{s.get("id")}"', html)
        assert used, f"{s.get('id')} is not on the page"
        assert set(used) == {s.get("viewBox")}, s.get("id")


def test_stroked_paths_draw_on_and_fills_bloom(sprite):
    for p in sprite.iter(f"{SVG_NS}path"):
        style = p.get("style")
        assert "var(--draw" in style, style
        if "stroke-dasharray" in style:
            assert p.get("pathLength") == "1"


def test_no_broken_numbers_in_any_path(sprite):
    for p in sprite.iter(f"{SVG_NS}path"):
        d = p.get("d")
        assert d and "nan" not in d.lower() and "inf" not in d.lower()
        assert re.fullmatch(r"[MLCQAZahlmqz0-9 .\-]+", d), d[:80]


def test_sprite_stays_small():
    # It ships on every homepage view: 100 KB raw is under 30 KB gzipped.
    # Past that, thin the finest detail first (see n0 and the stroke petals).
    assert len(dd.build().encode()) < 100_000


def test_ellipse_is_closed_and_centred():
    d = dd.ellipse_d(10, 20, 5, 3, 0)
    assert d.startswith("M5 20") and d.endswith("Z")
    d = dd.ellipse_d(0, 0, 4, 2, 90)
    start = re.match(r"M(-?[\d.]+) (-?[\d.]+)", d).groups()
    assert math.isclose(float(start[0]), 0, abs_tol=.05) and math.isclose(float(start[1]), -4, abs_tol=.05)


def test_smooth_passes_through_its_points():
    d = dd.smooth([(0, 0), (10, 5), (20, 0)])
    assert d.startswith("M0 0") and "10 5" in d and d.endswith("20 0")

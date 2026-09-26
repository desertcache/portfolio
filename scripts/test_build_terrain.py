"""Tests for build_terrain.py. Offline: every case runs on synthetic terrain.

Run: python3 -m pytest scripts/test_build_terrain.py
"""

from __future__ import annotations

import math
import re

import numpy as np
import pytest

import build_terrain as bt

Z = 14
X0, Y0 = 3093, 6568  # 6 x 7 tiles: lon -112.04..-111.91, lat 33.44..33.57, Camelback inside


def synthetic_mosaic(elev_fn, tiles_x: int = 6, tiles_y: int = 7) -> bt.Mosaic:
    """A mosaic whose pixel centres hold elev_fn(lat, lon)."""
    rows, cols = tiles_y * bt.TILE_PX, tiles_x * bt.TILE_PX
    r, c = np.mgrid[0:rows, 0:cols].astype(np.float64)
    lon = bt.tile_x_to_lon(X0 + (c + 0.5) / bt.TILE_PX, Z)
    lat = bt.tile_y_to_lat(Y0 + (r + 0.5) / bt.TILE_PX, Z)
    return bt.Mosaic(z=Z, x0=X0, y0=Y0, elev=elev_fn(lat, lon))


def mosaic_extent(m: bt.Mosaic, inset_px: float = 2.0) -> bt.Extent:
    rows, cols = m.elev.shape
    return bt.Extent(
        west=float(bt.tile_x_to_lon(m.x0 + inset_px / bt.TILE_PX, Z)),
        east=float(bt.tile_x_to_lon(m.x0 + (cols - inset_px) / bt.TILE_PX, Z)),
        north=float(bt.tile_y_to_lat(m.y0 + inset_px / bt.TILE_PX, Z)),
        south=float(bt.tile_y_to_lat(m.y0 + (rows - inset_px) / bt.TILE_PX, Z)),
    )


# --- geometry ---------------------------------------------------------------


def test_tile_math_hits_known_values_and_round_trips():
    assert float(bt.lon_to_tile_x(-180.0, Z)) == 0.0
    assert float(bt.lon_to_tile_x(0.0, 1)) == 1.0
    assert float(bt.lat_to_tile_y(0.0, Z)) == pytest.approx(2 ** (Z - 1))
    assert math.floor(float(bt.lon_to_tile_x(-111.9616, 14))) == 3096
    lats = np.array([-60.0, -10.0, 0.0, 33.5147, 70.0])
    assert np.allclose(bt.tile_y_to_lat(bt.lat_to_tile_y(lats, Z), Z), lats)
    lons = np.array([-179.0, -111.9616, 0.0, 45.5])
    assert np.allclose(bt.tile_x_to_lon(bt.lon_to_tile_x(lons, Z), Z), lons)


def test_metres_per_degree_at_phoenix():
    m_lat, m_lon = bt.metres_per_degree(33.5)
    assert m_lat == pytest.approx(110_913, abs=5)
    assert m_lon == pytest.approx(92_923, abs=20)


def test_tiles_covering_includes_every_corner():
    ext = bt.EXTENT
    xs, ys = bt.tiles_covering(ext, Z)
    for lat in (ext.south, ext.north):
        for lon in (ext.west, ext.east):
            assert math.floor(float(bt.lon_to_tile_x(lon, Z))) in xs
            assert math.floor(float(bt.lat_to_tile_y(lat, Z))) in ys


def test_extent_rejects_inverted_or_polar_boxes():
    with pytest.raises(ValueError):
        bt.Extent(west=1.0, south=0.0, east=0.0, north=1.0)
    with pytest.raises(ValueError):
        bt.Extent(west=0.0, south=1.0, east=1.0, north=0.5)
    with pytest.raises(ValueError):
        bt.Extent(west=0.0, south=80.0, east=1.0, north=89.0)


def test_extent_union_and_contains():
    a = bt.Extent(west=0.0, south=0.0, east=1.0, north=1.0)
    b = bt.Extent(west=0.5, south=-1.0, east=2.0, north=0.5)
    u = a.union(b)
    assert (u.west, u.south, u.east, u.north) == (0.0, -1.0, 2.0, 1.0)
    assert a.contains(0.5, 0.5) and not a.contains(1.5, 0.5)


def test_every_named_peak_is_inside_the_heightmap():
    for peak in bt.PEAKS:
        assert bt.EXTENT.contains(peak.lat, peak.lon), peak.name


# --- rasters ----------------------------------------------------------------


def test_decode_terrarium():
    rgb = np.array([[[128, 0, 0], [129, 44, 128]]], dtype=np.uint8)
    assert bt.decode_terrarium(rgb).tolist() == [[0.0, 300.5]]


def test_bilinear_is_exact_on_planes():
    y, x = np.mgrid[0:20, 0:30].astype(np.float64)
    plane = 2.0 * x - 3.0 * y + 7.0
    rng = np.random.default_rng(1)
    qx, qy = rng.uniform(0, 29, 200), rng.uniform(0, 19, 200)
    assert np.allclose(bt.bilinear(plane, qx, qy), 2.0 * qx - 3.0 * qy + 7.0)


def test_bilinear_clamps_outside_the_array():
    a = np.arange(12, dtype=np.float64).reshape(3, 4)
    assert bt.bilinear(a, np.array([-5.0]), np.array([-5.0]))[0] == a[0, 0]
    assert bt.bilinear(a, np.array([99.0]), np.array([99.0]))[0] == a[-1, -1]


def test_gaussian_blur_keeps_constants_and_mass():
    flat = np.full((16, 16), 42.0)
    assert np.allclose(bt.gaussian_blur(flat, 2.0), flat)
    spike = np.zeros((41, 41))
    spike[20, 20] = 1.0
    blurred = bt.gaussian_blur(spike, 2.0)
    assert blurred.sum() == pytest.approx(1.0)
    assert blurred[20, 20] < 0.1 and blurred.argmax() == 20 * 41 + 20
    assert np.array_equal(bt.gaussian_blur(spike, 0.0), spike)


def test_resample_puts_every_texel_where_it_belongs():
    # Elevation linear in longitude, and linear in Mercator row: both survive
    # bilinear exactly, so any geography mistake shows up as a mismatch.
    m = synthetic_mosaic(lambda lat, lon: 1000.0 * lon + 5.0 * bt.lat_to_tile_y(lat, Z))
    ext = mosaic_extent(m)
    rows, cols = 50, 70
    got = bt.resample(m, ext, rows, cols)
    lon = ext.west + (np.arange(cols) + 0.5) * (ext.east - ext.west) / cols
    lat = ext.north - (np.arange(rows) + 0.5) * (ext.north - ext.south) / rows
    want = 1000.0 * lon[None, :] + 5.0 * bt.lat_to_tile_y(lat, Z)[:, None]
    assert np.allclose(got, want, atol=1e-6)


def test_grid_shape_follows_texel_size():
    rows, cols = bt.grid_shape(bt.EXTENT, 16.0)
    m_lat, m_lon = bt.metres_per_degree(bt.EXTENT.center_lat)
    assert cols == round((bt.EXTENT.east - bt.EXTENT.west) * m_lon / 16.0)
    assert rows == round((bt.EXTENT.north - bt.EXTENT.south) * m_lat / 16.0)
    with pytest.raises(ValueError):
        bt.grid_shape(bt.EXTENT, 1e6)


def test_pack_round_trips_within_half_a_step():
    rng = np.random.default_rng(7)
    h = rng.uniform(335.0, 815.0, (40, 40))
    lo, hi = 334.0, 816.0
    back = bt.unpack_heightmap(bt.pack_heightmap(h, lo, hi), lo, hi)
    assert np.abs(back - h).max() <= (hi - lo) / bt.LEVELS / 2 + 1e-9


def test_pack_decodes_linearly_from_two_channels():
    lo, hi = 0.0, float(bt.LEVELS)            # one metre per level
    h = np.arange(bt.LEVELS + 1, dtype=np.float64)
    rgb = bt.pack_heightmap(h, lo, hi)
    assert (rgb[..., 1] & 15).max() == 0 and rgb[..., 2].max() == 0
    v = rgb[..., 0].astype(np.int64) * 16 + rgb[..., 1] // 16
    assert np.array_equal(v, h.astype(np.int64))


def test_pack_rejects_bad_ranges():
    with pytest.raises(ValueError):
        bt.pack_heightmap(np.zeros((2, 2)), 5.0, 5.0)
    with pytest.raises(ValueError):
        bt.pack_heightmap(np.full((2, 2), 900.0), 300.0, 800.0)


# --- peaks and the skyline --------------------------------------------------


def hill(lat0: float, lon0: float, height_m: float, sigma_m: float = 300.0, base_m: float = 350.0):
    m_lat, m_lon = bt.metres_per_degree(lat0)

    def fn(lat, lon):
        d2 = ((lat - lat0) * m_lat) ** 2 + ((lon - lon0) * m_lon) ** 2
        return base_m + height_m * np.exp(-d2 / (2 * sigma_m**2))

    return fn


def test_check_peaks_accepts_a_true_summit_and_rejects_a_wrong_one():
    lat0, lon0 = 33.5147, -111.9616
    m = synthetic_mosaic(hill(lat0, lon0, 475.0))
    ext = mosaic_extent(m)
    good = bt.Peak("Test", lat0, lon0, round(825 / 0.3048), 500)
    [(peak, dem)] = bt.check_peaks(m, [good], ext)
    assert dem == pytest.approx(825.0, abs=1.0)
    wrong = bt.Peak("Test", lat0 + 0.01, lon0, round(825 / 0.3048), 500)  # 1.1 km off
    with pytest.raises(ValueError, match="Wrong coordinates"):
        bt.check_peaks(m, [wrong], ext)
    outside = bt.Peak("Far", 40.0, lon0, 1000, 500)
    with pytest.raises(ValueError, match="outside"):
        bt.check_peaks(m, [outside], ext)


def test_skyline_sees_a_hill_where_it_is():
    # A 500 m hill due north of the eye, 4 km out, on flat 350 m ground.
    m_lat, _ = bt.metres_per_degree(33.5)
    eye_lat, eye_lon = 33.47, -111.9616
    m = synthetic_mosaic(hill(eye_lat + 4000 / m_lat, eye_lon, 500.0, sigma_m=200.0))
    vp = bt.Viewpoint(eye_lat, eye_lon, eye_m=2.0, az_from=-30.0, az_to=30.0, max_dist_m=6000.0)
    angles = bt.skyline_angles(m, vp, columns=61)
    north = angles[30]
    drop = 4000**2 / (2 * bt.EARTH_RADIUS_M) * (1 - bt.REFRACTION)
    assert north == pytest.approx(math.atan2(500.0 - drop - 2.0, 4000.0), abs=2e-3)
    assert angles.argmax() == 30
    assert angles[0] < 0.0 and angles[-1] < 0.0   # flat ground sits below eye level


def test_simplify_keeps_the_ends_and_the_corner():
    x = np.linspace(0.0, 10.0, 101)
    y = np.where(x < 5.0, 0.0, x - 5.0)            # a flat run, then a ramp
    pts = bt.simplify(np.column_stack([x, y]), tolerance=0.01)
    assert pts[0].tolist() == [0.0, 0.0] and pts[-1].tolist() == [10.0, 5.0]
    assert len(pts) == 3 and pts[1][0] == pytest.approx(5.0)


def test_skyline_svg_is_a_closed_path_inside_its_viewbox():
    angles = np.radians(np.array([0.0, 1.0, 3.0, 2.0, 0.5, 0.0]))
    svg = bt.skyline_svg(angles, fov_deg=60.0, width=600, exaggeration=2.0)
    w, h = map(int, re.search(r'viewBox="0 0 (\d+) (\d+)"', svg).groups())
    d = re.search(r' d="([^"]+)"', svg).group(1)
    assert w == 600 and d.startswith(f"M0 {h}") and d.endswith(f"L600 {h}Z")
    nums = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", d)]
    xs, ys = nums[0::2], nums[1::2]
    assert min(xs) >= 0 and max(xs) <= w and min(ys) >= 0 and max(ys) <= h
    # 3 degrees at 2x on a 60-degree, 600 px panorama: 3 * 10 px/deg * 2 = 60 px of rise
    assert h - min(ys) == pytest.approx(60.0, abs=1.0)


def test_meta_module_carries_the_extent_and_peaks():
    js = bt.render_meta_js(bt.EXTENT, 679, 662, 335, 815, "assets/terrain/heightmap.webp")
    assert "export const TERRAIN = {" in js
    assert f"west: {bt.EXTENT.west}," in js and f"north: {bt.EXTENT.north}," in js
    assert "cols: 662," in js and "rows: 679," in js and "elevHiM: 815," in js
    for peak in bt.PEAKS:
        assert f'name: "{peak.name}"' in js and f"feet: {peak.feet}" in js

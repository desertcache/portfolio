"""Build the homepage's terrain from open elevation data.

The hero draws real contour lines around Camelback Mountain, and the footer
carries the real skyline. This script makes everything those need, so the
site itself never fetches map data or runs Python:

  assets/terrain/heightmap.webp  elevations on a lat/lon grid, packed 12-bit
                                 into the red and green channels
  js/terrain-data.js             what js/topo.js needs to read that image:
                                 extent, elevation range, the named peaks
  assets/skyline.svg             the footer silhouette: the real skyline,
                                 looking north across the city at Camelback

Source: AWS Terrain Tiles (Mapzen "terrarium" PNGs; free, no key). Over
Arizona they carry USGS 3DEP elevation, which is public domain.

Mental model, for whoever edits this next:
  * Web maps cut the world into 256 px tiles in Web Mercator; zoom z has 2^z
    tiles across. Terrarium tiles store metres in the colour channels:
    metres = R*256 + G + B/256 - 32768.
  * Mercator stretches latitude, which would make "the pixel under the
    cursor" awkward to turn back into coordinates. So the tiles are stitched,
    then resampled onto a plain lat/lon grid: in the output, latitude and
    longitude are both linear in pixels, and the JS side is one lerp.
  * A browser gives WebGL 8 bits per channel, and 8 bits of elevation (about
    2 m steps here) terrace the contours. 12 bits (about 0.12 m) do not.
    The value is split across two channels in a way that decodes linearly:
    v = 16*R + G/16. See pack_heightmap().

Design notes:
  * Every function except fetch_tile() and main() is pure numpy, so
    test_build_terrain.py runs offline against synthetic terrain.
  * check_peaks() refuses to build if the published summits and the data
    disagree by more than 15 m. It caught a wrong coordinate once already.

Usage:
  python3 scripts/build_terrain.py             # fetch missing tiles, rebuild
  python3 scripts/build_terrain.py --offline   # cached tiles only

Tiles are cached in ~/.cache/portfolio-terrain (change with --cache). Behind
a TLS-intercepting proxy, point SSL_CERT_FILE at the proxy's CA bundle.
Needs numpy and Pillow (with WebP, which standard wheels include).
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
TEXTURE_PATH = REPO_ROOT / "assets" / "terrain" / "heightmap.webp"
META_PATH = REPO_ROOT / "js" / "terrain-data.js"
SKYLINE_PATH = REPO_ROOT / "assets" / "skyline.svg"
DEFAULT_CACHE = Path.home() / ".cache" / "portfolio-terrain"

TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
TILE_PX = 256
ZOOM = 14                      # about 8 m pixels at this latitude
MERCATOR_EQUATOR_M = 40_075_016.686
EARTH_RADIUS_M = 6_371_008.8
REFRACTION = 0.13              # standard terrestrial refraction, for the skyline
LEVELS = 4095                  # 12-bit heightmap
PEAK_TOLERANCE_M = 15.0


@dataclass(frozen=True)
class Extent:
    """A lat/lon box in degrees."""

    west: float
    south: float
    east: float
    north: float

    def __post_init__(self) -> None:
        if not -180.0 <= self.west < self.east <= 180.0:
            raise ValueError(f"bad longitudes: west={self.west}, east={self.east}")
        if not -85.0 < self.south < self.north < 85.0:
            raise ValueError(f"bad latitudes: south={self.south}, north={self.north}")

    @property
    def center_lat(self) -> float:
        return (self.south + self.north) / 2

    def contains(self, lat: float, lon: float) -> bool:
        return self.south <= lat <= self.north and self.west <= lon <= self.east

    def union(self, other: Extent) -> Extent:
        return Extent(
            west=min(self.west, other.west),
            south=min(self.south, other.south),
            east=max(self.east, other.east),
            north=max(self.north, other.north),
        )


@dataclass(frozen=True)
class Peak:
    name: str         # as the legend prints it
    lat: float
    lon: float
    feet: int         # published summit elevation, NAVD 88
    radius_m: float   # how near the pointer must be for the legend to name it


@dataclass(frozen=True)
class Viewpoint:
    lat: float
    lon: float
    eye_m: float      # eye height above the ground
    az_from: float    # degrees clockwise from north
    az_to: float
    max_dist_m: float


# The heightmap's footprint: Camelback plus the ground every hero shape
# js/arizona.js frames (a 1920 px desktop to a tall phone) can show, with room
# for the slow drift. Wider screens zoom in rather than run off the edge.
# About 10.6 x 10.9 km; area is what the file size pays for.
EXTENT = Extent(west=-112.042, south=33.459, east=-111.928, north=33.557)

# Published summits: Wikipedia, citing USGS GNIS and NGS (elevations NAVD 88).
PEAKS = (
    Peak("Camelback Mtn", 33.514724, -111.961604, 2706, 1400),
    Peak("Piestewa Peak", 33.547332, -112.020989, 2610, 1100),
    Peak("Mummy Mtn", 33.543654, -111.960424, 2260, 1000),
)
FOCUS = PEAKS[0]  # the hero frames Camelback's summit

# The footer skyline: looking north from about 8 km south-southwest of
# Camelback, eye 60 m up (a rooftop; at street level, canal banks and freeway
# walls crowd the foreground). From here Camelback reads as the kneeling camel
# it is named for, head left and hump right, with the Phoenix Mountains and
# Piestewa Peak to the west. Standing near a butte instead lets the butte
# swallow the view, which is why this isn't Papago Park.
VIEWPOINT = Viewpoint(lat=33.445, lon=-111.980, eye_m=60.0, az_from=-40.0, az_to=25.0, max_dist_m=18_000.0)
SKYLINE_WIDTH = 1600
SKYLINE_EXAGGERATION = 2.0


# ---------------------------------------------------------------------------
# Geometry


def metres_per_degree(lat: float) -> tuple[float, float]:
    """(north-south, east-west) metres per degree at `lat`, WGS84 ellipsoid."""
    p = math.radians(lat)
    m_lat = 111132.92 - 559.82 * math.cos(2 * p) + 1.175 * math.cos(4 * p) - 0.0023 * math.cos(6 * p)
    m_lon = 111412.84 * math.cos(p) - 93.5 * math.cos(3 * p) + 0.118 * math.cos(5 * p)
    return m_lat, m_lon


def lon_to_tile_x(lon: np.ndarray | float, z: int) -> np.ndarray:
    """Longitude to fractional tile column at zoom z."""
    return (np.asarray(lon, dtype=np.float64) + 180.0) / 360.0 * 2**z


def lat_to_tile_y(lat: np.ndarray | float, z: int) -> np.ndarray:
    """Latitude to fractional tile row at zoom z (row 0 is the north edge)."""
    p = np.radians(np.asarray(lat, dtype=np.float64))
    return (1.0 - np.arcsinh(np.tan(p)) / math.pi) / 2.0 * 2**z


def tile_x_to_lon(x: np.ndarray | float, z: int) -> np.ndarray:
    return np.asarray(x, dtype=np.float64) / 2**z * 360.0 - 180.0


def tile_y_to_lat(y: np.ndarray | float, z: int) -> np.ndarray:
    return np.degrees(np.arctan(np.sinh(math.pi * (1.0 - 2.0 * np.asarray(y, dtype=np.float64) / 2**z))))


def mercator_pixel_m(z: int, lat: float) -> float:
    """Ground width of one tile pixel at zoom z and latitude lat."""
    return MERCATOR_EQUATOR_M * math.cos(math.radians(lat)) / (TILE_PX * 2**z)


def tiles_covering(ext: Extent, z: int) -> tuple[range, range]:
    """Tile columns and rows that together cover `ext`."""
    x0 = math.floor(float(lon_to_tile_x(ext.west, z)))
    x1 = math.floor(float(lon_to_tile_x(ext.east, z)))
    y0 = math.floor(float(lat_to_tile_y(ext.north, z)))
    y1 = math.floor(float(lat_to_tile_y(ext.south, z)))
    return range(x0, x1 + 1), range(y0, y1 + 1)


def fan_extent(vp: Viewpoint) -> Extent:
    """Bounding box of the wedge of ground the skyline looks across."""
    m_lat, m_lon = metres_per_degree(vp.lat)
    az = np.radians(np.linspace(vp.az_from, vp.az_to, 64))
    lats = np.concatenate([[vp.lat], vp.lat + np.cos(az) * vp.max_dist_m / m_lat])
    lons = np.concatenate([[vp.lon], vp.lon + np.sin(az) * vp.max_dist_m / m_lon])
    return Extent(west=float(lons.min()), south=float(lats.min()), east=float(lons.max()), north=float(lats.max()))


# ---------------------------------------------------------------------------
# Rasters


def decode_terrarium(rgb: np.ndarray) -> np.ndarray:
    """Terrarium tile pixels (..., 3) uint8 to metres."""
    c = rgb.astype(np.float64)
    return c[..., 0] * 256.0 + c[..., 1] + c[..., 2] / 256.0 - 32768.0


def bilinear(a: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Sample a 2D array at fractional pixel-centre coordinates, clamped to the edges."""
    h, w = a.shape
    x = np.clip(x, 0.0, w - 1.0)
    y = np.clip(y, 0.0, h - 1.0)
    x0 = np.minimum(np.floor(x).astype(np.intp), w - 2)
    y0 = np.minimum(np.floor(y).astype(np.intp), h - 2)
    fx = x - x0
    fy = y - y0
    top = a[y0, x0] * (1 - fx) + a[y0, x0 + 1] * fx
    bottom = a[y0 + 1, x0] * (1 - fx) + a[y0 + 1, x0 + 1] * fx
    return top * (1 - fy) + bottom * fy


def gaussian_blur(a: np.ndarray, sigma: float) -> np.ndarray:
    """Separable Gaussian blur with edge padding. sigma is in pixels."""
    out = a.astype(np.float64)
    if sigma <= 0:
        return out.copy()
    r = max(1, math.ceil(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    p = np.pad(out, r, mode="edge")
    h, w = out.shape
    p = sum(k[i] * p[:, i:i + w] for i in range(2 * r + 1))       # along rows
    return sum(k[i] * p[i:i + h, :] for i in range(2 * r + 1))    # along columns


@dataclass(frozen=True)
class Mosaic:
    """Stitched tiles: elev[row, col] in metres, row 0 at the north edge."""

    z: int
    x0: int     # tile column of the left edge
    y0: int     # tile row of the top edge
    elev: np.ndarray

    def sample(self, lat: np.ndarray | float, lon: np.ndarray | float) -> np.ndarray:
        """Bilinear elevation at lat/lon. Pixel k's centre sits at k + 0.5."""
        px = lon_to_tile_x(lon, self.z) * TILE_PX - self.x0 * TILE_PX - 0.5
        py = lat_to_tile_y(lat, self.z) * TILE_PX - self.y0 * TILE_PX - 0.5
        return bilinear(self.elev, px, py)

    def blurred(self, sigma_px: float) -> Mosaic:
        return Mosaic(self.z, self.x0, self.y0, gaussian_blur(self.elev, sigma_px))


def grid_shape(ext: Extent, texel_m: float) -> tuple[int, int]:
    """(rows, cols) of a lat/lon grid over `ext` with texels about texel_m across."""
    m_lat, m_lon = metres_per_degree(ext.center_lat)
    cols = round((ext.east - ext.west) * m_lon / texel_m)
    rows = round((ext.north - ext.south) * m_lat / texel_m)
    if rows < 2 or cols < 2:
        raise ValueError(f"texel_m={texel_m} leaves fewer than 2 texels across the extent")
    return rows, cols


def resample(m: Mosaic, ext: Extent, rows: int, cols: int) -> np.ndarray:
    """Mosaic to a north-up lat/lon grid; texel centres sit at half steps."""
    lon = ext.west + (np.arange(cols) + 0.5) * (ext.east - ext.west) / cols
    lat = ext.north - (np.arange(rows) + 0.5) * (ext.north - ext.south) / rows
    lat_g, lon_g = np.meshgrid(lat, lon, indexing="ij")
    return m.sample(lat_g, lon_g)


def pack_heightmap(h: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Metres to RGB bytes: a 12-bit value v, top 8 bits in R, low 4 in G's top nibble.

    That split decodes linearly, v = 16*R + G/16, so neither the shader nor
    the JS readout ever needs floor(). B is unused (and compresses to nothing).
    """
    if hi <= lo:
        raise ValueError(f"empty elevation range: lo={lo}, hi={hi}")
    v = np.rint((h - lo) / (hi - lo) * LEVELS)
    if v.min() < 0 or v.max() > LEVELS:
        raise ValueError("elevations fall outside [lo, hi]")
    v = v.astype(np.uint16)
    rgb = np.zeros(h.shape + (3,), dtype=np.uint8)
    rgb[..., 0] = v >> 4
    rgb[..., 1] = (v & 15) << 4
    return rgb


def unpack_heightmap(rgb: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Inverse of pack_heightmap (what js/arizona.js does per pixel)."""
    v = rgb[..., 0].astype(np.float64) * 16 + rgb[..., 1].astype(np.float64) / 16
    return lo + v / LEVELS * (hi - lo)


# ---------------------------------------------------------------------------
# Checks and the skyline


def summit_elevation(m: Mosaic, peak: Peak, search_m: float = 150.0) -> float:
    """Highest DEM point within search_m of a published summit.

    Published coordinates are often a pixel or two off the data's summit, so
    this looks around rather than sampling one point.
    """
    m_lat, m_lon = metres_per_degree(peak.lat)
    offsets = np.arange(-search_m, search_m + 1e-9, 5.0)
    dn, de = np.meshgrid(offsets, offsets, indexing="ij")
    inside = dn**2 + de**2 <= search_m**2
    return float(m.sample(peak.lat + dn[inside] / m_lat, peak.lon + de[inside] / m_lon).max())


def check_peaks(m: Mosaic, peaks: Sequence[Peak], ext: Extent) -> list[tuple[Peak, float]]:
    """Every named peak must be on the map and agree with the data."""
    found = []
    for p in peaks:
        if not ext.contains(p.lat, p.lon):
            raise ValueError(f"{p.name} ({p.lat}, {p.lon}) is outside the heightmap extent")
        dem = summit_elevation(m, p)
        published = p.feet * 0.3048
        if abs(dem - published) > PEAK_TOLERANCE_M:
            raise ValueError(
                f"{p.name}: data says {dem:.0f} m near the published summit, "
                f"which is {published:.0f} m. Wrong coordinates?"
            )
        found.append((p, dem))
    return found


def skyline_angles(m: Mosaic, vp: Viewpoint, columns: int, step_m: float = 15.0, min_dist_m: float = 60.0) -> np.ndarray:
    """Elevation angle (radians) of the skyline in each azimuth column.

    For every direction, walk out from the eye and keep the steepest angle up
    to the ground, after dropping far terrain for the Earth's curvature (less
    what refraction gives back). That maximum is the skyline.
    """
    m_lat, m_lon = metres_per_degree(vp.lat)
    eye = float(m.sample(vp.lat, vp.lon)) + vp.eye_m
    az = np.radians(np.linspace(vp.az_from, vp.az_to, columns))
    d = np.arange(min_dist_m, vp.max_dist_m, step_m)
    lat = vp.lat + np.outer(np.cos(az), d) / m_lat
    lon = vp.lon + np.outer(np.sin(az), d) / m_lon
    drop = d * d / (2 * EARTH_RADIUS_M) * (1 - REFRACTION)
    return np.arctan2(m.sample(lat, lon) - drop - eye, d).max(axis=1)


def simplify(points: np.ndarray, tolerance: float) -> np.ndarray:
    """Ramer-Douglas-Peucker: keep only points that move the line by more than `tolerance`."""
    keep = np.zeros(len(points), dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        chord = points[j] - points[i]
        rel = points[i + 1:j] - points[i]
        dist = np.abs(chord[0] * rel[:, 1] - chord[1] * rel[:, 0]) / max(float(np.hypot(*chord)), 1e-12)
        k = int(np.argmax(dist))
        if dist[k] > tolerance:
            k += i + 1
            keep[k] = True
            stack += [(i, k), (k, j)]
    return points[keep]


def _num(v: float) -> str:
    return f"{v:.1f}".rstrip("0").rstrip(".")


def skyline_svg(angles: np.ndarray, fov_deg: float, width: int, exaggeration: float) -> str:
    """A filled silhouette for use as a CSS mask: ink below the skyline, nothing above.

    Horizontal and vertical share one scale (pixels per radian), so at
    exaggeration 1 the mountains have their true proportions.
    """
    px_per_rad = width / math.radians(fov_deg)
    rise = (angles - angles.min()) * px_per_rad * exaggeration
    height = math.ceil(float(rise.max())) + 1
    x = np.linspace(0.0, width, angles.size)
    pts = simplify(np.column_stack([x, height - rise]), tolerance=0.35)
    path = f"M0 {height}" + "".join(f"L{_num(px)} {_num(py)}" for px, py in pts) + f"L{width} {height}Z"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'preserveAspectRatio="none"><path d="{path}"/></svg>\n'
    )


def render_meta_js(ext: Extent, rows: int, cols: int, lo: float, hi: float, texture_url: str) -> str:
    """The ES module js/topo.js imports. Plain data; its type lives in js/arizona.js."""
    m_lat, m_lon = metres_per_degree(ext.center_lat)
    peaks = "\n".join(
        f"    {{ name: {json.dumps(p.name)}, lat: {p.lat}, lon: {p.lon}, feet: {p.feet}, radiusM: {p.radius_m:g} }},"
        for p in PEAKS
    )
    return f"""// @ts-check
// Generated by scripts/build_terrain.py. Do not edit by hand: change the
// script and re-run it, which rewrites this file and the heightmap together.
// Elevation: USGS 3DEP via AWS Terrain Tiles. Summits: USGS GNIS / NGS, NAVD 88.

/** @type {{import('./arizona.js').Terrain}} */
export const TERRAIN = {{
  src: {json.dumps(texture_url)},
  cols: {cols},
  rows: {rows},
  west: {ext.west},
  south: {ext.south},
  east: {ext.east},
  north: {ext.north},
  elevLoM: {lo:g},
  elevHiM: {hi:g},
  mPerDegLat: {m_lat:.1f},
  mPerDegLon: {m_lon:.1f},
  focus: {{ lat: {FOCUS.lat}, lon: {FOCUS.lon} }},
  peaks: [
{peaks}
  ],
}};
"""


# ---------------------------------------------------------------------------
# I/O


def fetch_tile(z: int, x: int, y: int, cache: Path, offline: bool, retries: int = 4) -> np.ndarray:
    """One terrarium tile as metres, from the cache or the network."""
    path = cache / str(z) / str(x) / f"{y}.png"
    if not path.exists():
        if offline:
            raise FileNotFoundError(f"{path} is not cached, and --offline is set")
        url = TILE_URL.format(z=z, x=x, y=y)
        for attempt in range(retries):
            try:
                with urllib.request.urlopen(url, timeout=30) as response:
                    data = response.read()
                break
            except urllib.error.HTTPError as e:
                if e.code < 500 or attempt == retries - 1:
                    raise RuntimeError(f"{url}: HTTP {e.code}") from e
            except (urllib.error.URLError, TimeoutError) as e:
                if attempt == retries - 1:
                    raise RuntimeError(f"{url}: {e}") from e
            time.sleep(2**attempt)
        path.parent.mkdir(parents=True, exist_ok=True)
        part = path.with_suffix(".part")
        part.write_bytes(data)
        part.replace(path)  # atomic: a killed run never leaves half a tile
    with Image.open(path) as im:
        return decode_terrarium(np.asarray(im.convert("RGB")))


def build_mosaic(ext: Extent, z: int, cache: Path, offline: bool) -> Mosaic:
    xs, ys = tiles_covering(ext, z)
    print(f"tiles: {len(xs)} x {len(ys)} at z{z}")
    rows = [np.hstack([fetch_tile(z, x, y, cache, offline) for x in xs]) for y in ys]
    return Mosaic(z=z, x0=xs.start, y0=ys.start, elev=np.vstack(rows))


def write_webp(rgb: np.ndarray, path: Path) -> int:
    """Lossless WebP, read back to prove every byte survived."""
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgb, "RGB").save(path, "WEBP", lossless=True, quality=100, method=6)
    with Image.open(path) as im:
        if not np.array_equal(np.asarray(im.convert("RGB")), rgb):
            raise RuntimeError(f"{path} did not round-trip losslessly")
    return path.stat().st_size


def parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Rebuild the hero heightmap, its metadata, and the footer skyline.")
    p.add_argument("--cache", type=Path, default=DEFAULT_CACHE, help=f"tile cache (default {DEFAULT_CACHE})")
    p.add_argument("--offline", action="store_true", help="use cached tiles only")
    p.add_argument("--texel-m", type=float, default=16.0, help="heightmap texel size in metres (default 16)")
    p.add_argument("--smooth-m", type=float, default=12.0, help="Gaussian smoothing sigma in metres (default 12)")
    return p.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        mosaic = build_mosaic(EXTENT.union(fan_extent(VIEWPOINT)), ZOOM, args.cache, args.offline)
        for peak, dem in check_peaks(mosaic, PEAKS, EXTENT):
            print(f"  {peak.name:14s} published {peak.feet} ft, data {dem / 0.3048:.0f} ft")

        # Smooth first: it calms survey noise in the flats (which would
        # otherwise draw as fuzz at 20 ft contours) and anti-aliases the resample.
        src_m = mercator_pixel_m(ZOOM, EXTENT.center_lat)
        sigma_px = max(args.smooth_m, 0.5 * args.texel_m) / src_m
        rows, cols = grid_shape(EXTENT, args.texel_m)
        heights = resample(mosaic.blurred(sigma_px), EXTENT, rows, cols)
        lo, hi = math.floor(heights.min()) - 1, math.ceil(heights.max()) + 1
        size = write_webp(pack_heightmap(heights, lo, hi), TEXTURE_PATH)
        texture_url = TEXTURE_PATH.relative_to(REPO_ROOT).as_posix()
        META_PATH.write_text(render_meta_js(EXTENT, rows, cols, lo, hi, texture_url), encoding="utf-8")

        angles = skyline_angles(mosaic, VIEWPOINT, columns=SKYLINE_WIDTH)
        svg = skyline_svg(angles, VIEWPOINT.az_to - VIEWPOINT.az_from, SKYLINE_WIDTH, SKYLINE_EXAGGERATION)
        SKYLINE_PATH.write_text(svg, encoding="utf-8")
    except (RuntimeError, ValueError, FileNotFoundError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1

    print(f"heightmap: {cols} x {rows} texels, {lo}..{hi} m, {size / 1024:.0f} KB -> {TEXTURE_PATH.relative_to(REPO_ROOT)}")
    print(f"metadata -> {META_PATH.relative_to(REPO_ROOT)}")
    print(f"skyline: {len(svg) / 1024:.1f} KB -> {SKYLINE_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

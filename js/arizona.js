// @ts-check
/**
 * Pure helpers for the Arizona pieces: the hero's real-terrain map (which
 * patch of ground the canvas frames, what's under the pointer) and the
 * Phoenix clock. No DOM, no globals: tests/arizona.test.mjs runs them in Node.
 *
 * A new file rather than more of lib.js on purpose. A visitor can hold a
 * cached lib.js from before these existed, and one missing named export stops
 * a module from loading at all (editions.js exists for the same reason).
 *
 * Coordinates: the heightmap is a plain lat/lon grid, north up (see
 * scripts/build_terrain.py), so everything here is a lerp. Over 11 km the
 * earth is flat enough that metres-per-degree taken at the map's centre is
 * off by well under a metre at the edges.
 */

/**
 * @typedef {object} Peak
 * @property {string} name     as the legend prints it
 * @property {number} lat
 * @property {number} lon
 * @property {number} feet     published summit elevation (NAVD 88)
 * @property {number} radiusM  pointer within this distance: the legend names it
 */

/**
 * What scripts/build_terrain.py writes to js/terrain-data.js.
 * @typedef {object} Terrain
 * @property {string} src          heightmap image, relative to the page
 * @property {number} cols         texels across
 * @property {number} rows         texels down
 * @property {number} west         edges, degrees
 * @property {number} south
 * @property {number} east
 * @property {number} north
 * @property {number} elevLoM      metres at packed value 0
 * @property {number} elevHiM      metres at packed value LEVELS
 * @property {number} mPerDegLat
 * @property {number} mPerDegLon
 * @property {{ lat: number, lon: number }} focus  what the hero frames
 * @property {Peak[]} peaks
 */

/**
 * Which ground the canvas shows: its top-left corner and the zoom.
 * @typedef {object} View
 * @property {number} lat   latitude at the canvas's top-left corner
 * @property {number} lon   longitude at the canvas's top-left corner
 * @property {number} mpp   metres per CSS pixel
 */

/** Packed heightmap values run 0..LEVELS (12 bits). */
export const LEVELS = 4095;
/** Metres the view wanders on its slow loop. */
export const DRIFT_M = 110;
const FEET_PER_M = 1 / 0.3048;
/** Within this of a published summit, the readout shows the survey value. */
const SUMMIT_SNAP_M = 90;

const clamp = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => Math.min(hi, Math.max(lo, v));

/**
 * Frame the focus peak for a canvas of w x h CSS px.
 *
 * Wide screens get more detail per pixel and the peak up and to the right,
 * clear of the headline and the legend card; on a phone it sits high and
 * near the middle, behind the headline rather than the paragraph under it.
 * `t` (seconds) moves the view on a slow Lissajous loop so the map breathes
 * without going anywhere. The framing is kept and the zoom gives: where the
 * map would run out on some side, the view zooms in until it doesn't.
 * @param {Terrain} terrain
 * @param {number} w canvas width, CSS px
 * @param {number} h canvas height, CSS px
 * @param {number} [t] seconds of drift
 * @returns {View}
 */
export function viewFor(terrain, w, h, t = 0) {
  const width = Math.max(1, w);
  const height = Math.max(1, h);
  const wide = clamp((width / height - 0.6) / 1.0, 0, 1); // 0 = phone, 1 = desktop
  const fx = (0.6 + 0.12 * wide) * width;                   // where the peak sits, CSS px
  const fy = Math.min((0.42 - 0.06 * wide) * height, 330);

  // metres from the peak to each edge of the map, less the drift's reach
  const focusE = (terrain.focus.lon - terrain.west) * terrain.mPerDegLon;
  const focusS = (terrain.north - terrain.focus.lat) * terrain.mPerDegLat;
  const mapW = (terrain.east - terrain.west) * terrain.mPerDegLon;
  const mapH = (terrain.north - terrain.south) * terrain.mPerDegLat;
  const reachE = DRIFT_M;
  const reachN = DRIFT_M * 0.7;
  const mpp = Math.min(
    clamp(9500 / width, 5.2, 8.5),
    (focusE - reachE) / fx,
    (mapW - focusE - reachE) / (width - fx),
    (focusS - reachN) / fy,
    (mapH - focusS - reachN) / (height - fy),
  );

  const driftE = reachE * Math.sin((t * 2 * Math.PI) / 71);
  const driftN = reachN * Math.sin((t * 2 * Math.PI) / 97); // both 0 at t = 0: the framing as designed
  // top-left corner, in metres east of the west edge and south of the north
  // edge; the clamp is a backstop, the zoom above already keeps it inside
  const left = clamp(focusE - fx * mpp + driftE, 0, mapW - width * mpp);
  const top = clamp(focusS - fy * mpp - driftN, 0, mapH - height * mpp);
  return {
    lat: terrain.north - top / terrain.mPerDegLat,
    lon: terrain.west + left / terrain.mPerDegLon,
    mpp,
  };
}

/**
 * Coordinates under a point of the canvas.
 * @param {Terrain} terrain
 * @param {View} view
 * @param {number} x CSS px from the canvas's left edge
 * @param {number} y CSS px from its top edge
 * @returns {{ lat: number, lon: number }}
 */
export function pointAt(terrain, view, x, y) {
  return {
    lat: view.lat - (y * view.mpp) / terrain.mPerDegLat,
    lon: view.lon + (x * view.mpp) / terrain.mPerDegLon,
  };
}

/**
 * The shader's side of the same mapping: heightmap uv at buffer pixel (0, 0),
 * and per buffer pixel. WebGL counts rows from the bottom and the heightmap
 * from the top (north), hence the flip in v.
 * @param {Terrain} terrain
 * @param {View} view
 * @param {number} bufH drawing-buffer height, px
 * @param {number} px   buffer px per CSS px
 * @returns {{ u0: number, v0: number, du: number, dv: number }}
 */
export function shaderUV(terrain, view, bufH, px) {
  const spanLon = terrain.east - terrain.west;
  const spanLat = terrain.north - terrain.south;
  const du = view.mpp / (px * terrain.mPerDegLon * spanLon);
  const kv = view.mpp / (px * terrain.mPerDegLat * spanLat);
  const uLeft = (view.lon - terrain.west) / spanLon;
  const vTop = (terrain.north - view.lat) / spanLat;
  return { u0: uLeft, v0: vTop + bufH * kv, du, dv: -kv };
}

/**
 * Unpack the heightmap's red and green bytes (RGBA, as getImageData returns
 * them) into 12-bit values: v = 16*R + G/16, the inverse of pack_heightmap().
 * @param {Uint8ClampedArray | Uint8Array} rgba
 * @param {number} cols
 * @param {number} rows
 * @returns {Uint16Array}
 */
export function decodeHeightmap(rgba, cols, rows) {
  const n = cols * rows;
  if (rgba.length < n * 4) throw new RangeError(`heightmap has ${rgba.length / 4} pixels, expected ${n}`);
  const out = new Uint16Array(n);
  for (let i = 0; i < n; i++) out[i] = rgba[i * 4] * 16 + (rgba[i * 4 + 1] >> 4);
  return out;
}

/**
 * Terrain elevation in metres at lat/lon: bilinear between texel centres,
 * exactly what the shader draws. Null off the map.
 * @param {Terrain} terrain
 * @param {Uint16Array} grid from decodeHeightmap
 * @param {number} lat
 * @param {number} lon
 * @returns {number | null}
 */
export function elevationAt(terrain, grid, lat, lon) {
  const u = (lon - terrain.west) / (terrain.east - terrain.west);
  const v = (terrain.north - lat) / (terrain.north - terrain.south);
  if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return null;
  const { cols, rows } = terrain;
  const x = clamp(u * cols - 0.5, 0, cols - 1);
  const y = clamp(v * rows - 0.5, 0, rows - 1);
  const x0 = Math.min(Math.floor(x), cols - 2);
  const y0 = Math.min(Math.floor(y), rows - 2);
  const fx = x - x0;
  const fy = y - y0;
  const at = (/** @type {number} */ i, /** @type {number} */ j) => grid[j * cols + i];
  const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
  const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
  const value = top * (1 - fy) + bottom * fy;
  return terrain.elevLoM + (value / LEVELS) * (terrain.elevHiM - terrain.elevLoM);
}

/**
 * The named peak the pointer is on, if any: nearest relative to each peak's
 * own radius, so a small peak isn't shadowed by a big neighbour's.
 * @param {Terrain} terrain
 * @param {number} lat
 * @param {number} lon
 * @returns {{ peak: Peak, distM: number } | null}
 */
export function peakAt(terrain, lat, lon) {
  /** @type {{ peak: Peak, distM: number } | null} */
  let best = null;
  let bestRatio = 1;
  for (const peak of terrain.peaks) {
    const dn = (lat - peak.lat) * terrain.mPerDegLat;
    const de = (lon - peak.lon) * terrain.mPerDegLon;
    const distM = Math.hypot(dn, de);
    const ratio = distM / peak.radiusM;
    if (ratio <= bestRatio) {
      best = { peak, distM };
      bestRatio = ratio;
    }
  }
  return best;
}

/**
 * @param {number} lat
 * @param {number} lon
 * @returns {{ lat: string, lon: string }}
 */
export function formatLatLon(lat, lon) {
  return {
    lat: `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? 'S' : 'N'}`,
    lon: `${Math.abs(lon).toFixed(4)}° ${lon < 0 ? 'W' : 'E'}`,
  };
}

/**
 * @param {number} feet
 * @returns {string} e.g. "2,706 ft"
 */
export function formatFeet(feet) {
  return `${Math.round(feet).toLocaleString('en-US')} ft`;
}

/**
 * Everything the legend shows for one spot. Elevation is the terrain's,
 * except within a few dozen metres of a named summit, where it is the
 * surveyed spot height: the data is smoothed, so a summit reads 20-odd
 * feet low, and a local would notice.
 * @param {Terrain} terrain
 * @param {Uint16Array | null} grid null while the heightmap is loading
 * @param {number} lat
 * @param {number} lon
 * @returns {{ lat: string, lon: string, elev: string | null, place: string | null }}
 */
export function readout(terrain, grid, lat, lon) {
  const hit = peakAt(terrain, lat, lon);
  let feet = null;
  if (hit && hit.distM <= SUMMIT_SNAP_M) feet = hit.peak.feet;
  else if (grid) {
    const m = elevationAt(terrain, grid, lat, lon);
    if (m !== null) feet = m * FEET_PER_M;
  }
  return {
    ...formatLatLon(lat, lon),
    elev: feet === null ? null : formatFeet(feet),
    place: hit ? hit.peak.name : null,
  };
}

const SCALES = [
  { label: '500 ft', m: 152.4 },
  { label: '1,000 ft', m: 304.8 },
  { label: '¼ mi', m: 402.336 },
  { label: '½ mi', m: 804.672 },
  { label: '1 mi', m: 1609.344 },
  { label: '2 mi', m: 3218.688 },
];

/**
 * A true scale bar for the current zoom: the round distance whose bar comes
 * out nearest `targetPx` long.
 * @param {number} mpp metres per CSS px
 * @param {number} [targetPx]
 * @returns {{ label: string, px: number }}
 */
export function scaleBar(mpp, targetPx = 60) {
  let best = SCALES[0];
  for (const s of SCALES) {
    if (Math.abs(s.m / mpp - targetPx) < Math.abs(best.m / mpp - targetPx)) best = s;
  }
  return { label: best.label, px: Math.round(best.m / mpp) };
}

const PHOENIX_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Phoenix',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * Wall-clock time in Phoenix. Arizona skips daylight saving, so this is UTC-7
 * all year, but the time zone database knows that and we don't hard-code it.
 * @param {Date} date
 * @returns {string} e.g. "3:42 PM"
 */
export function phoenixTime(date) {
  return PHOENIX_TIME.format(date);
}

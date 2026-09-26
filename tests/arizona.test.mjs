// Unit tests for js/arizona.js: the hero map's geometry and readouts, and the
// Phoenix clock. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVELS, DRIFT_M, viewFor, pointAt, shaderUV, decodeHeightmap, elevationAt, peakAt,
  formatLatLon, formatFeet, readout, scaleBar, phoenixTime,
} from '../js/arizona.js';
import { TERRAIN } from '../js/terrain-data.js';

/** @typedef {import('../js/arizona.js').Terrain} Terrain */

/** A 4 x 3 texel map with a plane for terrain: value = 100*i + 10*j. */
/** @type {Terrain} */
const TINY = {
  src: 'x.webp', cols: 4, rows: 3,
  west: -112, east: -111.996, south: 33.497, north: 33.5,
  elevLoM: 300, elevHiM: 300 + LEVELS, // one metre per packed step
  mPerDegLat: 110913.5, mPerDegLon: 92914,
  focus: { lat: 33.4985, lon: -111.998 },
  peaks: [
    { name: 'Big', lat: 33.4985, lon: -111.998, feet: 2706, radiusM: 150 },
    { name: 'Small', lat: 33.4972, lon: -111.9962, feet: 1500, radiusM: 30 },
  ],
};
const TINY_GRID = Uint16Array.from({ length: 12 }, (_, k) => 100 * (k % 4) + 10 * Math.floor(k / 4));

/** @param {number} a @param {number} b @param {number} [eps] */
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('viewFor puts the focus up and to the right on a desktop hero', () => {
  const view = viewFor(TERRAIN, 1440, 900);
  const at = pointAt(TERRAIN, view, 0.72 * 1440, 0.36 * 900);
  near(at.lat, TERRAIN.focus.lat, 1e-9);
  near(at.lon, TERRAIN.focus.lon, 1e-9);
  near(view.mpp, 9500 / 1440, 1e-12);
});

test('viewFor never shows ground the heightmap lacks, at any size or moment', () => {
  const sizes = [[320, 900], [390, 1300], [768, 1024], [1024, 768], [1440, 900], [1920, 1000], [2560, 1000], [3840, 1100], [1200, 630]];
  for (const [w, h] of sizes) {
    for (let t = 0; t < 200; t += 7.3) {
      const view = viewFor(TERRAIN, w, h, t);
      for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) {
        const p = pointAt(TERRAIN, view, x, y);
        assert.ok(p.lon >= TERRAIN.west - 1e-9 && p.lon <= TERRAIN.east + 1e-9, `${w}x${h} t=${t} lon ${p.lon}`);
        assert.ok(p.lat >= TERRAIN.south - 1e-9 && p.lat <= TERRAIN.north + 1e-9, `${w}x${h} t=${t} lat ${p.lat}`);
      }
    }
  }
});

test('a screen too big for the map zooms in and keeps the framing', () => {
  for (const [w, h, fx, fy] of [[3840, 1100, 0.72, 0.3], [390, 1250, 0.6, 330 / 1250]]) {
    const view = viewFor(TERRAIN, w, h);
    const rule = Math.min(8.5, Math.max(5.2, 9500 / w)); // what this width gets when the map is big enough
    assert.ok(view.mpp < rule, `${w}x${h} zoomed to ${view.mpp}`);
    const at = pointAt(TERRAIN, view, fx * w, fy * h);
    near(at.lat, TERRAIN.focus.lat, 1e-9);
    near(at.lon, TERRAIN.focus.lon, 1e-9);
  }
});

test('the drift wanders, but only about DRIFT_M', () => {
  const a = viewFor(TERRAIN, 1440, 900, 0);
  let farthest = 0;
  for (let t = 0; t < 400; t += 0.5) {
    const b = viewFor(TERRAIN, 1440, 900, t);
    const d = Math.hypot((b.lat - a.lat) * TERRAIN.mPerDegLat, (b.lon - a.lon) * TERRAIN.mPerDegLon);
    farthest = Math.max(farthest, d);
  }
  assert.ok(farthest > DRIFT_M, `moved ${farthest} m`);
  assert.ok(farthest < DRIFT_M * 2.5, `moved ${farthest} m`);
});

test('the shader and the pointer agree on what is where', () => {
  const view = viewFor(TERRAIN, 1440, 900, 12);
  const px = 1.5;
  const bufH = Math.round(900 * px);
  const s = shaderUV(TERRAIN, view, bufH, px);
  for (const [bx, by] of [[0.5, 0.5], [700.5, 300.5], [2159.5, 1349.5]]) {
    // gl_FragCoord is bottom-up; CSS px are top-down
    const p = pointAt(TERRAIN, view, bx / px, (bufH - by) / px);
    const u = (p.lon - TERRAIN.west) / (TERRAIN.east - TERRAIN.west);
    const v = (TERRAIN.north - p.lat) / (TERRAIN.north - TERRAIN.south);
    near(s.u0 + bx * s.du, u, 1e-12);
    near(s.v0 + by * s.dv, v, 1e-12);
  }
});

test('decodeHeightmap reads 16*R + G/16 from RGBA bytes', () => {
  const rgba = new Uint8ClampedArray([255, 240, 0, 255, 0, 16, 0, 255, 20, 128, 0, 255]);
  assert.deepEqual([...decodeHeightmap(rgba, 3, 1)], [LEVELS, 1, 328]);
  assert.throws(() => decodeHeightmap(rgba, 4, 1), RangeError);
});

test('elevationAt is bilinear between texel centres and null off the map', () => {
  // texel (i, j) centre: lon = west + (i + .5) * 0.001, lat = north - (j + .5) * 0.001
  const lon = (/** @type {number} */ i) => TINY.west + (i + 0.5) * 0.001;
  const lat = (/** @type {number} */ j) => TINY.north - (j + 0.5) * 0.001;
  near(/** @type {number} */ (elevationAt(TINY, TINY_GRID, lat(0), lon(0))), 300, 1e-6);
  near(/** @type {number} */ (elevationAt(TINY, TINY_GRID, lat(2), lon(3))), 300 + 320, 1e-6);
  near(/** @type {number} */ (elevationAt(TINY, TINY_GRID, lat(1.5), lon(1.25))), 300 + 125 + 15, 1e-6);
  assert.equal(elevationAt(TINY, TINY_GRID, TINY.north + 0.001, lon(1)), null);
  assert.equal(elevationAt(TINY, TINY_GRID, lat(1), TINY.east + 0.001), null);
});

test('peakAt picks the peak you are relatively nearest, or none', () => {
  assert.equal(peakAt(TINY, 33.4985, -111.998)?.peak.name, 'Big');
  // 20 m from Small (radius 30) and ~160 m from Big (radius 150): Small wins
  const nearSmall = peakAt(TINY, 33.4972 + 20 / 110913.5, -111.9962);
  assert.equal(nearSmall?.peak.name, 'Small');
  near(/** @type {number} */ (nearSmall?.distM), 20, 1e-6);
  assert.equal(peakAt(TINY, 33.4999, -111.9999), null);
});

test('readout snaps to the surveyed height at a summit, uses the terrain elsewhere', () => {
  const summit = readout(TINY, TINY_GRID, 33.4985, -111.998);
  assert.deepEqual(summit, { lat: '33.4985° N', lon: '111.9980° W', elev: '2,706 ft', place: 'Big' });
  const flat = readout(TINY, TINY_GRID, TINY.north - 0.0005, TINY.west + 0.0005);
  assert.equal(flat.elev, formatFeet(300 / 0.3048));
  assert.equal(flat.place, null);
  assert.equal(readout(TINY, null, TINY.north - 0.0005, TINY.west + 0.0005).elev, null);
  assert.equal(readout(TINY, null, 33.4985, -111.998).elev, '2,706 ft');
});

test('formatLatLon and formatFeet', () => {
  assert.deepEqual(formatLatLon(33.514724, -111.961604), { lat: '33.5147° N', lon: '111.9616° W' });
  assert.deepEqual(formatLatLon(-1.5, 2.25), { lat: '1.5000° S', lon: '2.2500° E' });
  assert.equal(formatFeet(2706), '2,706 ft');
  assert.equal(formatFeet(999.6), '1,000 ft');
});

test('scaleBar picks the round distance nearest 60 px', () => {
  assert.deepEqual(scaleBar(9500 / 1440), { label: '¼ mi', px: 61 });
  assert.deepEqual(scaleBar(4.14), { label: '1,000 ft', px: 74 });
  assert.deepEqual(scaleBar(8.5), { label: '¼ mi', px: 47 });
  assert.deepEqual(scaleBar(30), { label: '1 mi', px: 54 });
});

test('phoenixTime is UTC-7 in July and in January (no daylight saving)', () => {
  const clean = (/** @type {string} */ s) => s.replace(/\s/g, ' ');
  assert.equal(clean(phoenixTime(new Date('2026-07-01T19:05:00Z'))), '12:05 PM');
  assert.equal(clean(phoenixTime(new Date('2026-01-15T19:05:00Z'))), '12:05 PM');
  assert.equal(clean(phoenixTime(new Date('2026-03-09T06:30:00Z'))), '11:30 PM');
});

test('the generated terrain data is self-consistent', () => {
  assert.ok(TERRAIN.cols > 1 && TERRAIN.rows > 1 && TERRAIN.elevHiM > TERRAIN.elevLoM);
  const inside = (/** @type {{ lat: number, lon: number }} */ p) =>
    p.lat > TERRAIN.south && p.lat < TERRAIN.north && p.lon > TERRAIN.west && p.lon < TERRAIN.east;
  assert.ok(inside(TERRAIN.focus));
  for (const peak of TERRAIN.peaks) assert.ok(inside(peak), peak.name);
  assert.equal(TERRAIN.peaks[0].lat, TERRAIN.focus.lat);
});

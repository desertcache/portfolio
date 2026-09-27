// Unit tests for js/gaits.js: the scorpion's dart and the toad's hop.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dart, hop } from '../js/gaits.js';
import { CRITTERS } from '../js/critter-data.js';

const DART = { gap: 30, lag: 0.07 };
const HOP = { length: 40, height: 14, duration: 380, pause: 140 };

/** Run a gait for `ms` at 60 Hz. @param {(t: number) => void} step @param {number} ms @param {number} [t0] */
const frames = (step, ms, t0 = 0) => { for (let t = t0; t <= t0 + ms; t += 1000 / 60) step(t); };

test('a scorpion holds still through small moves', () => {
  /** @type {import('../js/gaits.js').DartState} */
  const s = { x: 100, dest: null };
  assert.equal(dart(s, 125, 1 / 60, DART), s);
  assert.equal(dart(s, 75, 1 / 60, DART), s);
});

test('...then dashes, and stops dead on its spot', () => {
  /** @type {import('../js/gaits.js').DartState} */
  let s = { x: 100, dest: null };
  s = dart(s, 200, 1 / 60, DART);
  assert.ok(s.dest === 200 && s.x > 100 && s.x < 200);
  for (let i = 0; i < 60; i++) s = dart(s, 200, 1 / 60, DART);
  assert.deepEqual(s, { x: 200, dest: null });
});

test('a dash is committed: it stops where it aimed though the spot moves on', () => {
  /** @type {import('../js/gaits.js').DartState} */
  let s = { x: 0, dest: null };
  let target = 40;
  const stops = [];
  for (let i = 0; i < 240; i++) {        // the spot moves steadily, 2 px a frame
    target += 2;
    const was = s.dest;
    s = dart(s, target, 1 / 60, DART);
    if (was !== null && s.dest === null) stops.push(s.x);
  }
  assert.ok(stops.length >= 5, `stopped ${stops.length} times`);
  for (let i = 1; i < stops.length; i++) assert.ok(stops[i] - stops[i - 1] > DART.gap, 'each dash covers more than the gap');
});

test('a toad sits until its spot is half a hop away', () => {
  const s = { x: 0, hop: null, restUntil: 0 };
  const r = hop(s, 19, 1000, HOP);
  assert.equal(r.pose, 'sit');
  assert.equal(r.x, 0);
  assert.equal(r.state, s);
});

test('a hop is whole: it lands where it aimed, rising and falling, even if the spot stops moving', () => {
  let s = { x: 0, hop: null, restUntil: 0 };
  let peak = 0;
  const poses = new Set();
  frames((t) => {
    const r = hop(s, 25, t, HOP);   // the spot is only 25 away: a short hop, then sit
    s = r.state;
    peak = Math.min(peak, r.y);
    poses.add(r.pose);
  }, 1000);
  assert.equal(s.x, 25);
  assert.ok(peak < -HOP.height * 0.9, `peak ${peak}`);
  assert.deepEqual([...poses].sort(), ['crouch', 'leap', 'sit']);
});

test('a far spot takes several hops, never longer than one hop each', () => {
  let s = { x: 0, hop: null, restUntil: 0 };
  let last = 0;
  let longest = 0;
  frames((t) => {
    const r = hop(s, 170, t, HOP);
    if (!r.state.hop && r.state.x !== last) { longest = Math.max(longest, Math.abs(r.state.x - last)); last = r.state.x; }
    s = r.state;
  }, 3000);
  assert.ok(Math.abs(s.x - 170) < HOP.length / 2, `ended at ${s.x}`);
  assert.ok(longest <= HOP.length + 1e-9, `longest hop ${longest}`);
});

test('it moves only in the air: at take-off it is still on its spot', () => {
  const s = { x: 0, hop: null, restUntil: 0 };
  const r = hop(s, 100, 5000, HOP);
  assert.equal(r.x, 0);
  assert.equal(r.y, 0);
  assert.equal(r.pose, 'crouch');
  assert.ok(r.state.hop);
});

test('the toad data has what a hop needs', () => {
  const t = CRITTERS.toad;
  assert.ok((t.hop ?? 0) > 0 && (t.hopHeight ?? 0) > 0);
  assert.equal(typeof t.crouch, 'number');
  assert.equal(typeof t.leap, 'number');
});

// Mesa Lander's levels: where the mesas stand, how wide the pad is, how much fuel and
// wind each level has, and how a landing is scored. Pure: no DOM, no Math.random, so
// level n is the same level every time (and Node can test it).
import { makeTerrain, LIMITS, BODY } from './physics.js';
import { mulberry32, hashSeed } from './rng.js';

export const SCREEN = { W: 800, H: 500, floor: 440 };
export const LANDERS = 3; // landers per game
export const LEAN = 0.16; // how much a mesa's sides lean out (matches makeTerrain)

/** Pad width in px: 120 on level 1, 9 px narrower each level, never under 54. */
export const padWidthFor = (n) => Math.max(54, 120 - 9 * (n - 1));
/** Tank size as a share of a full tank: full for levels 1 to 3, then 5% tighter a level, never under 65%. */
export const tankFor = (n) => (n <= 3 ? 1 : Math.max(0.65, 1 - 0.05 * (n - 3)));
/** Strongest gust in px/s^2: none before level 3, then as many as the level number, up to 8. */
export const windFor = (n) => (n < 3 ? 0 : Math.min(8, n));

const reachOf = (m) => m.topW / 2 + (SCREEN.floor - m.top) * LEAN;

/**
 * The description of level n: the mesas (the first one carries the pad), the pad width,
 * where the lander starts, the size of the tank and the wind.
 * @param {number} n
 */
export function levelSpec(n) {
  const rng = mulberry32(hashSeed(n, 0x4d45));
  const padWidth = padWidthFor(n);
  /** @type {{ cx: number, top: number, topW: number }[]} */
  const mesas = [];
  let start;
  if (n === 1) {
    // Level 1 is hand-placed: a wide pad on a broad mesa, the start in easy reach.
    mesas.push({ cx: 560, top: 312, topW: padWidth + 74 });
    mesas.push({ cx: 160, top: 368, topW: 130 });
    mesas.push({ cx: 372, top: 402, topW: 58 });
    start = { x: 330, y: 112, vx: 10, vy: 0, a: 0 };
  } else {
    const side = rng() < 0.5 ? -1 : 1; // which side of the screen the pad is on
    const padCx = Math.round(side > 0 ? 470 + rng() * 190 : 140 + rng() * 190);
    const padTop = Math.round(272 + rng() * 78);
    const margin = 14 + rng() * 24;
    mesas.push({ cx: padCx, top: padTop, topW: Math.round(padWidth + margin * 2) });
    const want = 3 + (n >= 4 ? 1 : 0) + (n >= 7 ? 1 : 0);
    for (let tries = 0; mesas.length < want && tries < 300; tries++) {
      const topW = Math.round(50 + rng() * 80);
      const cx = Math.round(60 + rng() * 680);
      // A tall mesa is only allowed well away from the pad; the ones near it stay low.
      const tall = Math.abs(cx - padCx) > 270 && rng() < 0.5;
      const top = Math.round(tall ? 195 + rng() * (padTop - 215) : padTop + 28 + rng() * (402 - padTop - 28));
      const m = { cx, top, topW };
      if (mesas.every((o) => Math.abs(o.cx - m.cx) >= reachOf(o) + reachOf(m) + 16)) mesas.push(m);
    }
    // The start is 220 to 380 px from the pad, on the other side of the screen.
    const dist = 220 + rng() * 160;
    start = {
      x: Math.round(Math.max(60, Math.min(740, padCx - side * dist))),
      y: Math.round(100 + rng() * 40),
      vx: Math.round((rng() - 0.5) * 40),
      vy: Math.round(rng() * 16),
      a: +((rng() - 0.5) * 0.2).toFixed(2),
    };
  }
  return {
    n,
    padWidth,
    mesas,
    start,
    tank: tankFor(n),
    wind: { amp: windFor(n), w1: 0.45 + rng() * 0.25, p1: rng() * 6.283, w2: 1.1 + rng() * 0.6, p2: rng() * 6.283 },
    sceneSeed: hashSeed(n, 0x5ce9),
  };
}

/** The spec plus its terrain (a heightfield with the pad on the first mesa). */
export function buildLevel(n) {
  const spec = levelSpec(n);
  const terrain = makeTerrain({
    W: SCREEN.W, H: SCREEN.H, floor: SCREEN.floor, mesas: spec.mesas, padOn: 0, padWidth: spec.padWidth,
  });
  return { ...spec, terrain };
}

/** The sideways push at a given tick of a level, in px/s^2 (positive blows to the right). */
export function windAt(spec, tick) {
  const w = spec.wind;
  if (!w.amp) return 0;
  const t = tick / 60;
  const ramp = Math.min(1, t / 2); // gusts ease in over the first two seconds
  return ramp * w.amp * (0.65 * Math.sin(t * w.w1 + w.p1) + 0.35 * Math.sin(t * w.w2 + w.p2));
}

/**
 * Points for a landing: base (100 per level) + softness + accuracy + fuel left. Softness
 * and accuracy and fuel are each worth up to 100.
 * @param {number} level
 * @param {{ fuel: number, impact: { vy: number, dx: number } }} lander the lander as it touched down
 * @param {{ pad: { width: number } }} terrain
 */
export function scoreLanding(level, lander, terrain) {
  const im = lander.impact;
  const soft = Math.round(100 * (1 - Math.min(1, Math.max(0, im.vy) / LIMITS.vy)));
  // Both feet must be on the pad, so the centre may sit this far from the middle of it.
  const room = Math.max(1, terrain.pad.width / 2 + 1 - BODY.foot.x);
  const aim = Math.round(100 * (1 - Math.min(1, Math.abs(im.dx) / room)));
  const fuel = Math.round(100 * Math.max(0, Math.min(1, lander.fuel)));
  const base = 100 * level;
  return { base, soft, aim, fuel, total: base + soft + aim + fuel };
}

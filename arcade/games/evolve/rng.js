// Seeded randomness for UFO Evolution. Everything the simulation draws on
// (initial weights, selection, crossover, mutation, the pipe course) comes
// from these streams, so a given seed replays the exact same evolution.

// mulberry32: tiny, fast, good enough statistical quality for a GA.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mix two integers into one well-spread 32-bit seed (per-generation courses).
export function hashSeed(a, b) {
  let h = (Math.imul(a >>> 0, 0x9e3779b1) ^ Math.imul((b >>> 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// Standard normal sample (Box-Muller) from a uniform stream.
export function gaussian(rng) {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

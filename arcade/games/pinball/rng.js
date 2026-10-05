// Seeded randomness for Dust Devil Pinball (mulberry32). With ?debug=1 every
// random choice (the skill-shot lane, a nudge's sideways kick, a ball search)
// comes from one seeded stream, so a scripted run replays exactly.
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

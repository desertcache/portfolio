// @ts-check
/**
 * The roadrunner's whereabouts and legs, as pure functions; js/roadrunner.js
 * puts them on the page. Distances are CSS pixels, times are seconds.
 *
 * The model: a runner's position is a function of scroll (so scrolling back
 * brings it back), it chases that position with a little lag (so a flick of
 * the wheel reads as a dash, not a teleport), and its legs are stepped by
 * the distance it covers (so planted feet stay planted).
 */

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * @typedef {object} RunWindow
 * @property {number} from  scroll offset (px) where the run starts
 * @property {number} to    ...and where it ends
 */

/**
 * The stretch of scrolling over which a runner crosses its trail: from when
 * the trail's top edge rises into view at the bottom of the screen (or the
 * top of the page, if it is on screen already) to when that edge reaches the
 * top of the screen (or the end of the page, if the page runs out first).
 * @param {number} trailTop  the trail's top edge, px from the top of the page
 * @param {number} viewportH
 * @param {number} maxScroll  how far the page can scroll
 * @returns {RunWindow}
 */
export function runWindow(trailTop, viewportH, maxScroll) {
  const from = clamp(trailTop - viewportH, 0, Math.max(0, maxScroll));
  const to = Math.max(from + 1, Math.min(trailTop, maxScroll));
  return { from, to };
}

/**
 * How far through its window the page is scrolled, 0..1.
 * @param {number} scrollY
 * @param {RunWindow} win
 */
export function runProgress(scrollY, win) {
  return clamp((scrollY - win.from) / (win.to - win.from), 0, 1);
}

/**
 * Where the runner should be (its hip), px from the trail's left edge.
 * `from` and `to` are fractions of the trail's width; below 0 or above 1 is
 * off the edge, which is how a runner enters and leaves.
 * @param {number} progress  0..1
 * @param {number} from
 * @param {number} to
 * @param {number} trailW
 */
export function runnerX(progress, from, to, trailW) {
  return (from + (to - from) * progress) * trailW;
}

/**
 * Chase a target, frame-rate independently: every `tau` seconds the gap
 * shrinks to 1/e of itself, however the time is sliced into frames.
 * @param {number} x
 * @param {number} target
 * @param {number} dt  seconds since the last frame
 * @param {number} tau  time constant, seconds (0 = no lag)
 */
export function follow(x, target, dt, tau) {
  if (tau <= 0) return target;
  return target + (x - target) * Math.exp(-dt / tau);
}

/**
 * Advance the stride. The legs keep pace with the ground, one stride per
 * `cyclePx` covered, so a planted foot doesn't skate; but never faster than
 * `maxHz` strides a second, because a flip-book stepping faster than the
 * screen refreshes strobes instead of running (and at that speed nobody can
 * see the feet anyway).
 * @param {number} phase  strides so far
 * @param {number} distPx  distance covered this frame (either direction)
 * @param {number} cyclePx  px per stride at the size it's drawn
 * @param {number} dt  seconds this frame
 * @param {number} maxHz
 */
export function stride(phase, distPx, cyclePx, dt, maxHz) {
  if (!(cyclePx > 0)) return phase;
  return phase + Math.min(Math.abs(distPx) / cyclePx, maxHz * dt);
}

/**
 * The flip-book frame for a stride phase: 0 .. frames-1.
 * @param {number} phase
 * @param {number} frames
 */
export function strideFrame(phase, frames) {
  const within = phase - Math.floor(phase); // 0..1, also for negative phases
  return clamp(Math.floor(within * frames), 0, frames - 1);
}

/**
 * Which way to face: +1 right, -1 left. A move of `dead` px or less keeps
 * the old facing, so the bird doesn't twitch round at the end of a dash.
 * @param {number} prev
 * @param {number} dx
 * @param {number} [dead]
 */
export function facing(prev, dx, dead = 0.25) {
  if (dx > dead) return 1;
  if (dx < -dead) return -1;
  return prev;
}

// @ts-check
/**
 * How the animals that don't simply run get about, as pure functions
 * (js/trails.js puts them on the page; js/wildlife.js has the running). Each
 * takes the animal's state and where scroll says it should be, and returns
 * its next state. Distances are CSS pixels, times milliseconds.
 */
import { follow } from './wildlife.js';

/**
 * @typedef {object} DartState
 * @property {number} x
 * @property {number | null} dest  where the dash in progress will stop
 */

/**
 * A scorpion's dart: it holds still through small moves of its spot, and
 * once the spot is more than `gap` away it commits to a dash to where the
 * spot is now, gets there fast (a short `lag`), and stops dead, even if
 * the spot has moved on meanwhile. Scrolling steadily, that makes the
 * rhythm of a scorpion: dash, freeze, dash.
 * @param {DartState} s
 * @param {number} target
 * @param {number} dt  seconds
 * @param {{ gap: number, lag: number }} cfg
 * @returns {DartState}
 */
export function dart(s, target, dt, cfg) {
  const dest = s.dest ?? (Math.abs(target - s.x) > cfg.gap ? target : null);
  if (dest === null) return s;
  const x = follow(s.x, dest, dt, cfg.lag);
  if (Math.abs(dest - x) < 0.5) return { x: dest, dest: null };
  return { x, dest };
}

/**
 * @typedef {object} Hop
 * @property {number} from
 * @property {number} to
 * @property {number} t0  when it left the ground
 */

/**
 * @typedef {object} HopState
 * @property {number} x          where it sits (or took off from)
 * @property {Hop | null} hop    the hop in progress
 * @property {number} restUntil  it can't take off again before this
 */

/**
 * @typedef {object} HopResult
 * @property {HopState} state
 * @property {number} x      where to draw it
 * @property {number} y      how high it is (negative is up)
 * @property {'sit' | 'crouch' | 'leap'} pose
 */

/**
 * A toad's hop. It sits until its spot is at least half a hop away, then
 * commits to a whole hop toward it (shorter if the spot is closer than one
 * hop). A hop can't stop in mid-air: stop scrolling mid-hop and it lands
 * anyway. It crouches at take-off and landing, and pauses between hops.
 * @param {HopState} s
 * @param {number} target
 * @param {number} now
 * @param {{ length: number, height: number, duration: number, pause: number }} cfg
 * @returns {HopResult}
 */
export function hop(s, target, now, cfg) {
  let { hop: h } = s;
  if (!h) {
    const gap = target - s.x;
    if (Math.abs(gap) < cfg.length / 2 || now < s.restUntil) {
      return { state: s, x: s.x, y: 0, pose: now < s.restUntil ? 'crouch' : 'sit' };
    }
    h = { from: s.x, to: s.x + Math.sign(gap) * Math.min(cfg.length, Math.abs(gap)), t0: now };
  }
  const u = Math.min(1, (now - h.t0) / cfg.duration);
  if (u >= 1) {
    return { state: { x: h.to, hop: null, restUntil: now + cfg.pause }, x: h.to, y: 0, pose: 'crouch' };
  }
  // it moves while it's in the air, not while it crouches
  const air = Math.min(1, Math.max(0, (u - 0.14) / 0.72));
  const e = air * air * (3 - 2 * air);
  return {
    state: { x: s.x, hop: h, restUntil: s.restUntil },
    x: h.from + (h.to - h.from) * e,
    y: air > 0 && air < 1 ? -cfg.height * 4 * air * (1 - air) : 0,
    pose: air > 0 && air < 1 ? 'leap' : 'crouch',
  };
}

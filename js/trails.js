// @ts-check
/**
 * Every animal on a trail. Each `.trail` holds one animal (`svg.runner`, the
 * roadrunner, or `svg.walker[data-animal]`) that crosses it as you scroll:
 * its hip goes from `--run-from` to `--run-to` (CSS custom properties on the
 * trail, fractions of its width, so a media query can change them) over the
 * stretch of scrolling in which the trail rises through the screen
 * (js/wildlife.js has the maths). Scroll back and it comes back.
 *
 * Each animal has its own way of covering that ground (its gait):
 *   run   chase the spot with a little lag, legs stepped by distance
 *         (the roadrunner; the javelina's trot; the snake's slither)
 *   dart  hold still through small moves, then dash (the scorpion)
 *   hop   whole hops toward the spot, never stopping in mid-air (the toad)
 * Stopped, it rests and does what it does at rest: a CSS animation on
 * `[data-state="idle"]` (tail flick, rooting, tongue and rattle, threat,
 * blink).
 *
 * Cheap by construction: animals move by transform only, their poses are one
 * inherited custom property (`--frame`) picking a drawing in the sprite, and
 * the loop runs only while a trail is on screen and something is moving.
 * With reduced motion this never starts, and each animal stands where the
 * CSS put it.
 */
import { ROADRUNNER } from './fauna-data.js';
import { CRITTERS } from './critter-data.js';
import { runWindow, runProgress, runnerX, follow, stride, strideFrame, facing } from './wildlife.js';
import { dart, hop } from './gaits.js';

/**
 * @typedef {object} Gait
 * @property {'run' | 'dart' | 'hop'} kind
 * @property {number} [lag]       s: how far behind its spot it trails
 * @property {number} [maxHz]     gait cycles a second, at most
 * @property {number} [gap]       px: how far its spot must get before it darts
 * @property {number} [duration]  ms: one hop
 * @property {number} [pause]     ms: sitting between hops
 */

/** @type {Record<string, Gait>} */
const GAITS = {
  roadrunner: { kind: 'run', lag: 0.12, maxHz: 7 },
  javelina: { kind: 'run', lag: 0.22, maxHz: 3.4 },
  rattlesnake: { kind: 'run', lag: 0.3, maxHz: 2.4 },
  scorpion: { kind: 'dart', lag: 0.06, maxHz: 9, gap: 34 },
  toad: { kind: 'hop', duration: 340, pause: 120 },
};
const REST_MS = 160;  // this long without moving, an animal rests
const SNAP = 0.4;     // px: this close to its spot, it's there

/**
 * @typedef {object} Animal
 * @property {HTMLElement} trail
 * @property {SVGSVGElement} el
 * @property {Gait} gait
 * @property {{ viewBox: number[], pivot: number, runFrames?: number, cycle?: number, crouch?: number, leap?: number, hop?: number, hopHeight?: number }} data
 * @property {number} from
 * @property {number} to
 * @property {import('./wildlife.js').RunWindow} win
 * @property {number} trailW
 * @property {number} pivotPx  its hip, px from the drawing's left edge
 * @property {number} cyclePx  px covered per gait cycle at the drawn size
 * @property {number} hopPx    px per hop (toad)
 * @property {number} hopH     px high a hop goes (toad)
 * @property {number} x
 * @property {number} y
 * @property {number} phase    gait cycles so far
 * @property {number} face     +1 right, -1 left
 * @property {number} moved    when it last moved (ms, rAF clock)
 * @property {boolean} seen
 * @property {string} state    'run' | 'idle'
 * @property {number} frame
 * @property {number | null} dest  where a dart in progress stops
 * @property {import('./gaits.js').HopState} hopState
 */

export function initTrails() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  /** @type {Animal[]} */
  const animals = [];
  for (const trail of document.querySelectorAll('.trail')) {
    const el = trail.querySelector('svg.runner, svg.walker');
    if (!(trail instanceof HTMLElement) || !(el instanceof SVGSVGElement)) continue;
    const name = el.dataset.animal || 'roadrunner';
    const data = name === 'roadrunner' ? ROADRUNNER : CRITTERS[name];
    const gait = GAITS[name];
    if (!data || !gait) continue;
    el.style.transformOrigin = `${data.pivot * 100}% 100%`;
    trail.classList.add('is-live'); // hands positioning from the CSS resting spot to the transform
    animals.push({ trail, el, gait, data, from: 0, to: 1, win: { from: 0, to: 1 }, trailW: 0, pivotPx: 0,
      cyclePx: 0, hopPx: 0, hopH: 0, x: 0, y: 0, phase: 0, face: 1, moved: -Infinity, seen: false, state: '',
      frame: -1, dest: null, hopState: { x: 0, hop: null, restUntil: 0 } });
  }
  if (!animals.length) return;

  /** @param {Animal} a */
  const target = (a) => runnerX(runProgress(window.scrollY, a.win), a.from, a.to, a.trailW);

  /** @param {Animal} a @param {string} state */
  const setState = (a, state) => {
    if (a.state !== state) a.el.dataset.state = a.state = state;
  };

  /** @param {Animal} a @param {number} frame */
  const setFrame = (a, frame) => {
    if (frame !== a.frame) a.el.style.setProperty('--frame', String((a.frame = frame)));
  };

  /** @param {Animal} a */
  const place = (a) => {
    a.el.style.transform = `translate3d(${(a.x - a.pivotPx).toFixed(1)}px,${a.y.toFixed(1)}px,0) scaleX(${a.face})`;
  };

  /** Where it belongs right now, standing still. @param {Animal} a */
  const settle = (a) => {
    a.x = target(a);
    a.y = 0;
    a.dest = null;
    a.hopState = { x: a.x, hop: null, restUntil: 0 };
    setState(a, 'idle');
    place(a);
  };

  /** Where everything is: on start, and whenever the page changes size. */
  const measure = () => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    for (const a of animals) {
      const css = getComputedStyle(a.trail);
      a.from = parseFloat(css.getPropertyValue('--run-from')) || 0;
      a.to = parseFloat(css.getPropertyValue('--run-to')) || 1;
      const r = a.trail.getBoundingClientRect();
      a.win = runWindow(r.top + window.scrollY, window.innerHeight, maxScroll);
      a.trailW = r.width;
      const [, , vbW, vbH] = a.data.viewBox;
      const unit = a.el.getBoundingClientRect().height / vbH; // px per sprite unit
      a.pivotPx = a.data.pivot * vbW * unit;
      a.cyclePx = (a.data.cycle ?? 0) * unit;
      a.hopPx = (a.data.hop ?? 0) * unit;
      a.hopH = (a.data.hopHeight ?? 0) * unit;
      settle(a); // a resize puts an animal where it belongs; it doesn't travel there
    }
  };

  let raf = 0;
  let last = 0;
  /** @param {number} now */
  const tick = (now) => {
    raf = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    let busy = false;
    for (const a of animals) {
      if (!a.seen) continue;
      const goal = target(a);
      const { gait } = a;
      if (gait.kind === 'hop') {
        const r = hop(a.hopState, goal, now, { length: a.hopPx, height: a.hopH, duration: gait.duration ?? 380, pause: gait.pause ?? 150 });
        const moving = r.state.hop !== null || r.pose === 'crouch';
        if (r.state.hop) a.face = facing(a.face, r.state.hop.to - r.state.hop.from);
        a.hopState = r.state;
        if (r.x !== a.x || r.y !== a.y || moving) {
          a.x = r.x;
          a.y = r.y;
          a.moved = now;
          place(a);
        }
        if (moving) {
          setState(a, 'run');
          setFrame(a, r.pose === 'leap' ? a.data.leap ?? 1 : a.data.crouch ?? 0);
          busy = true;
        } else {
          setState(a, 'idle');
        }
        if (Math.abs(goal - a.hopState.x) >= a.hopPx / 2) busy = true;
        continue;
      }
      let nx;
      if (gait.kind === 'dart') {
        const s = dart({ x: a.x, dest: a.dest }, goal, dt, { gap: gait.gap ?? 30, lag: gait.lag ?? 0.06 });
        nx = s.x;
        a.dest = s.dest;
      } else {
        nx = follow(a.x, goal, dt, gait.lag ?? 0.12);
        if (Math.abs(goal - nx) < SNAP) nx = goal;
      }
      const dx = nx - a.x;
      if (dx !== 0) {
        a.phase = stride(a.phase, dx, a.cyclePx, dt, gait.maxHz ?? 7);
        a.face = facing(a.face, dx);
        a.moved = now;
        a.x = nx;
        place(a);
      }
      if (now - a.moved < REST_MS) {
        setState(a, 'run');
        setFrame(a, strideFrame(a.phase, a.data.runFrames ?? 6));
        busy = true;
      } else {
        setState(a, 'idle');
      }
      if (a.x !== goal && (gait.kind !== 'dart' || a.dest !== null)) busy = true;
    }
    if (busy) raf = requestAnimationFrame(tick);
    else last = 0;
  };
  const wake = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };

  measure();
  new ResizeObserver(measure).observe(document.body);
  window.addEventListener('scroll', wake, { passive: true });
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const a = animals.find((animal) => animal.trail === entry.target);
      if (!a) continue;
      if (entry.isIntersecting && !a.seen) settle(a); // arriving from elsewhere on the page: be where it belongs
      a.seen = entry.isIntersecting;
    }
    wake();
  }, { rootMargin: '160px 0px' });
  for (const a of animals) io.observe(a.trail);
}

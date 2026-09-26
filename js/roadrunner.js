// @ts-check
/**
 * The roadrunners. Each `.trail` holds one `.runner` that crosses it as you
 * scroll: its hip goes from `--run-from` to `--run-to` (CSS custom properties
 * on the trail, fractions of its width, so a media query can change them)
 * over the stretch of scrolling in which the trail rises through the screen
 * (js/wildlife.js has the maths). Scroll back and it
 * turns and runs back; stop and, a beat later, it stands and flicks its tail
 * (a CSS animation on `[data-state="idle"]`).
 *
 * Cheap by construction: the bird moves by transform only, its legs are one
 * inherited custom property (`--frame`) picking a pose in the sprite, and the
 * loop runs only while a trail is on screen and something is moving. With
 * reduced motion this never starts, and each bird stands where the CSS put it.
 */
import { ROADRUNNER } from './fauna-data.js';
import { runWindow, runProgress, runnerX, follow, stride, strideFrame, facing } from './wildlife.js';

const LAG = 0.12;     // s: how far behind the scroll a runner trails (a dash, not a teleport)
const MAX_HZ = 7;     // strides a second, at most
const REST_MS = 160;  // this long without moving, a runner stands
const SNAP = 0.4;     // px: this close to where it should be, it's there

/**
 * @typedef {object} Bird
 * @property {HTMLElement} trail
 * @property {SVGSVGElement} el
 * @property {number} from
 * @property {number} to
 * @property {import('./wildlife.js').RunWindow} win
 * @property {number} trailW
 * @property {number} pivotPx  the hip, px from the drawing's left edge
 * @property {number} cyclePx  px covered per stride at the drawn size
 * @property {number} x        where the hip is, px from the trail's left edge
 * @property {number} phase    strides so far
 * @property {number} face     +1 right, -1 left
 * @property {number} moved    when it last moved (ms, rAF clock)
 * @property {boolean} seen    on screen (or about to be)
 * @property {string} state    'run' | 'idle'
 * @property {number} frame
 */

export function initRoadrunners() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  /** @type {Bird[]} */
  const birds = [];
  for (const trail of document.querySelectorAll('.trail')) {
    const el = trail.querySelector('svg.runner');
    if (!(trail instanceof HTMLElement) || !(el instanceof SVGSVGElement)) continue;
    el.style.transformOrigin = `${ROADRUNNER.pivot * 100}% 100%`;
    trail.classList.add('is-live'); // hands positioning from the CSS resting spot to the transform
    birds.push({ trail, el, from: 0, to: 1, win: { from: 0, to: 1 }, trailW: 0, pivotPx: 0, cyclePx: 0,
      x: 0, phase: 0, face: 1, moved: -Infinity, seen: false, state: '', frame: -1 });
  }
  if (!birds.length) return;

  const [, , vbW, vbH] = ROADRUNNER.viewBox;

  /** @param {Bird} b */
  const target = (b) => runnerX(runProgress(window.scrollY, b.win), b.from, b.to, b.trailW);

  /** @param {Bird} b @param {string} state */
  const setState = (b, state) => {
    if (b.state !== state) b.el.dataset.state = b.state = state;
  };

  /** @param {Bird} b */
  const place = (b) => {
    b.el.style.transform = `translate3d(${(b.x - b.pivotPx).toFixed(1)}px,0,0) scaleX(${b.face})`;
  };

  /** Where everything is: on start, and whenever the page changes size. */
  const measure = () => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    for (const b of birds) {
      const css = getComputedStyle(b.trail);
      b.from = parseFloat(css.getPropertyValue('--run-from')) || 0;
      b.to = parseFloat(css.getPropertyValue('--run-to')) || 1;
      const r = b.trail.getBoundingClientRect();
      b.win = runWindow(r.top + window.scrollY, window.innerHeight, maxScroll);
      b.trailW = r.width;
      const unit = b.el.getBoundingClientRect().height / vbH; // px per sprite unit
      b.pivotPx = ROADRUNNER.pivot * vbW * unit;
      b.cyclePx = ROADRUNNER.cycle * unit;
      b.x = target(b); // a resize puts a bird where it belongs; it doesn't run there
      setState(b, 'idle');
      place(b);
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
    for (const b of birds) {
      if (!b.seen) continue;
      const goal = target(b);
      let nx = follow(b.x, goal, dt, LAG);
      if (Math.abs(goal - nx) < SNAP) nx = goal;
      const dx = nx - b.x;
      if (dx !== 0) {
        b.phase = stride(b.phase, dx, b.cyclePx, dt, MAX_HZ);
        b.face = facing(b.face, dx);
        b.moved = now;
        b.x = nx;
        place(b);
      }
      if (now - b.moved < REST_MS) {
        setState(b, 'run');
        const frame = strideFrame(b.phase, ROADRUNNER.runFrames);
        if (frame !== b.frame) b.el.style.setProperty('--frame', String((b.frame = frame)));
        busy = true;
      } else {
        setState(b, 'idle');
      }
      if (b.x !== goal) busy = true;
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
      const b = birds.find((bird) => bird.trail === entry.target);
      if (!b) continue;
      if (entry.isIntersecting && !b.seen) {
        b.x = target(b); // arriving from elsewhere on the page: be where it belongs
        place(b);
      }
      b.seen = entry.isIntersecting;
    }
    wake();
  }, { rootMargin: '160px 0px' });
  for (const b of birds) io.observe(b.trail);
}

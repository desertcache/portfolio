// @ts-check
import { activeStep } from './scrolly.js';

/** Where the reader's eye is: a step is current once its top passes the middle of the window. */
const READING_LINE = 0.5;

/**
 * The featured program's diagram (#flow) builds itself as the reader goes
 * down the five steps beside it: the hunt across tools, the bet on the
 * playbook, the build, the rollout's access checks, the result.
 *
 * The HTML ships the finished drawing (data-step="5"), and that is what
 * no-JS, reduced-motion and phone-width visitors keep: on one column the
 * drawing sits above the steps, so there is nothing for it to follow. Wide
 * screens get `.is-live` (which turns the transitions on) and a data-step
 * that tracks the reading line. The scroll listener only runs while the
 * section is near the window. Its own file on purpose: a cached main.js that
 * doesn't import it just leaves the drawing whole.
 */
export function initFlagship() {
  const fig = document.getElementById('flow');
  const section = fig?.closest('section');
  const steps = /** @type {HTMLElement[]} */ ([...(section?.querySelectorAll('.steps > .step') ?? [])]);
  if (!fig || !section || steps.length === 0 || !('IntersectionObserver' in window)) return;
  const ticks = /** @type {HTMLElement[]} */ ([...fig.querySelectorAll('.flow-ticker li')]);
  const wide = matchMedia('(min-width: 901px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  /** @type {number} 1-based, like data-step */
  let current = 0;
  /** @param {number} n @param {boolean} live */
  const show = (n, live) => {
    if (n === current && fig.classList.contains('is-live') === live) return;
    current = n;
    fig.dataset.step = String(n);
    fig.classList.toggle('is-live', live);
    steps.forEach((s, i) => s.classList.toggle('is-current', live && i + 1 === n));
    ticks.forEach((t, i) => {
      t.classList.toggle('is-done', i + 1 < n);
      t.classList.toggle('is-current', i + 1 === n);
    });
  };

  let queued = 0;
  const measure = () => {
    queued = 0;
    const tops = steps.map((s) => s.getBoundingClientRect().top);
    show(activeStep(tops, window.innerHeight * READING_LINE) + 1, true);
  };
  const onScroll = () => {
    if (!queued) queued = requestAnimationFrame(measure);
  };

  let listening = false;
  /** @param {boolean} on */
  const listen = (on) => {
    if (on === listening) return;
    listening = on;
    if (on) {
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      onScroll();
    } else {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    }
  };
  const near = new IntersectionObserver(([entry]) => listen(entry.isIntersecting), { rootMargin: '25% 0px' });
  // The hunt draws itself once the drawing is properly in view, not as its first pixel peeks in.
  const seen = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    fig.classList.add('is-seen');
    seen.disconnect();
  }, { threshold: 0.45 });

  const apply = () => {
    if (wide.matches && !reduced.matches) {
      near.observe(section);
      seen.observe(fig);
      measure();
    } else {
      near.disconnect();
      listen(false);
      show(steps.length, false);
    }
  };
  wide.addEventListener('change', apply);
  reduced.addEventListener('change', apply);
  // Paper gets the whole system, whichever step the reader had reached.
  window.addEventListener('beforeprint', () => show(steps.length, false));
  window.addEventListener('afterprint', apply);
  apply();
}

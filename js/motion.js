// @ts-check
import { parseStat, formatStat } from './lib.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Reveal-on-scroll. CSS hides `.reveal` only under `html.js`, so with scripts
 * off (or broken) everything is simply visible. Siblings that enter together
 * get a small stagger so a row of cards lands as a wave, not a slab.
 */
export function initReveal() {
  const els = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.reveal')]);
  if (reduced() || !('IntersectionObserver' in window)) {
    for (const el of els) el.classList.add('in');
    return;
  }
  const io = new IntersectionObserver((entries) => {
    const entering = entries.filter((e) => e.isIntersecting).map((e) => /** @type {HTMLElement} */ (e.target));
    entering.forEach((el, i) => {
      el.style.setProperty('--delay', `${Math.min(i, 5) * 90}ms`);
      el.classList.add('in');
      io.unobserve(el);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
  for (const el of els) io.observe(el);
}

/**
 * Count numbers up from zero the first time they scroll into view. The HTML
 * holds the real value, so no-JS readers, crawlers, and screen readers get
 * the right number; the animation is decoration layered on top.
 */
export function initCountUp() {
  const els = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('[data-count]')]);
  if (reduced() || !('IntersectionObserver' in window)) return;

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      io.unobserve(entry.target);
      run(/** @type {HTMLElement} */ (entry.target));
    }
  }, { threshold: 0.6 });

  for (const el of els) {
    const stat = parseStat(el.textContent ?? '');
    if (!stat) continue;
    el.dataset.final = el.textContent ?? '';
    io.observe(el);
  }

  /** @param {HTMLElement} el */
  function run(el) {
    const finalText = el.dataset.final ?? '';
    const stat = parseStat(finalText);
    if (!stat) return;
    const duration = 1500;
    const t0 = performance.now();
    /** @param {number} now */
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(2, -10 * p); // ease-out expo: fast start, soft landing
      el.textContent = p < 1 ? formatStat(stat, stat.value * eased) : finalText;
      if (p < 1) requestAnimationFrame(tick);
    };
    el.textContent = formatStat(stat, 0);
    requestAnimationFrame(tick);
  }
}

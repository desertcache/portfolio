// @ts-check
/**
 * Entry point. Each feature is independent and wrapped so one failure (say,
 * a GPU driver that rejects the shader) can't take the rest of the page down.
 * Order matters only for perceived speed: things you see first start first.
 */
import { initTheme } from './theme.js';
import { initReveal, initCountUp } from './motion.js';
import { initTopo } from './topo.js';
import { initCaseStudies } from './case-studies.js';
import { initOrb, initLatestDispatch } from './lab.js';
import { initNav, initScrollSpy, initCopyEmail, initWarp, greet } from './chrome.js';

// Tells the <head> safety net that JS arrived (it un-hides content otherwise).
document.documentElement.classList.add('js-ready');

/** @type {Array<[string, () => unknown]>} */
const features = [
  ['theme', initTheme],
  ['nav', initNav],
  ['reveal', initReveal],
  ['count-up', initCountUp],
  ['case studies', initCaseStudies],
  ['topo', () => {
    const canvas = document.getElementById('topo');
    if (canvas instanceof HTMLCanvasElement) initTopo(canvas);
  }],
  ['scroll-spy', initScrollSpy],
  ['copy email', initCopyEmail],
  ['orb', initOrb],
  ['latest dispatch', initLatestDispatch],
  ['warp', initWarp],
  ['greeting', greet],
];

for (const [name, init] of features) {
  try {
    const result = init();
    if (result instanceof Promise) result.catch((err) => console.error(`[site] ${name} failed:`, err));
  } catch (err) {
    console.error(`[site] ${name} failed:`, err);
  }
}

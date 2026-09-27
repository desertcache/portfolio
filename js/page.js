// @ts-check
/**
 * Entry point for the standalone pages: the Arcade, the Starship and the
 * skincare protocol. They share only the site's chrome (the theme toggle and
 * the nav); each brings its own script for what's on it. Built like
 * js/main.js: each feature runs on its own, so one failure can't take the
 * other down.
 */
import { initTheme } from './theme.js';
import { initNav } from './chrome.js';

// Tells the <head> safety net that JS arrived (it un-hides content otherwise).
document.documentElement.classList.add('js-ready');

/** @type {Array<[string, () => unknown]>} */
const features = [
  ['theme', initTheme],
  ['nav', initNav],
];

for (const [name, init] of features) {
  try {
    init();
  } catch (err) {
    console.error(`[site] ${name} failed:`, err);
  }
}

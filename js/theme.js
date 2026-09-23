// @ts-check
/**
 * Light/dark toggle. The first paint is decided by the inline script in
 * <head> (so there's no flash); this module only handles changes after that.
 * `sb-theme` is the same localStorage key every page on the site reads.
 */

const KEY = 'sb-theme';
const META = { light: '#f5f1ea', dark: '#12100e' };

/** @typedef {'light' | 'dark'} Theme */

/** @returns {Theme} */
export function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/** @returns {Theme | null} the visitor's explicit choice, if they made one */
function storedTheme() {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'dark' || t === 'light' ? t : null;
  } catch {
    return null; // storage blocked (private mode, strict settings)
  }
}

/**
 * @param {Theme} theme
 * @param {{ persist: boolean, fade: boolean }} opts
 */
function applyTheme(theme, { persist, fade }) {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (fade && !reduced) {
    root.classList.add('theme-fade');
    window.setTimeout(() => root.classList.remove('theme-fade'), 500);
  }
  root.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META[theme]);
  if (persist) {
    try { localStorage.setItem(KEY, theme); } catch { /* not fatal: the choice just won't stick */ }
  }
  syncButton();
  // topo.js listens for this to recolour the hero without reloading
  document.dispatchEvent(new CustomEvent('sb:themechange', { detail: theme }));
}

function syncButton() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  btn.setAttribute('aria-label', `Switch to ${next} theme`);
}

export function initTheme() {
  syncButton();
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', { persist: true, fade: true });
  });
  // Follow the OS switching modes, but only for visitors who never chose.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (storedTheme() === null) applyTheme(e.matches ? 'dark' : 'light', { persist: false, fade: true });
  });
}

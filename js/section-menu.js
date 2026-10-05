// @ts-check
/**
 * The phone section menu: under 900px the nav links fold away, so a button in
 * the header opens a list of every section. Its own file on purpose: Pages
 * caches for 10 minutes, and a visitor holding a cached chrome.js from before
 * this existed would otherwise lose every module to a missing named export.
 * The scroll-spy in chrome.js marks the section being read in this list too.
 */

/**
 * It closes on a pick, a tap outside, Escape (focus goes back to its button),
 * and when the window grows past the phone layout.
 */
export function initSectionMenu() {
  const toggle = document.getElementById('nav-menu-toggle');
  const menu = document.getElementById('nav-menu');
  if (!(toggle instanceof HTMLButtonElement) || !menu) return;
  const setOpen = (/** @type {boolean} */ open) => {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close sections' : 'Sections');
  };
  toggle.addEventListener('click', () => setOpen(menu.hidden));
  menu.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && e.target instanceof Node && !menu.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || menu.hidden) return;
    setOpen(false);
    toggle.focus();
  });
  window.matchMedia('(min-width: 901px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
}

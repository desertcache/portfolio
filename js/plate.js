// @ts-check
import { HOURS, hourFromQuery, pickHours } from './hours.js';

/** @typedef {import('./hours.js').Hour} Hour */
/** @typedef {import('./hours.js').Family} Family */

/**
 * The hero's painting keeps time. Which of the five paintings shows is settled
 * before first paint: the <head> script puts the hour for each theme on <html>
 * (data-day, data-dusk) and CSS draws the matching file (.hero-art), so the
 * right picture is the only one fetched and nothing flashes.
 *
 * This does the words: the caption's first sentence for each theme, the line
 * that says the picture follows the clock (only true once a script has run),
 * and the description a screen reader gets, which follows the theme switch.
 * Without JS the page keeps the morning it was written with.
 */
export function initPlate() {
  const art = document.getElementById('painted-skyline');
  const cap = document.querySelector('.hero-cap');
  if (!art || !cap) return;
  const root = document.documentElement;
  const picked = pickHours(new Date(), window.location.search);

  /**
   * What the <head> script chose is what is on screen. The same rule here only
   * fills in if that script didn't run.
   * @param {string | undefined} name
   * @param {Family} family
   * @returns {Hour}
   */
  const shown = (name, family) => {
    const hour = name ? hourFromQuery(`?hour=${name}`) : null;
    return hour && HOURS[hour].family === family ? hour : picked[family];
  };
  const hours = { light: shown(root.dataset.day, 'light'), dark: shown(root.dataset.dusk, 'dark') };
  root.dataset.day = hours.light;
  root.dataset.dusk = hours.dark;

  for (const [cls, family] of /** @type {const} */ ([['plate-day', 'light'], ['plate-dusk', 'dark']])) {
    const lead = cap.querySelector(`.${cls}`);
    if (lead) lead.textContent = HOURS[hours[family]].lead;
  }
  const note = cap.querySelector('.plate-clock');
  if (note instanceof HTMLElement) note.hidden = false;

  const describe = () => {
    art.setAttribute('aria-label', HOURS[hours[root.dataset.theme === 'dark' ? 'dark' : 'light']].alt);
  };
  describe();
  document.addEventListener('sb:themechange', describe);
}

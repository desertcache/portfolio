// @ts-check
import { phoenixTime } from './arizona.js';

/**
 * The contact section's local time. Whoever is reading is rarely in Arizona,
 * and Arizona's skipped daylight saving makes the time-zone math worse, so
 * the page does it for them. Ticks on the minute; sleeps while the tab is
 * hidden. Without JS the line still says which time zone.
 */
export function initClock() {
  const el = document.querySelector('[data-phoenix-time]');
  if (!el) return;
  /** @type {number | undefined} */
  let timer;
  const tick = () => {
    el.textContent = `${phoenixTime(new Date())} in Phoenix`;
    // Phoenix is a whole number of hours off UTC, so UTC minutes line up
    timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
  };
  document.addEventListener('visibilitychange', () => {
    window.clearTimeout(timer);
    if (!document.hidden) tick();
  });
  tick();
}

// @ts-check
import { HOURS, hourFiles, pickHours } from './hours.js';

/**
 * The painted skyline keeps time. The HTML carries one picture per theme
 * (morning and dusk); this points each at the hour it is in Phoenix: golden
 * hour on a light afternoon, the small hours or a monsoon storm after dark
 * (js/hours.js has the rule). Both pictures are lazy and sit at the foot of
 * the page, so the swap lands before either has been fetched and a visitor
 * still downloads one. Without JS the page keeps morning and dusk.
 *
 * It picks once, at load. Swapping a picture someone is looking at would be
 * a jolt, and a reader who stays past an hour's end loses nothing.
 */
export function initPlate() {
  const plate = document.getElementById('painted-skyline');
  if (!plate) return;
  const picked = pickHours(new Date(), window.location.search);
  for (const [cls, family] of /** @type {const} */ ([['plate-day', 'light'], ['plate-dusk', 'dark']])) {
    const hour = picked[family];
    const source = plate.querySelector(`picture.${cls} source`);
    const img = plate.querySelector(`picture.${cls} img`);
    const lead = plate.querySelector(`.plate-cap .${cls}`);
    if (!(source instanceof HTMLSourceElement) || !(img instanceof HTMLImageElement) || !lead) continue;
    const files = hourFiles(hour);
    plate.dataset[family] = hour;
    if (img.getAttribute('src') === files.src) continue; // already the one the HTML names
    source.srcset = files.webp;
    img.srcset = files.jpg;
    img.src = files.src;
    img.alt = HOURS[hour].alt;
    lead.textContent = HOURS[hour].lead;
  }
  // The caption only says the picture follows the clock once it does.
  const note = plate.querySelector('.plate-clock');
  if (note instanceof HTMLElement) note.hidden = false;
}

// Unit tests for js/hours.js: which painting of the mountain the homepage shows
// for a theme and a moment in Phoenix. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { HOURS, phoenixParts, isMonsoonSeason, hourFor, hourFromQuery, pickHours, hourFiles } from '../js/hours.js';

/** @typedef {import('../js/hours.js').Hour} Hour */

const HOME = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/** A moment given as Phoenix wall-clock time. Phoenix is UTC-7 all year. */
const phx = (/** @type {number} */ y, /** @type {number} */ m, /** @type {number} */ d, /** @type {number} */ h, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h + 7, min));

test('phoenixParts reads the wall clock in Phoenix, in summer and winter alike', () => {
  assert.deepEqual(phoenixParts(new Date('2026-11-14T20:30:00Z')), { month: 11, day: 14, hour: 13 });
  // Arizona skips daylight saving: the offset is the same in July.
  assert.deepEqual(phoenixParts(new Date('2026-07-04T20:30:00Z')), { month: 7, day: 4, hour: 13 });
  // Early UTC is still the day before in Phoenix, and midnight is hour 0, not 24.
  assert.deepEqual(phoenixParts(new Date('2026-01-01T03:00:00Z')), { month: 12, day: 31, hour: 20 });
  assert.deepEqual(phoenixParts(new Date('2026-03-10T07:00:00Z')), { month: 3, day: 10, hour: 0 });
});

test('monsoon season runs 15 June to 30 September', () => {
  assert.equal(isMonsoonSeason(6, 14), false);
  assert.equal(isMonsoonSeason(6, 15), true);
  assert.equal(isMonsoonSeason(8, 1), true);
  assert.equal(isMonsoonSeason(9, 30), true);
  assert.equal(isMonsoonSeason(10, 1), false);
  assert.equal(isMonsoonSeason(1, 20), false);
});

test('the light theme shows morning until 1 PM and golden hour after', () => {
  assert.equal(hourFor('light', phx(2026, 11, 14, 3)), 'morning');
  assert.equal(hourFor('light', phx(2026, 11, 14, 9)), 'morning');
  assert.equal(hourFor('light', phx(2026, 11, 14, 12, 59)), 'morning');
  assert.equal(hourFor('light', phx(2026, 11, 14, 13)), 'golden');
  assert.equal(hourFor('light', phx(2026, 11, 14, 18)), 'golden');
  assert.equal(hourFor('light', phx(2026, 11, 14, 2, 59)), 'golden');
  // The light theme never gets a storm, whatever the season.
  assert.equal(hourFor('light', phx(2026, 8, 1, 18)), 'golden');
});

test('the dark theme shows dusk, the small hours from 10 PM to 5 AM, and the storm on summer evenings', () => {
  assert.equal(hourFor('dark', phx(2026, 11, 14, 10)), 'dusk');
  assert.equal(hourFor('dark', phx(2026, 11, 14, 18)), 'dusk');
  assert.equal(hourFor('dark', phx(2026, 11, 14, 21, 59)), 'dusk');
  assert.equal(hourFor('dark', phx(2026, 11, 14, 22)), 'night');
  assert.equal(hourFor('dark', phx(2026, 11, 14, 0)), 'night');
  assert.equal(hourFor('dark', phx(2026, 11, 14, 4, 59)), 'night');
  assert.equal(hourFor('dark', phx(2026, 11, 14, 5)), 'dusk');
  assert.equal(hourFor('dark', phx(2026, 8, 1, 14, 59)), 'dusk');
  assert.equal(hourFor('dark', phx(2026, 8, 1, 15)), 'monsoon');
  assert.equal(hourFor('dark', phx(2026, 8, 1, 21, 59)), 'monsoon');
  assert.equal(hourFor('dark', phx(2026, 8, 1, 22)), 'night');
  assert.equal(hourFor('dark', phx(2026, 6, 14, 18)), 'dusk');
  assert.equal(hourFor('dark', phx(2026, 6, 15, 18)), 'monsoon');
  assert.equal(hourFor('dark', phx(2026, 9, 30, 18)), 'monsoon');
  assert.equal(hourFor('dark', phx(2026, 10, 1, 18)), 'dusk');
});

test('every hour of the day gives each theme a painting from its own family', () => {
  for (let h = 0; h < 24; h++) {
    for (const [m, d] of [[1, 15], [8, 1]]) {
      const at = phx(2026, m, d, h);
      assert.equal(HOURS[hourFor('light', at)].family, 'light', `light at ${h}:00`);
      assert.equal(HOURS[hourFor('dark', at)].family, 'dark', `dark at ${h}:00`);
    }
  }
});

test('an hour can be asked for by name in the address, and nothing else gets through', () => {
  assert.equal(hourFromQuery('?hour=monsoon'), 'monsoon');
  assert.equal(hourFromQuery('?a=1&hour=night'), 'night');
  assert.equal(hourFromQuery(''), null);
  assert.equal(hourFromQuery('?hour='), null);
  assert.equal(hourFromQuery('?hour=Monsoon'), null);
  assert.equal(hourFromQuery('?hour=toString'), null);
  assert.equal(hourFromQuery('?hour=../../x'), null);
});

test('a forced hour replaces the pick in its own family only', () => {
  const noon = phx(2026, 11, 14, 12);
  assert.deepEqual(pickHours(noon), { light: 'morning', dark: 'dusk' });
  assert.deepEqual(pickHours(noon, '?hour=monsoon'), { light: 'morning', dark: 'monsoon' });
  assert.deepEqual(pickHours(noon, '?hour=golden'), { light: 'golden', dark: 'dusk' });
  assert.deepEqual(pickHours(noon, '?hour=nope'), { light: 'morning', dark: 'dusk' });
});

test('every hour has its four files, and each is a real picture', () => {
  for (const hour of /** @type {Hour[]} */ (Object.keys(HOURS))) {
    const files = hourFiles(hour);
    const named = [...`${files.webp}, ${files.jpg}, ${files.src}`.matchAll(/assets\/painted\/[a-z0-9-]+\.(?:webp|jpg)/g)].map((m) => m[0]);
    assert.equal(new Set(named).size, 4, `${hour} names a webp and a jpg at two sizes`);
    for (const file of named) assert.ok(statSync(new URL(`../${file}`, import.meta.url)).size > 10_000, `${file} is missing`);
  }
});

test('the two pictures the HTML carries are morning and dusk, word for word', () => {
  const plate = HOME.match(/<figure class="plate"[\s\S]*?<\/figure>/)?.[0] ?? '';
  for (const [cls, hour] of /** @type {const} */ ([['plate-day', 'morning'], ['plate-dusk', 'dusk']])) {
    const files = hourFiles(hour);
    const picture = plate.match(new RegExp(`<picture class="${cls}">[\\s\\S]*?</picture>`))?.[0] ?? '';
    assert.ok(picture.includes(`srcset="${files.webp}"`), `${hour}: the webp srcset`);
    assert.ok(picture.includes(`src="${files.src}" srcset="${files.jpg}"`), `${hour}: the jpg fallback`);
    assert.ok(picture.includes(`alt="${HOURS[hour].alt}"`), `${hour}: the alt text`);
    assert.ok(plate.includes(`<span class="${cls}">${HOURS[hour].lead}</span>`), `${hour}: the caption's lead`);
  }
  // The line about the clock is only true once the script has run.
  assert.match(plate, /<span class="plate-clock" hidden>/);
});

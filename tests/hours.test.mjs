// Unit tests for js/hours.js: which painting of the mountain the homepage shows
// for a theme and a moment in Phoenix. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { HOURS, phoenixParts, isMonsoonSeason, hourFor, hourFromQuery, pickHours, hourFiles } from '../js/hours.js';

/** @typedef {import('../js/hours.js').Hour} Hour */

const HOME = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../css/site.css', import.meta.url), 'utf8');

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

test('without a script the hero says morning and dusk, word for word', () => {
  const hero = HOME.match(/<section class="hero[\s\S]*?<\/section>/)?.[0] ?? '';
  // Light is the theme without a script, so the description it carries is the morning's.
  assert.ok(hero.includes(`role="img" aria-label="${HOURS.morning.alt}"`), 'the painting\'s description');
  assert.ok(hero.includes(`<span class="plate-day">${HOURS.morning.lead}</span>`), 'the light caption');
  assert.ok(hero.includes(`<span class="plate-dusk">${HOURS.dusk.lead}</span>`), 'the dark caption');
  // The line about the clock is only true once the script has run.
  assert.match(hero, /<span class="plate-clock" hidden>/);
});

test('the stylesheet draws every hour at both sizes, each under the attributes that pick it', () => {
  const art = (/** @type {Hour} */ hour, /** @type {number} */ size) => `--art: url("../assets/painted/camelback-${hour}-${size}.webp");`;
  /** @type {Record<Hour, string>} */
  const selector = {
    morning: '.hero-art',
    golden: ':root[data-day="golden"] .hero-art',
    dusk: ':root[data-theme="dark"] .hero-art',
    night: ':root[data-theme="dark"][data-dusk="night"] .hero-art',
    monsoon: ':root[data-theme="dark"][data-dusk="monsoon"] .hero-art',
  };
  const small = CSS.slice(0, CSS.indexOf('@media (min-width: 900px) {   /* the same breakpoint'));
  const large = CSS.slice(small.length, CSS.indexOf('.hero-painted::before'));
  assert.ok(small.length > 0 && large.length > 0, 'the rules are where this test looks');
  for (const hour of /** @type {Hour[]} */ (Object.keys(HOURS))) {
    if (hour === 'morning') assert.ok(small.includes(art(hour, 1200)) && large.includes(`.hero-art { ${art(hour, 2400)} }`), 'morning is the default');
    else {
      assert.ok(small.includes(`${selector[hour]} { ${art(hour, 1200)} }`), `${hour} at 1200`);
      assert.ok(large.includes(`${selector[hour]} { ${art(hour, 2400)} }`), `${hour} at 2400`);
    }
    for (const size of [1200, 2400]) {
      assert.ok(statSync(new URL(`../assets/painted/camelback-${hour}-${size}.webp`, import.meta.url)).size > 10_000, `${hour} ${size} exists`);
    }
  }
});

/**
 * Run the page's <head> script the way a browser would, at a moment, and
 * report what it put on <html> and which picture it asked for early.
 * @param {Date} when
 * @param {{ search?: string, theme?: string, width?: number }} [opts]
 */
function headPick(when, { search = '', theme = 'light', width = 1440 } = {}) {
  const script = HOME.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1] ?? '';
  /** @type {Record<string, string>} */
  const attrs = {};
  /** @type {{ href?: string, rel?: string, as?: string }[]} */
  const links = [];
  const at = when.getTime();
  class Clock extends Date {
    /** @param {any[]} args */
    constructor(...args) {
      if (args.length) super(.../** @type {[number]} */ (args));
      else super(at);
    }

    static now() { return at; }
  }
  const root = {
    classList: { add() {}, remove() {}, contains: () => true },
    setAttribute: (/** @type {string} */ k, /** @type {string} */ v) => { attrs[k] = v; },
  };
  const sandbox = {
    Date: Clock,
    document: {
      documentElement: root,
      querySelector: () => ({ setAttribute() {} }),
      createElement: () => ({ setAttribute() {} }),
      head: { appendChild: (/** @type {{ href?: string }} */ el) => { links.push(el); } },
    },
    localStorage: { getItem: () => theme },
    location: { search },
    window: { matchMedia: () => ({ matches: false }), innerWidth: width },
    setTimeout: () => 0,
  };
  runInNewContext(script, sandbox);
  return { day: attrs['data-day'], dusk: attrs['data-dusk'], theme: attrs['data-theme'], preload: links[0]?.href };
}

test('the head script picks the same hours as hourFor, for every hour of a winter and a summer day', () => {
  for (const [m, d] of [[1, 15], [6, 14], [6, 15], [8, 1], [9, 30], [10, 1]]) {
    for (let h = 0; h < 24; h++) {
      const at = phx(2026, m, d, h, 30);
      const got = headPick(at);
      assert.equal(got.day, hourFor('light', at), `light at ${m}/${d} ${h}:30`);
      assert.equal(got.dusk, hourFor('dark', at), `dark at ${m}/${d} ${h}:30`);
    }
  }
});

test('the head script honours ?hour= the way pickHours does, and preloads the file the stylesheet will ask for', () => {
  const noon = phx(2026, 11, 14, 12);
  for (const search of ['', '?hour=monsoon', '?hour=golden', '?hour=night&x=1', '?a=1&hour=dusk', '?hour=nope', '?hour=Monsoon', '?hour=monsoons']) {
    const want = pickHours(noon, search);
    const got = headPick(noon, { search });
    assert.deepEqual({ light: got.day, dark: got.dusk }, want, search || '(no query)');
  }
  assert.equal(headPick(noon, { theme: 'light', width: 1440 }).preload, 'assets/painted/camelback-morning-2400.webp');
  assert.equal(headPick(noon, { theme: 'dark', width: 390 }).preload, 'assets/painted/camelback-dusk-1200.webp');
  assert.equal(headPick(noon, { theme: 'dark', width: 899, search: '?hour=night' }).preload, 'assets/painted/camelback-night-1200.webp');
  assert.equal(headPick(noon, { theme: 'dark', width: 900, search: '?hour=night' }).preload, 'assets/painted/camelback-night-2400.webp');
  // every preloaded name is one the stylesheet draws
  assert.ok(CSS.includes('camelback-night-2400.webp') && CSS.includes('camelback-dusk-1200.webp'));
});

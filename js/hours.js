// @ts-check
/**
 * Which painting of Camelback the homepage's closing band shows. There are
 * five, all of the same place (scripts/paint/camelback.js): two for the light
 * theme and three for the dark one. The theme picks the family, and the clock
 * in Phoenix picks the hour within it. No DOM here: tests/hours.test.mjs runs
 * this in Node, and js/plate.js does the swapping.
 *
 * A new file rather than more of arizona.js, for the reason given there: a
 * visitor can hold a cached copy of an older module, and one missing named
 * export stops everything that imports it from loading.
 */

/** @typedef {'morning' | 'golden' | 'dusk' | 'night' | 'monsoon'} Hour */
/** @typedef {'light' | 'dark'} Family */
/**
 * @typedef {object} HourInfo
 * @property {Family} family  the theme this painting's paper matches
 * @property {string} lead    the caption's first sentence
 * @property {string} alt     the picture, for someone who can't see it
 */

/**
 * The file for each is assets/painted/camelback-<name>-<1200|2400>.<webp|jpg>.
 * Morning and dusk are the two the HTML carries, so their words here must
 * match index.html (tests/hours.test.mjs holds them together).
 * @type {Record<Hour, HourInfo>}
 */
export const HOURS = {
  morning: {
    family: 'light',
    lead: 'Camelback at first light.',
    alt: 'A pastel drawing of Camelback Mountain at first light: three hot-air balloons over the valley, saguaros, a palo verde in bloom, and a quail leading her chicks.',
  },
  golden: {
    family: 'light',
    lead: 'Camelback at golden hour.',
    alt: 'A pastel drawing of Camelback Mountain at golden hour: the sun low in the west, two gold clouds, long shadows falling east, saguaros, and a quail leading her chicks.',
  },
  dusk: {
    family: 'dark',
    lead: 'Camelback at last light.',
    alt: 'A pastel drawing of Camelback Mountain at last light: the valley\'s lights coming on, headlamps climbing the trail, a young moon, and saguaros rimmed in orange.',
  },
  night: {
    family: 'dark',
    lead: 'Camelback in the small hours.',
    alt: 'A pastel drawing of Camelback Mountain in the small hours: no moon, the Milky Way rising behind the summit, a meteor, and half the valley\'s windows dark.',
  },
  monsoon: {
    family: 'dark',
    lead: 'Camelback under a monsoon storm.',
    alt: 'A pastel drawing of Camelback Mountain under a monsoon storm: a thunderhead behind the ridge, rain falling to the east, and two bolts of lightning over the lit valley.',
  },
};

const NAMES = /** @type {Hour[]} */ (Object.keys(HOURS));

// The time zone database knows Arizona skips daylight saving; nothing here hard-codes UTC-7.
const PHOENIX_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Phoenix',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  hourCycle: 'h23',
});

/**
 * The date and hour on a wall clock in Phoenix.
 * @param {Date} date
 * @returns {{ month: number, day: number, hour: number }} month 1 to 12, hour 0 to 23
 */
export function phoenixParts(date) {
  const got = { month: 1, day: 1, hour: 0 };
  for (const { type, value } of PHOENIX_PARTS.formatToParts(date)) {
    if (type === 'month' || type === 'day' || type === 'hour') got[type] = Number(value) % (type === 'hour' ? 24 : 100);
  }
  return got;
}

/**
 * Arizona's monsoon season as the National Weather Service defines it:
 * 15 June to 30 September, whatever the weather does.
 * @param {number} month 1 to 12
 * @param {number} day
 */
export function isMonsoonSeason(month, day) {
  return (month === 6 && day >= 15) || month === 7 || month === 8 || month === 9;
}

/**
 * The painting for a theme at a moment.
 *
 * Light has no night, so its two pictures split the clock where the sun's side
 * changes: morning from 3 AM to 1 PM, golden hour for the rest. Dark is dusk
 * by default, the small hours from 10 PM to 5 AM, and from mid-afternoon to
 * 10 PM in monsoon season it is the storm, because that is when they build.
 * @param {Family} family
 * @param {Date} date
 * @returns {Hour}
 */
export function hourFor(family, date) {
  const { month, day, hour } = phoenixParts(date);
  if (family === 'light') return hour >= 3 && hour < 13 ? 'morning' : 'golden';
  if (hour >= 22 || hour < 5) return 'night';
  if (hour >= 15 && isMonsoonSeason(month, day)) return 'monsoon';
  return 'dusk';
}

/**
 * An hour asked for by name in the address ("?hour=monsoon"), so a painting
 * can be seen when the clock says otherwise. Anything that isn't one of the
 * five names is ignored.
 * @param {string} search location.search
 * @returns {Hour | null}
 */
export function hourFromQuery(search) {
  const asked = new URLSearchParams(search).get('hour');
  return NAMES.find((name) => name === asked) ?? null;
}

/**
 * Both themes' paintings at once: the page holds one picture per theme and
 * CSS shows the right one, so a theme switch needs no script. A forced hour
 * replaces the pick in its own family and leaves the other to the clock.
 * @param {Date} date
 * @param {string} [search] location.search
 * @returns {Record<Family, Hour>}
 */
export function pickHours(date, search = '') {
  const forced = hourFromQuery(search);
  /** @param {Family} family */
  const pick = (family) => (forced && HOURS[forced].family === family ? forced : hourFor(family, date));
  return { light: pick('light'), dark: pick('dark') };
}

/**
 * Where an hour's files are, relative to the homepage.
 * @param {Hour} hour
 * @returns {{ webp: string, jpg: string, src: string }} two srcsets and the plain fallback
 */
export function hourFiles(hour) {
  const base = `assets/painted/camelback-${hour}`;
  return {
    webp: `${base}-1200.webp 1200w, ${base}-2400.webp 2400w`,
    jpg: `${base}-1200.jpg 1200w, ${base}-2400.jpg 2400w`,
    src: `${base}-1200.jpg`,
  };
}

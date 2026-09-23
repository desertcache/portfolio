// @ts-check
/**
 * Pure helpers: no DOM, no globals. Everything here runs in Node as well as
 * the browser, which is what makes it testable (see tests/lib.test.mjs).
 * Rule of thumb for this codebase: if a function can be pure, it lives here.
 */

/**
 * Parse a CSS hex colour into 0..1 channels for a WebGL uniform.
 * @param {string} hex "#abc" or "#aabbcc" (surrounding whitespace allowed)
 * @returns {[number, number, number] | null} null if it isn't a hex colour
 */
export function hexToRgb(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * @typedef {object} Stat
 * @property {string} prefix   text before the number ("~")
 * @property {number} value    the number itself (6846)
 * @property {number} decimals digits after the decimal point
 * @property {string} suffix   text after the number ("%", "+")
 * @property {boolean} grouped whether the source used thousands separators
 */

/**
 * Split a display number like "6,846", "94%", "800+" or "~80%" into parts, so
 * it can count up from zero and still look like itself on every frame.
 * Anything that isn't exactly one number ("1–7 days", "5+ → 1") returns null
 * and is left alone.
 * @param {string} text
 * @returns {Stat | null}
 */
export function parseStat(text) {
  const m = /^([^\d]*?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?([^\d]*)$/.exec(text.trim());
  if (!m) return null;
  const [, prefix, int, frac = '', suffix] = m;
  return {
    prefix,
    value: Number(int.replace(/,/g, '') + (frac ? `.${frac}` : '')),
    decimals: frac.length,
    suffix,
    grouped: int.includes(','),
  };
}

/**
 * Render `n` in the shape of a parsed stat.
 * @param {Stat} stat
 * @param {number} n
 * @returns {string}
 */
export function formatStat(stat, n) {
  const [int, frac] = n.toFixed(stat.decimals).split('.');
  const body = stat.grouped ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : int;
  return stat.prefix + body + (frac ? `.${frac}` : '') + stat.suffix;
}

/**
 * @typedef {object} Post
 * @property {string} title
 * @property {string} date  YYYY-MM-DD
 * @property {string} href  relative to blog/
 */

/**
 * Newest well-formed post in a blog/posts.json payload, or null.
 * posts.json is written upstream (scripts/ingest_digest.py), so its shape is
 * validated rather than trusted, and any href with a scheme ("javascript:",
 * "https:") or a protocol-relative "//" is rejected: only same-site paths.
 * @param {unknown} data parsed JSON
 * @returns {Post | null}
 */
export function latestPost(data) {
  if (!data || typeof data !== 'object') return null;
  const posts = /** @type {{ posts?: unknown }} */ (data).posts;
  if (!Array.isArray(posts)) return null;
  /** @type {Post[]} */
  const valid = [];
  for (const p of posts) {
    if (!p || typeof p !== 'object') continue;
    const { title, date, href } = /** @type {Record<string, unknown>} */ (p);
    if (typeof title !== 'string' || !title.trim()) continue;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (typeof href !== 'string' || !href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) continue;
    valid.push({ title, date, href });
  }
  valid.sort((a, b) => b.date.localeCompare(a.date));
  return valid[0] ?? null;
}

/**
 * "2026-08-16" → "August 16, 2026". Noon UTC plus timeZone:"UTC" stops a bare
 * date from sliding back a day for anyone west of Greenwich.
 * @param {string} iso
 * @returns {string}
 */
export function formatPostDate(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Which case study, if any, a URL hash points at.
 * @param {string} hash e.g. "#cs-wfm"
 * @param {Iterable<string>} ids the case-study ids that exist on the page
 * @returns {string | null}
 */
export function caseStudyFromHash(hash, ids) {
  const m = /^#cs-([a-z0-9-]+)$/.exec(hash);
  if (!m) return null;
  for (const id of ids) if (id === m[1]) return id;
  return null;
}

/**
 * The hero's map readout: pointer position across the hero (0..1 each way)
 * to coordinates around downtown Phoenix, as if the hero were a map tile
 * about 9 km across.
 * @param {number} x 0 = left edge, 1 = right edge
 * @param {number} y 0 = top edge, 1 = bottom edge
 * @returns {{ lat: string, lon: string }}
 */
export function coordsFor(x, y) {
  const clamp = (/** @type {number} */ v) => Math.min(1, Math.max(0, v));
  const lat = 33.4484 + (0.5 - clamp(y)) * 0.06;
  const lon = 112.074 - (clamp(x) - 0.5) * 0.1; // west longitude shrinks as you move east
  return { lat: `${lat.toFixed(4)}° N`, lon: `${lon.toFixed(4)}° W` };
}

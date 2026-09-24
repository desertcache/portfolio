// @ts-check
/**
 * Pure helpers for the Hill Money Watch editions: reading blog/posts.json,
 * finding an edition's neighbours, and the small text jobs the archive and
 * the posts share. No DOM here, so all of it runs under `npm test`.
 *
 * Its own module rather than more of lib.js on purpose: a visitor can still
 * hold a cached lib.js from before these existed, and a named import that a
 * stale module doesn't export stops the whole blog script from loading. A new
 * file has no stale copy.
 */

/** @typedef {import('./lib.js').Post} Post */

/**
 * @typedef {Post & { summary: string }} Edition  a post as the archive shows it
 */

/**
 * Every well-formed post in a blog/posts.json payload, newest first.
 * posts.json is written upstream (scripts/ingest_digest.py), so its shape is
 * validated rather than trusted, and any href with a scheme ("javascript:",
 * "https:") or a protocol-relative "//" is rejected: only same-site paths.
 * A missing or non-string summary becomes "" rather than dropping the post.
 * @param {unknown} data parsed JSON
 * @returns {Edition[]}
 */
export function validPosts(data) {
  if (!data || typeof data !== 'object') return [];
  const posts = /** @type {{ posts?: unknown }} */ (data).posts;
  if (!Array.isArray(posts)) return [];
  /** @type {Edition[]} */
  const valid = [];
  for (const p of posts) {
    if (!p || typeof p !== 'object') continue;
    const { title, date, href, summary } = /** @type {Record<string, unknown>} */ (p);
    if (typeof title !== 'string' || !title.trim()) continue;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (typeof href !== 'string' || !href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) continue;
    valid.push({ title, date, href, summary: typeof summary === 'string' ? summary : '' });
  }
  valid.sort((a, b) => b.date.localeCompare(a.date));
  return valid;
}

/**
 * The editions either side of one post, from a newest-first list.
 * Posts are matched on the file name of their href, so it doesn't matter
 * which directory the caller later resolves the hrefs against.
 * @template {Post} T
 * @param {T[]} posts newest first, as validPosts returns them
 * @param {string} slug e.g. "2026-08-16-hill-money-watch"
 * @returns {{ newer: T | null, older: T | null }}
 */
export function postNeighbors(posts, slug) {
  const i = posts.findIndex((p) => fileSlug(p.href) === slug);
  if (i === -1) return { newer: null, older: null };
  return { newer: posts[i - 1] ?? null, older: posts[i + 1] ?? null };
}

/** @param {string} href */
function fileSlug(href) {
  const file = href.split(/[?#]/)[0].split('/').pop() ?? '';
  return file.replace(/\.html$/, '');
}

/**
 * A post title without the series name, for lists that already carry it:
 * "Hill Money Watch — August 16, 2026" → "August 16, 2026". Any other title
 * comes back unchanged.
 * @param {string} title
 * @returns {string}
 */
export function editionTitle(title) {
  const short = title.replace(/^\s*Hill Money Watch\s*[—–-]\s*/, '').trim();
  return short || title;
}

/**
 * Whole minutes to read `text` at `wpm` words a minute, never less than one.
 * @param {string} text
 * @param {number} [wpm]
 * @returns {number}
 */
export function readingMinutes(text, wpm = 230) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / wpm));
}

// @ts-check
/**
 * Entry point for the Hill Money Watch pages: the archive (blog/index.html)
 * and every post (blog/posts/*.html). Built like js/main.js: each feature runs
 * on its own, so one failure can't take the others down. Nothing here is
 * needed to read a post; JS adds the archive list, links to the editions on
 * either side, and a reading time.
 */
import { initTheme } from './theme.js';
import { initNav } from './chrome.js';
import { validPosts, postNeighbors, editionTitle, readingMinutes } from './editions.js';

// Tells the <head> safety net that JS arrived.
document.documentElement.classList.add('js-ready');

/** @typedef {import('./editions.js').Edition} Edition */

/**
 * Where blog/posts.json is, from `data-index` on <main> (each page gives the
 * path relative to itself). Every href inside the file is relative to it.
 * @returns {URL | null}
 */
function postsIndexUrl() {
  const path = document.getElementById('main')?.dataset.index;
  return path ? new URL(path, window.location.href) : null;
}

/**
 * @param {URL} url
 * @returns {Promise<Edition[]>} newest first
 */
async function fetchEditions(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`posts.json: HTTP ${res.status}`);
  return validPosts(await res.json());
}

/**
 * Element factory. Text only ever goes in as textContent: posts.json is
 * written by a separate pipeline and must not be able to inject markup.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** @param {string} text */
function arrow(text) {
  const span = el('span', 'arrow', text);
  span.setAttribute('aria-hidden', 'true');
  return span;
}

/**
 * The newest edition, as the archive's night-room card.
 * @param {Edition} post
 * @param {number} number edition number, oldest = 1
 * @param {URL} base
 */
function latestCard(post, number, base) {
  const card = el('a', 'lab latest');
  card.href = new URL(post.href, base).href;
  const kicker = el('span', 'latest-kicker', 'Latest edition');
  kicker.append(el('span', 'latest-no', `No. ${number}`));
  const title = el('h2', 'latest-title', editionTitle(post.title));
  title.id = 'latest-title';
  card.setAttribute('aria-labelledby', title.id);
  const cta = el('span', 'latest-cta', 'Read the edition');
  cta.append(arrow('→'));
  card.append(kicker, title);
  if (post.summary) card.append(el('p', 'latest-summary', post.summary));
  card.append(cta);
  return card;
}

/**
 * One row of the "Earlier editions" list.
 * @param {Edition} post
 * @param {number} number edition number, oldest = 1
 * @param {URL} base
 */
function archiveRow(post, number, base) {
  const li = el('li');
  const row = el('a', 'archive-row');
  row.href = new URL(post.href, base).href;
  const title = el('h3', 'archive-title', editionTitle(post.title));
  title.id = `edition-${number}`;
  row.setAttribute('aria-labelledby', title.id);
  const main = el('span', 'archive-main');
  main.append(title);
  if (post.summary) main.append(el('p', 'archive-summary', post.summary));
  row.append(el('span', 'archive-no', `No. ${number}`), main, arrow('→'));
  li.append(row);
  return li;
}

/** Archive page: the latest edition as a feature, the rest as a list. */
async function initArchive() {
  const slot = document.getElementById('latest');
  const list = document.getElementById('archive-list');
  const url = postsIndexUrl();
  if (!slot || !list || !url) return;
  const status = document.getElementById('archive-status');
  let editions;
  try {
    editions = await fetchEditions(url);
  } catch (err) {
    if (status) status.textContent = 'The edition list didn’t load. Refresh the page to try again.';
    throw err;
  }
  if (!editions.length) {
    if (status) status.textContent = 'No editions published yet.';
    return;
  }
  const [newest, ...earlier] = editions;
  slot.replaceChildren(latestCard(newest, editions.length, url));
  if (earlier.length) {
    list.replaceChildren(...earlier.map((post, i) => archiveRow(post, earlier.length - i, url)));
    document.getElementById('earlier')?.removeAttribute('hidden');
  }
}

/**
 * @param {Edition | null} post
 * @param {string} label
 * @param {URL} base
 * @param {boolean} next  right-hand card (text aligned right on wide screens)
 */
function editionLink(post, label, base, next) {
  const a = el('a', next ? 'cs-next' : undefined);
  a.href = post ? new URL(post.href, base).href : new URL('index.html', base).href;
  a.append(
    el('span', 'cs-nav-k', post ? label : 'Archive'),
    el('span', 'cs-nav-t', post ? editionTitle(post.title) : 'All editions'),
  );
  return a;
}

/** Post pages: link the editions on either side of this one. */
async function initEditionNav() {
  const nav = document.getElementById('edition-nav');
  const slug = document.querySelector('[data-slug]')?.getAttribute('data-slug');
  const url = postsIndexUrl();
  if (!nav || !slug || !url) return;
  const { newer, older } = postNeighbors(await fetchEditions(url), slug);
  if (!newer && !older) return; // the only edition: the static archive link stays
  nav.replaceChildren(
    editionLink(older, 'Earlier edition', url, false),
    editionLink(newer, 'Later edition', url, true),
  );
}

/** "14 min read", counted from the post body (skipping its <style>). */
function initReadTime() {
  const out = document.getElementById('read-time');
  const body = document.querySelector('.post-body');
  if (!out || !body) return;
  const text = [...body.children]
    .filter((node) => node.tagName !== 'STYLE' && node.tagName !== 'SCRIPT')
    .map((node) => node.textContent ?? '')
    .join(' ');
  out.textContent = `${readingMinutes(text)} min read`;
  out.hidden = false;
}

/** @type {Array<[string, () => unknown]>} */
const features = [
  ['theme', initTheme],
  ['nav', initNav],
  ['read time', initReadTime],
  ['archive', initArchive],
  ['edition nav', initEditionNav],
];

for (const [name, init] of features) {
  try {
    const result = init();
    if (result instanceof Promise) result.catch((err) => console.error(`[blog] ${name} failed:`, err));
  } catch (err) {
    console.error(`[blog] ${name} failed:`, err);
  }
}

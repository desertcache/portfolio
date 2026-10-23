// Every link on every public page resolves: relative hrefs and srcs, SVG sprite
// references, and absolute links back into the site, down to the #id they name.
// Run: npm test   (Node's built-in runner, no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const SITE = 'https://desertcache.github.io/portfolio/';
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const htmlIn = (dir) => readdirSync(new URL(dir, ROOT)).filter((f) => f.endsWith('.html')).map((f) => `${dir}${f}`);

const PAGES = [
  'index.html', 'arcade.html', 'starship.html', 'skincare.html', '404.html',
  ...htmlIn('work/'), 'blog/index.html', ...htmlIn('blog/posts/'), ...htmlIn('blog/research/'),
];

/**
 * Every URL a page's markup points at, outside its scripts (which build their own).
 * @param {string} html
 */
function urlsIn(html) {
  const markup = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/g, '$1')
    .replace(/(<style\b[^>]*>)[\s\S]*?<\/style>/g, '$1');
  const urls = [];
  for (const [, attr, value] of markup.matchAll(/\s(href|src|srcset|poster|content)="([^"]*)"/g)) {
    if (attr === 'content') {
      if (value.startsWith(SITE)) urls.push(value); // og:url, og:image
      continue;
    }
    if (attr === 'srcset') urls.push(...value.split(',').map((s) => s.trim().split(/\s+/)[0]));
    else urls.push(value);
  }
  return urls;
}

/** ids (and SVG symbol ids) a file defines. @param {string} path */
const idsOf = (() => {
  const cache = new Map();
  return (path) => {
    if (!cache.has(path)) cache.set(path, new Set([...read(path).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
    return cache.get(path);
  };
})();

/**
 * The repo file a URL on `page` names, and the #id in it, or null for a URL that
 * leaves the site (another origin, mailto:, a bare #id handled separately).
 * @param {string} page @param {string} url
 */
function target(page, url) {
  if (/^(?:mailto:|tel:|javascript:|data:|blob:)/.test(url) || url === '') return null;
  let resolved;
  if (url.startsWith(SITE)) resolved = new URL(url.slice(SITE.length), 'file:///site/');
  else if (/^[a-z]+:\/\//i.test(url) || url.startsWith('//')) return null;
  else if (url.startsWith('/portfolio/')) resolved = new URL(url.slice('/portfolio/'.length), 'file:///site/');
  else resolved = new URL(url, `file:///site/${page}`);
  let path = decodeURIComponent(resolved.pathname.replace(/^\/site\//, ''));
  if (path === '' || path.endsWith('/')) path += 'index.html';
  return { path, id: decodeURIComponent(resolved.hash.slice(1)) };
}

test('every relative link, image, script and sprite on every page points at a file in the repo', () => {
  const missing = [];
  for (const page of PAGES) {
    for (const url of urlsIn(read(page))) {
      if (url.startsWith('#')) continue;
      const t = target(page, url);
      if (!t) continue;
      const file = new URL(t.path, ROOT);
      if (!existsSync(file) || !statSync(file).isFile()) missing.push(`${page}: ${url}`);
    }
  }
  assert.deepEqual(missing, [], `links to files that don't exist:\n${missing.join('\n')}`);
});

// Pages whose script reads the hash as state rather than scrolling to an id: the
// ledger's scoreboard links (#DASH, #UBER...) select a company's chart, so each must
// name a company in the ledger's data instead.
const HASH_ROUTES = {
  'blog/research/delivery-ipo-ledger.html': new Set(
    JSON.parse(read('blog/research/delivery-ipo-ledger.json')).map((c) => c.id),
  ),
};

test('every #id a link names exists in the page it opens', () => {
  const broken = [];
  for (const page of PAGES) {
    for (const url of urlsIn(read(page))) {
      const t = url.startsWith('#') ? { path: page, id: decodeURIComponent(url.slice(1)) } : target(page, url);
      if (!t || !t.id || !/\.(?:html|svg)$/.test(t.path) || !existsSync(new URL(t.path, ROOT))) continue;
      if (idsOf(t.path).has(t.id) || HASH_ROUTES[t.path]?.has(t.id)) continue;
      broken.push(`${page}: ${url}`);
    }
  }
  assert.deepEqual(broken, [], `links to ids that don't exist:\n${broken.join('\n')}`);
});

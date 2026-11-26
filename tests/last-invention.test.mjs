// The Last Invention: last-invention/index.html is built from scripts/last-invention/.
// These checks keep the page and its source together, and the page on the site's rules.
// Run: npm test   (rebuild the page with: node scripts/last-invention/build.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const lf = (s) => s.replace(/\r\n/g, '\n');
const PAGE = lf(read('last-invention/index.html'));

test('the talk page is the current build of its source', () => {
  const src = readdirSync(new URL('../scripts/last-invention/src/', import.meta.url)).filter((f) => /\.(js|css)$/.test(f));
  assert.ok(src.length >= 7, 'scripts/last-invention/src is missing files');
  for (const f of [...src.map((f) => `scripts/last-invention/src/${f}`), 'scripts/last-invention/portfolio.css']) {
    assert.ok(PAGE.includes(lf(read(f))), `last-invention/index.html is older than ${f}: run node scripts/last-invention/build.js`);
  }
});

test('the talk page loads nothing from another host, and its fonts are the site\'s own files', () => {
  for (const [, url] of PAGE.matchAll(/\s(?:src|href)="(https?:[^"]+)"/g)) {
    assert.match(url, /^https:\/\/desertcache\.github\.io\/portfolio\//, `last-invention/index.html loads ${url}`);
  }
  const fonts = [...PAGE.matchAll(/url\("(\.\.\/assets\/fonts\/[^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(fonts.length >= 8, 'the @font-face rules from portfolio.css are missing');
  for (const url of fonts) {
    assert.ok(readFileSync(new URL(`../last-invention/${url}`, import.meta.url)).length > 1000, `${url} is missing`);
  }
});

test('the Lab links the talk, and its poster and link-preview image exist', () => {
  assert.match(read('index.html'), /<a class="lab-poster" href="last-invention\/"/);
  for (const f of ['assets/last-invention-poster.webp', 'assets/last-invention-poster.jpg', 'assets/og-last-invention.jpg']) {
    assert.ok(existsSync(new URL(`../${f}`, import.meta.url)), `${f} is missing`);
  }
  assert.match(read('sitemap.xml'), /<loc>https:\/\/desertcache\.github\.io\/portfolio\/last-invention\/<\/loc>/);
});

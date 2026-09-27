// Content checks for index.html and the work samples: the copy rules and the
// wiring between work cards and their case-study dialogs.
// Run: npm test   (Node's built-in runner, no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const HOME = read('index.html');
const WORK_SAMPLES = readdirSync(new URL('../work/', import.meta.url))
  .filter((f) => f.endsWith('.html'))
  .map((f) => `work/${f}`);

/** @param {string} s */
function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * What a reader can see: page text (SVG labels included), the tab title, and
 * the descriptions that show up in search results and link previews.
 * @param {string} html
 */
function readerText(html) {
  const meta = [...html.matchAll(/<meta\s+(?:name|property)="(?:description|og:[a-z:_]+|twitter:[a-z:_]+)"\s+content="([^"]*)"/g)]
    .map((m) => m[1]);
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities([...meta, body].join('\n'));
}

test('the homepage and the work samples show no em dash anywhere a reader looks', () => {
  for (const path of ['index.html', ...WORK_SAMPLES]) {
    const text = readerText(read(path));
    const i = text.indexOf('—');
    assert.equal(i, -1, `${path}: em dash in "${text.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, ' ')}"`);
  }
});

test('every in-page link on the homepage points at an element that exists', () => {
  const ids = new Set([...HOME.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const targets = [...HOME.matchAll(/\shref="#([^"]+)"/g)].map((m) => m[1]);
  assert.ok(targets.length > 0);
  for (const t of targets) assert.ok(ids.has(t), `href="#${t}" has no matching id`);
  for (const [, cs] of HOME.matchAll(/\sdata-cs="([^"]+)"/g)) {
    assert.ok(ids.has(`cs-${cs}`), `data-cs="${cs}" has no dialog#cs-${cs}`);
  }
});

test('each work card opens its own case study, and the case studies link in one loop in card order', () => {
  const cards = [...HOME.matchAll(/<article class="card[^"]*" id="card-([a-z0-9-]+)">/g)].map((m) => m[1]);
  const dialogs = [...HOME.matchAll(/<dialog class="cs" id="cs-([a-z0-9-]+)"[\s\S]*?<\/dialog>/g)]
    .map((m) => ({ id: m[1], html: m[0] }));
  assert.ok(cards.length >= 2, 'expected a grid of work cards');
  assert.deepEqual(dialogs.map((d) => d.id), cards, 'one dialog per card, in card order');
  for (const id of cards) {
    assert.match(HOME, new RegExp(`<a class="card-link" href="#cs-${id}" data-cs="${id}">`), `card-${id} link`);
  }
  dialogs.forEach(({ id, html }, i) => {
    const prev = cards[(i - 1 + cards.length) % cards.length];
    const next = cards[(i + 1) % cards.length];
    assert.match(html, new RegExp(`class="cs-close" href="#card-${id}"`), `cs-${id} close link`);
    assert.match(html, new RegExp(`class="cs-prev" href="#cs-${prev}" data-cs="${prev}"`), `cs-${id} previous`);
    assert.match(html, new RegExp(`class="cs-next" href="#cs-${next}" data-cs="${next}"`), `cs-${id} next`);
    assert.match(html, new RegExp(`<h3 class="cs-title" id="cs-${id}-title">`), `cs-${id} title id`);
  });
});

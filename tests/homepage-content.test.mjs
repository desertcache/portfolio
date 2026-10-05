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

test('the card from Anthropic\'s Claude Code team is quoted word for word, and never inflated', () => {
  const text = readerText(HOME).replace(/\s+/g, ' ');
  for (const line of [
    "We're making it official: you're a Claude Code power user.",
    "You're one of Claude Code's top users, and we wouldn't be here without you. Thank you for building with us.",
  ]) {
    assert.ok(text.includes(line), `the card's words, exactly: "${line}"`);
  }
  assert.doesNotMatch(text, /top\s+(?:1|one)\s*(?:%|percent)/i, 'the card says "top users", nothing more');
});

test('training is counted in people, never leaders', () => {
  for (const path of ['index.html', ...WORK_SAMPLES]) {
    assert.doesNotMatch(readerText(read(path)), /800\+\s*leaders/i, `${path} says "800+ leaders"`);
  }
});

test('the blog pages and the posts index show no em dash anywhere a reader looks', () => {
  const dir = (d) => readdirSync(new URL(`../${d}/`, import.meta.url)).filter((f) => f.endsWith('.html')).map((f) => `${d}/${f}`);
  for (const path of ['blog/index.html', ...dir('blog/posts'), ...dir('blog/research')]) {
    const text = readerText(read(path));
    const i = text.indexOf('—');
    assert.equal(i, -1, `${path}: em dash in "${text.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, ' ')}"`);
  }
  // posts.json feeds the homepage's Lab card and the archive rows.
  for (const post of JSON.parse(read('blog/posts.json')).posts) {
    for (const field of ['title', 'summary']) {
      assert.ok(!String(post[field]).includes('—'), `posts.json ${post.slug}.${field}: ${post[field]}`);
    }
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

test('the homepage and the Answer Finder write-up quote the same answer and phrasing counts', () => {
  // These go stale whenever desertcache/ask's bank grows; the live box reports its own count, so
  // update both pages together (data/bank.json there has the numbers).
  const texts = [readerText(HOME), readerText(read('work/answer-finder.html'))].map((t) => t.replace(/\s+/g, ' '));
  const answers = new Set(texts.flatMap((t) => [...t.matchAll(/\b(\d+) answers\b/g)].map((m) => m[1])));
  const phrasings = new Set(texts.flatMap((t) => [...t.matchAll(/\b(\d+) (?:sample )?phrasings\b|phrasings, (\d+) in all/g)].map((m) => m[1] ?? m[2])));
  assert.equal(answers.size, 1, `answer counts disagree: ${[...answers].join(', ')}`);
  assert.equal(phrasings.size, 1, `phrasing counts disagree: ${[...phrasings].join(', ')}`);
});

test('"See the work" and the nav\'s Work link start at the featured program, not past it', () => {
  assert.match(HOME, /<a class="btn btn-solid" href="#featured">See the work/, 'the hero button');
  assert.match(HOME, /<nav class="nav-links"[^>]*>\s*<a href="#featured">Work<\/a>/, 'the nav link');
  assert.ok(HOME.indexOf('id="featured"') < HOME.indexOf('id="work"'), 'the featured program comes first');
});

test('the phone section menu links every section in page order, numbered like the page', () => {
  const menu = HOME.match(/<nav class="nav-menu"[\s\S]*?<\/nav>/)?.[0] ?? '';
  const items = [...menu.matchAll(/<a href="#([a-z-]+)"><span class="nav-menu-num"[^>]*>(\d*)<\/span>([^<]+)<\/a>/g)]
    .map(([, id, num, label]) => ({ id, num, label }));
  const sections = [...HOME.matchAll(/<section class="[^"]*" id="([a-z-]+)"/g)].map((m) => m[1]).filter((id) => id !== 'top');
  assert.deepEqual(items.map((i) => i.id), sections, 'one link per section after the hero, in page order');
  for (const { id, num, label } of items) {
    const html = HOME.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`))?.[0] ?? '';
    const eyebrow = html.match(/<p class="eyebrow"><span class="eyebrow-num">(\d+)<\/span> ([^<]+)<\/p>/);
    if (eyebrow) assert.deepEqual([num, label], [eyebrow[1], eyebrow[2]], `#${id} reads like its section's eyebrow`);
    else assert.equal(num, '', `#${id} has no section number, so its menu item shows none`);
  }
});

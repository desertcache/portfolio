// Content checks for index.html and the work samples: the copy rules and the
// wiring between work cards and their case-study dialogs.
// Run: npm test   (Node's built-in runner, no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

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

test('every page dates the PR approver role the same way', () => {
  // The 9/30 accuracy pass: consultative partner to 5 builders since September 2025, their
  // primary PR approver since February 2026 (GitHub's review record starts then).
  const dates = new Map();
  for (const path of ['index.html', ...WORK_SAMPLES]) {
    const text = readerText(read(path)).replace(/\s+/g, ' ');
    for (const [, date] of text.matchAll(/approver(?:(?!partner)[^.])*?since ([A-Z][a-z]+ \d{4})/g)) dates.set(`${path}: ${date}`, date);
  }
  assert.ok(dates.size >= 2, 'the homepage and the adoption write-up both date it');
  assert.deepEqual([...new Set(dates.values())], ['February 2026'], [...dates.keys()].join('; '));
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

test('the side pages and the 404 page show no em dash anywhere a reader looks', () => {
  for (const path of ['arcade.html', 'starship.html', 'skincare.html', '404.html']) {
    const text = readerText(read(path));
    const i = text.indexOf('—');
    assert.equal(i, -1, `${path}: em dash in "${text.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, ' ')}"`);
  }
});

test('every page a link can be pasted from shows a link preview', () => {
  // Applications and hiring-manager notes link the work samples directly; a pasted
  // link with no card looks broken in Slack, LinkedIn and iMessage.
  const dir = (d) => readdirSync(new URL(`../${d}/`, import.meta.url)).filter((f) => f.endsWith('.html')).map((f) => `${d}/${f}`);
  for (const path of ['index.html', 'arcade.html', 'starship.html', 'skincare.html', ...WORK_SAMPLES, 'blog/index.html', ...dir('blog/posts'), ...dir('blog/research')]) {
    const html = read(path);
    for (const tag of ['og:title', 'og:description', 'og:image', 'og:url']) {
      assert.match(html, new RegExp(`<meta\\s+property="${tag}"\\s+content="[^"]+"`), `${path} has no ${tag}`);
    }
    assert.match(html, /<meta\s+property="og:image"\s+content="https:\/\//, `${path}: og:image must be an absolute URL`);
    const image = html.match(/<meta\s+property="og:image"\s+content="https:\/\/desertcache\.github\.io\/portfolio\/([^"]+)"/)?.[1];
    if (image) assert.ok(existsSync(new URL(`../${image}`, import.meta.url)), `${path}: og:image ${image} is not in the repo`);
  }
});

test('the 404 page uses absolute paths, since it is served at whatever URL was missing', () => {
  const html = read('404.html');
  for (const [, attr] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    assert.ok(/^(?:\/portfolio\/|https?:|mailto:|#)/.test(attr), `404.html: relative path "${attr}"`);
  }
});

test('fonts are self-hosted: no page waits on Google Fonts, and every preload points at a real file', () => {
  // The Google stylesheet blocked first paint on every page (the 2026-10-07 audit measured
  // seconds on a cold phone). The faces live in css/site.css and assets/fonts/.
  const dir = (d) => readdirSync(new URL(`../${d}/`, import.meta.url)).filter((f) => f.endsWith('.html')).map((f) => `${d}/${f}`);
  const pages = ['index.html', 'arcade.html', 'starship.html', 'skincare.html', '404.html', ...WORK_SAMPLES,
    'blog/index.html', 'blog/_post.template.html', ...dir('blog/posts'), ...dir('blog/research')];
  for (const path of pages) {
    const html = read(path);
    assert.doesNotMatch(html, /fonts\.(?:googleapis|gstatic)\.com/, `${path} still loads Google Fonts`);
    // One preload, at low priority: it starts the headline font early without beating the
    // stylesheet to the network (two high-priority preloads cost ~230 ms of first paint on slow 4G).
    const preloads = [...html.matchAll(/<link rel="preload" href="([^"]+\.woff2)" as="font" type="font\/woff2" crossorigin fetchpriority="low">/g)].map((m) => m[1]);
    assert.equal(preloads.length, 1, `${path} should preload the Archivo Latin file, at low priority`);
    assert.match(preloads[0], /archivo-latin\.woff2$/, `${path} preloads the wrong font`);
    // The post template's links are written for where its posts land: blog/posts/.
    const base = new URL(`../${path === 'blog/_post.template.html' ? 'blog/posts/_template.html' : path}`, import.meta.url);
    for (const href of preloads) {
      const target = href.startsWith('/portfolio/') ? new URL(`../${href.slice('/portfolio/'.length)}`, import.meta.url) : new URL(href, base);
      assert.ok(readFileSync(target).length > 1000, `${path}: ${href} is missing`);
    }
  }
  for (const [, url] of read('css/site.css').matchAll(/url\("(\.\.\/assets\/fonts\/[^"]+)"\)/g)) {
    assert.ok(readFileSync(new URL(`../css/${url}`, import.meta.url)).length > 1000, `site.css: ${url} is missing`);
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

test('each write-up ends on a "Read next" card, and the cards visit every write-up in one ring', () => {
  const nextOf = new Map();
  for (const path of WORK_SAMPLES) {
    const nav = read(path).match(/<nav class="cs-nav edition-nav" aria-label="More work">([\s\S]*?)<\/nav>/);
    assert.ok(nav, `${path}: no closing nav`);
    const card = nav[1].match(/<a class="cs-next" href="([a-z0-9-]+\.html)"><span class="cs-nav-k">Read next<\/span><span class="cs-nav-t">([^<]+)<\/span><\/a>/);
    assert.ok(card, `${path}: no "Read next" card`);
    const [, href, title] = card;
    const target = `work/${href}`;
    assert.ok(WORK_SAMPLES.includes(target), `${path}: "Read next" points at ${href}, which isn't a write-up`);
    const h1 = read(target).match(/<h1 class="post-title">([^<]+)<\/h1>/)?.[1];
    assert.equal(title, h1, `${path}: the card's title matches ${href}'s headline`);
    nextOf.set(path, target);
  }
  assert.equal(new Set(nextOf.values()).size, WORK_SAMPLES.length, 'every write-up is some card\'s "Read next"');
  const seen = new Set();
  for (let at = WORK_SAMPLES[0]; !seen.has(at); at = nextOf.get(at)) seen.add(at);
  assert.equal(seen.size, WORK_SAMPLES.length, 'following "Read next" from any write-up reaches all of them');
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

test('the Answer Finder trace figure agrees with itself and with the write-up', () => {
  // Fig. 1 is a snapshot of one real turn (desertcache/ask, October 2026). The page loads none
  // of the box's code, so nothing checks it at runtime: these are the checks.
  const page = read('work/answer-finder.html');
  const fig = page.match(/<figure class="trace"[\s\S]*?<\/figure>/)?.[0];
  assert.ok(fig, 'the trace figure is on the page');
  const prose = readerText(page.replace(fig, '')).replace(/\s+/g, ' ');
  const threshold = prose.match(/threshold of (0\.\d+)/)?.[1];
  assert.ok(threshold, 'the write-up states the threshold');

  const bars = (fig.match(/<svg class="trace-vec"[\s\S]*?<\/svg>/)?.[0].match(/<rect /g) ?? []).length;
  const dims = prose.match(/one (\d+)-number vector/)?.[1];
  assert.equal(String(bars), dims, 'one bar per number in the vector');
  assert.match(fig, new RegExp(`Turned it into ${dims} numbers`));

  const rows = [...fig.matchAll(/<li( class="is-best")?><span class="trace-m-text">[^<]+<\/span><span class="trace-bar" style="--w:([\d.]+)%" aria-hidden="true"><\/span><span class="trace-m-score">([\d.]+)<\/span><\/li>/g)]
    .map(([, best, w, shown]) => ({ best: Boolean(best), raw: Number(w) / 100, shown }));
  assert.equal(rows.length, 3, 'three closest answers, as the box shows');
  for (const r of rows) {
    // the box rounds down, so a score just under the bar never shows as the bar
    assert.equal(r.shown, (Math.floor(r.raw * 100) / 100).toFixed(2), `bar ${r.raw} shows as ${r.shown}`);
  }
  assert.deepEqual(rows.map((r) => r.raw), [...rows.map((r) => r.raw)].sort((a, b) => b - a), 'ranked best first');
  assert.ok(rows[0].best && rows.filter((r) => r.best).length === 1, 'the top row, and only it, is the answer');
  assert.ok(rows[0].raw >= Number(threshold), 'the answer clears the bar');
  assert.match(fig, new RegExp(`${rows[0].shown} clears the ${threshold} bar`));
  assert.match(fig, new RegExp(`the ${threshold} bar the best match must clear`), 'the caption names the same bar');
  assert.match(readFileSync(new URL('../work/answer-finder.css', import.meta.url), 'utf8'),
    new RegExp(`left: ${Math.round(Number(threshold) * 100)}%`), 'the dashed line sits at the threshold');
});

test('the copilot write-up\'s access layers follow the order the text proves them in', () => {
  const page = read('work/ai-copilot-rollout.html');
  const fig = page.match(/<figure class="layers"[\s\S]*?<\/figure>/)?.[0];
  assert.ok(fig, 'Fig. 2 is on the page');
  const layers = [...fig.matchAll(/<span class="layers-name">([^<]+)<\/span>/g)].map((m) => m[1].toLowerCase());
  assert.equal(layers.length, 4);
  const prose = readerText(page.replace(fig, '')).replace(/\s+/g, ' ').toLowerCase();
  const sentence = prose.match(/i proved access one layer at a time: [^.]+\./)?.[0] ?? '';
  const at = layers.map((l) => sentence.indexOf(l));
  assert.ok(at.every((i) => i >= 0), `every layer is named in the sentence: ${layers.join(', ')}`);
  assert.deepEqual(at, [...at].sort((a, b) => a - b), 'in the same order');
  assert.equal((fig.match(/class="is-found"/g) ?? []).length, 1, 'one layer marks where the hunt ended');
  assert.match(fig, /<li class="is-found">[\s\S]*?An internal call/, 'and it is the internal call');
});

test('the adoption program\'s ladder has as many parts and words as its text says', () => {
  const page = read('work/ai-adoption-program.html');
  const fig = page.match(/<figure class="ladder"[\s\S]*?<\/figure>/)?.[0];
  assert.ok(fig, 'the ladder figure is on the page');
  const prose = readerText(page.replace(fig, '')).replace(/\s+/g, ' ');
  const words = { four: 4, five: 5 };
  assert.match(prose, /One planned session became four parts/);
  assert.equal((fig.match(/<span class="ladder-k">Part \d/g) ?? []).length, words.four, 'four parts');
  const learn = readerText(fig).match(/learn (\w+) words/)?.[1];
  assert.equal((fig.match(/<p class="ladder-words">([\s\S]*?)<\/p>/)?.[1].match(/<span>/g) ?? []).length, words[learn], `"learn ${learn} words"`);
  assert.equal((fig.match(/ladder-step is-done/g) ?? []).length, 1, 'only Part 1 has happened');
});

test('the featured diagram ships whole, and its parts and ticker follow the steps beside it', () => {
  // No-JS, reduced-motion, phone and stale-cache visitors keep the HTML as written, so it
  // must be the finished drawing: data-step is the last step. js/flagship.js only moves it.
  const featured = HOME.match(/<section[^>]*id="featured"[\s\S]*?<\/section>/)?.[0] ?? '';
  const fig = featured.match(/<figure class="mig-viz flow[^"]*" id="flow" data-step="(\d+)"[\s\S]*?<\/figure>/);
  assert.ok(fig, '#flow is a figure in #featured');
  const steps = [...featured.matchAll(/<li class="step[^"]*">\s*<span class="step-n">([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.equal(steps.length, 5, 'five steps');
  assert.equal(Number(fig[1]), steps.length, 'the HTML shows the last step: the whole system');
  const ticker = [...fig[0].matchAll(/<li class="(is-done|is-current)">([^<]+)<\/li>/g)];
  assert.deepEqual(ticker.map((m) => m[2]), steps, 'one ticker label per step, in order');
  assert.deepEqual(ticker.map((m) => m[1]), [...steps.slice(1).map(() => 'is-done'), 'is-current'], 'the ticker starts on the last step');
  assert.match(fig[0], /<svg class="flow-svg"[^>]*role="img"[^>]*aria-labelledby="flow-title"[^>]*aria-describedby="flow-desc"/);
  assert.match(fig[0], /<title id="flow-title">[^<]+<\/title>\s*<desc id="flow-desc">[^<]{80,}<\/desc>/, 'a title and a real description');
  for (const [, n] of fig[0].matchAll(/\bfx-(?:from|only|upto)-(\d+)\b/g)) {
    assert.ok(Number(n) >= 1 && Number(n) <= steps.length, `fx-*-${n} names a step that doesn't exist`);
  }
  const css = read('css/site.css');
  for (let n = 1; n <= steps.length; n++) assert.ok(css.includes(`[data-step="${n}"]`), `site.css never styles step ${n}`);
});

test('the fleet diagram quotes its numbers from the write-up, on both pages', () => {
  // The gate's numbers are claims: they must match what work/starship-agent-fleet.html says in words.
  const writeup = readerText(read('work/starship-agent-fleet.html')).replace(/\s+/g, ' ');
  for (const fact of ['all 16 functional tests', '95th-percentile frame time of 8.2 ms', 'against the 18 ms budget', 'Sonnet and Opus agents built in parallel lanes on separate files']) {
    assert.ok(writeup.includes(fact), `the write-up no longer says "${fact}"`);
  }
  for (const path of ['index.html', 'work/starship-agent-fleet.html']) {
    const fig = read(path).match(/<svg class="fleet-svg"[\s\S]*?<\/svg>/)?.[0] ?? '';
    assert.ok(fig, `${path} has the fleet diagram`);
    assert.match(fig, />16 tests</, `${path}: the gate's test count`);
    assert.match(fig, />p95 8\.2 \/ 18 ms</, `${path}: the gate's frame budget`);
  }
});

test('every Toolkit link opens real proof, and says where it goes', () => {
  // The underline is the claim: a tool links only to the place on this site that shows it in use.
  const toolkit = HOME.match(/<div class="toolkit[^"]*">[\s\S]*?<\/div>\n {6}<\/div>/)?.[0] ?? '';
  const links = [...toolkit.matchAll(/<a class="tk-link" href="([^"]+)"( data-cs="([^"]+)")?>([^<]+)<span class="visually-hidden">: ([^<]+)<\/span><\/a>/g)];
  assert.ok(links.length >= 10, 'the Toolkit links its tools to their proof');
  assert.equal(links.length, (toolkit.match(/class="tk-link"/g) ?? []).length, 'every Toolkit link names its destination for screen readers');
  const ids = new Set([...HOME.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const [, href, , cs, tool] of links) {
    if (href.startsWith('#')) {
      assert.ok(ids.has(href.slice(1)), `${tool}: ${href} has no target`);
      if (href.startsWith('#cs-')) assert.equal(cs, href.slice(4), `${tool}: a case-study link opens its dialog (data-cs)`);
    } else {
      assert.ok(readFileSync(new URL(`../${href}`, import.meta.url)).length > 1000, `${tool}: ${href} is missing`);
    }
  }
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

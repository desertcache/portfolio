// Unit tests for js/editions.js — the pure helpers behind the Hill Money Watch pages.
// Run: npm test   (Node's built-in runner, no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validPosts, postNeighbors, editionTitle, readingMinutes } from '../js/editions.js';

test('validPosts keeps every well-formed post, newest first, with a summary', () => {
  const data = { posts: [
    { title: 'A', date: '2026-08-15', href: 'posts/a.html', summary: 'first' },
    { title: 'C', date: '2026-09-23', href: 'posts/c.html', summary: 'third' },
    { title: 'bad', date: '2026-09-01', href: 'javascript:alert(1)', summary: 'x' },
    { title: 'B', date: '2026-08-16', href: 'posts/b.html' },
  ] };
  assert.deepEqual(validPosts(data), [
    { title: 'C', date: '2026-09-23', href: 'posts/c.html', summary: 'third' },
    { title: 'B', date: '2026-08-16', href: 'posts/b.html', summary: '' },
    { title: 'A', date: '2026-08-15', href: 'posts/a.html', summary: 'first' },
  ]);
});

test('validPosts rejects malformed input and unsafe links', () => {
  assert.deepEqual(validPosts(null), []);
  assert.deepEqual(validPosts({}), []);
  assert.deepEqual(validPosts({ posts: 'nope' }), []);
  const unsafe = { posts: [
    { title: 'x', date: '2026-09-01', href: 'javascript:alert(1)' },
    { title: 'x', date: '2026-09-01', href: 'JavaScript:alert(1)' },
    { title: 'x', date: '2026-09-01', href: 'https://evil.example/' },
    { title: 'x', date: '2026-09-01', href: '//evil.example/' },
    { title: 'x', date: 'Sept 1', href: 'posts/ok.html' },
    { title: '  ', date: '2026-09-01', href: 'posts/ok.html' },
    { title: 7, date: '2026-09-01', href: 'posts/ok.html' },
  ] };
  assert.deepEqual(validPosts(unsafe), []);
});

test('postNeighbors finds the editions either side, by file name', () => {
  const posts = validPosts({ posts: [
    { title: 'A', date: '2026-08-15', href: 'posts/2026-08-15-hill-money-watch.html' },
    { title: 'B', date: '2026-08-16', href: 'posts/2026-08-16-hill-money-watch.html' },
    { title: 'C', date: '2026-09-23', href: 'posts/2026-09-23-hill-money-watch.html' },
  ] });
  const mid = postNeighbors(posts, '2026-08-16-hill-money-watch');
  assert.equal(mid.newer?.title, 'C');
  assert.equal(mid.older?.title, 'A');
  const newest = postNeighbors(posts, '2026-09-23-hill-money-watch');
  assert.equal(newest.newer, null);
  assert.equal(newest.older?.title, 'B');
  const oldest = postNeighbors(posts, '2026-08-15-hill-money-watch');
  assert.equal(oldest.newer?.title, 'B');
  assert.equal(oldest.older, null);
  assert.deepEqual(postNeighbors(posts, 'not-a-post'), { newer: null, older: null });
  assert.deepEqual(postNeighbors([], '2026-08-15-hill-money-watch'), { newer: null, older: null });
});

test('editionTitle drops the series name and nothing else', () => {
  assert.equal(editionTitle('Hill Money Watch — August 16, 2026'), 'August 16, 2026');
  assert.equal(editionTitle('Hill Money Watch - August 16, 2026'), 'August 16, 2026');
  assert.equal(editionTitle('Hill Money Watch: August 16, 2026'), 'August 16, 2026');
  assert.equal(editionTitle('A special edition'), 'A special edition');
  assert.equal(editionTitle('Hill Money Watch'), 'Hill Money Watch');
});

test('readingMinutes rounds to whole minutes and never says zero', () => {
  assert.equal(readingMinutes(''), 1);
  assert.equal(readingMinutes('one two three'), 1);
  assert.equal(readingMinutes('word '.repeat(2300)), 10);
  assert.equal(readingMinutes('word\n\t'.repeat(345)), 2); // 1.5 rounds up
  assert.equal(readingMinutes('word '.repeat(600), 200), 3);
});

test('the archive page arrives pre-rendered, matching posts.json edition for edition', async () => {
  // scripts/ingest_digest.py writes the archive into blog/index.html whenever it rebuilds
  // posts.json. If the two disagree, a post was published by hand or the page was edited
  // between its markers: republish with the script.
  const { readFileSync } = await import('node:fs');
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const posts = validPosts(JSON.parse(read('blog/posts.json')));
  const page = read('blog/index.html');
  const archive = page.match(/<!-- archive:start -->([\s\S]*?)<!-- archive:end -->/)?.[1] ?? '';
  const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const latest = archive.match(/<a class="lab latest" href="([^"]+)">[\s\S]*?<span class="latest-no">No\. (\d+)<\/span>[\s\S]*?<h2 class="latest-title" id="latest-title">([^<]+)<\/h2>/);
  assert.ok(latest, 'the latest-edition card is in the page');
  const rows = [...archive.matchAll(/<a class="archive-row" href="([^"]+)"><span class="archive-no">No\. (\d+)<\/span><span class="archive-main"><h3 class="archive-title" id="edition-\d+">([^<]+)<\/h3>/g)];
  const shown = [latest, ...rows].map(([, href, no, title]) => ({ href, no: Number(no), title: decode(title) }));
  assert.deepEqual(shown, posts.map((p, i) => ({ href: p.href, no: posts.length - i, title: editionTitle(p.title) })));
});

test('the Atom feed lists every edition in posts.json, newest first, with absolute links', async () => {
  // blog/feed.xml is rewritten by scripts/ingest_digest.py on every publish, and it is the
  // sitemap for the editions (sitemap.xml leaves them out). If this fails, republish with
  // the script rather than editing the feed by hand.
  const { readFileSync } = await import('node:fs');
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const posts = validPosts(JSON.parse(read('blog/posts.json')));
  const feed = read('blog/feed.xml');
  const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const entries = [...feed.matchAll(/<entry>\s*<title>([^<]*)<\/title>\s*<link rel="alternate" type="text\/html" href="([^"]+)"\/>/g)]
    .map(([, title, href]) => ({ title: decode(title), href }));
  const blog = 'https://desertcache.github.io/portfolio/blog/';
  assert.deepEqual(entries, posts.map((p) => ({ title: p.title, href: new URL(p.href, blog).href })));
  const head = feed.split('<entry>')[0];
  assert.match(head, new RegExp(`<updated>${posts[0].date}T00:00:00Z</updated>`), 'the feed is as new as its newest edition');
  assert.equal(feed.indexOf('—'), -1, 'no em dash in the feed either');
});

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

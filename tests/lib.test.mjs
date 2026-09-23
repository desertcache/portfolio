// Unit tests for js/lib.js — the pure helpers behind the homepage.
// Run: npm test   (Node's built-in runner, no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hexToRgb, parseStat, formatStat, latestPost, formatPostDate, caseStudyFromHash, coordsFor,
} from '../js/lib.js';

test('hexToRgb parses short and long hex, rejects everything else', () => {
  assert.deepEqual(hexToRgb('#fff'), [1, 1, 1]);
  assert.deepEqual(hexToRgb(' #000000 '), [0, 0, 0]);
  const [r, g, b] = /** @type {number[]} */ (hexToRgb('#b9442b'));
  assert.equal(Math.round(r * 255), 185);
  assert.equal(Math.round(g * 255), 68);
  assert.equal(Math.round(b * 255), 43);
  assert.equal(hexToRgb('rgb(0,0,0)'), null);
  assert.equal(hexToRgb('#12345'), null);
  assert.equal(hexToRgb(''), null);
});

test('parseStat keeps prefix, suffix, decimals and grouping', () => {
  assert.deepEqual(parseStat('94%'), { prefix: '', value: 94, decimals: 0, suffix: '%', grouped: false });
  assert.deepEqual(parseStat('6,846'), { prefix: '', value: 6846, decimals: 0, suffix: '', grouped: true });
  assert.deepEqual(parseStat('~80%'), { prefix: '~', value: 80, decimals: 0, suffix: '%', grouped: false });
  assert.deepEqual(parseStat('0.9%'), { prefix: '', value: 0.9, decimals: 1, suffix: '%', grouped: false });
  assert.equal(parseStat('800+')?.suffix, '+');
});

test('parseStat leaves ranges and prose alone', () => {
  assert.equal(parseStat('1–7 days'), null);
  assert.equal(parseStat('5+ → 1'), null);
  assert.equal(parseStat('Under budget'), null);
  assert.equal(parseStat(''), null);
});

test('formatStat round-trips every counted number on the page', () => {
  for (const text of ['94%', '800+', '100+', '6,846', '~80%', '0.9%', '1,234,567']) {
    const stat = parseStat(text);
    assert.ok(stat, text);
    assert.equal(formatStat(stat, stat.value), text);
  }
});

test('formatStat renders intermediate frames in the same shape', () => {
  const stat = /** @type {import('../js/lib.js').Stat} */ (parseStat('6,846'));
  assert.equal(formatStat(stat, 0), '0');
  assert.equal(formatStat(stat, 1234.4), '1,234');
  const pct = /** @type {import('../js/lib.js').Stat} */ (parseStat('0.9%'));
  assert.equal(formatStat(pct, 0.44), '0.4%');
});

test('latestPost picks the newest well-formed post', () => {
  const data = {
    posts: [
      { title: 'Older', date: '2026-08-15', href: 'posts/a.html' },
      { title: 'Newer', date: '2026-08-16', href: 'posts/b.html' },
    ],
  };
  assert.deepEqual(latestPost(data), { title: 'Newer', date: '2026-08-16', href: 'posts/b.html' });
});

test('latestPost rejects malformed input and unsafe links', () => {
  assert.equal(latestPost(null), null);
  assert.equal(latestPost({}), null);
  assert.equal(latestPost({ posts: 'nope' }), null);
  assert.equal(latestPost({ posts: [] }), null);
  const unsafe = { posts: [
    { title: 'x', date: '2026-09-01', href: 'javascript:alert(1)' },
    { title: 'x', date: '2026-09-01', href: 'JavaScript:alert(1)' },
    { title: 'x', date: '2026-09-01', href: 'https://evil.example/' },
    { title: 'x', date: '2026-09-01', href: '//evil.example/' },
    { title: 'x', date: 'Sept 1', href: 'posts/ok.html' },
    { title: '  ', date: '2026-09-01', href: 'posts/ok.html' },
    { title: 7, date: '2026-09-01', href: 'posts/ok.html' },
  ] };
  assert.equal(latestPost(unsafe), null);
});

test('formatPostDate does not slide a day in western timezones', () => {
  assert.equal(formatPostDate('2026-08-16'), 'August 16, 2026');
  assert.equal(formatPostDate('2026-01-01'), 'January 1, 2026');
  assert.equal(formatPostDate('not-a-date'), 'not-a-date');
});

test('caseStudyFromHash only accepts ids that exist', () => {
  const ids = ['wfm', 'chip', 'ime'];
  assert.equal(caseStudyFromHash('#cs-wfm', ids), 'wfm');
  assert.equal(caseStudyFromHash('#cs-nope', ids), null);
  assert.equal(caseStudyFromHash('#work', ids), null);
  assert.equal(caseStudyFromHash('', ids), null);
  assert.equal(caseStudyFromHash('#cs-wfm/../x', ids), null);
});

test('coordsFor centres on downtown Phoenix and clamps to the tile', () => {
  assert.deepEqual(coordsFor(0.5, 0.5), { lat: '33.4484° N', lon: '112.0740° W' });
  assert.deepEqual(coordsFor(-5, 9), coordsFor(0, 1));
  // moving east (right) shrinks west longitude; moving up grows latitude
  assert.ok(parseFloat(coordsFor(1, 0.5).lon) < parseFloat(coordsFor(0, 0.5).lon));
  assert.ok(parseFloat(coordsFor(0.5, 0).lat) > parseFloat(coordsFor(0.5, 1).lat));
});

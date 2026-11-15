// Unit tests for js/covey.js: how the quail's chicks follow her. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spotBehind, followerLag, LAG_STEP } from '../js/covey.js';
import { follow, facing } from '../js/wildlife.js';
import { CRITTERS } from '../js/critter-data.js';

const HOME = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('a follower\'s spot is behind the one ahead, whichever way it faces', () => {
  assert.equal(spotBehind(400, 1, 30), 370);
  assert.equal(spotBehind(400, -1, 30), 430);
  assert.equal(spotBehind(400, 1, 0), 400);
});

test('each place back in the line reacts a little later', () => {
  assert.equal(followerLag(0.2, 0), 0.2);
  assert.ok(Math.abs(followerLag(0.2, 1) - 0.2 * (1 + LAG_STEP)) < 1e-12);
  assert.ok(followerLag(0.2, 3) > followerLag(0.2, 2));
  assert.equal(followerLag(0.2, -1), 0.2, 'never quicker than its own lag');
});

/**
 * A leader and three chicks, stepped the way js/trails.js steps them: the
 * leader chases a goal, each chick chases the spot behind the one ahead.
 * @param {number[]} xs      where each starts (leader first)
 * @param {number[]} faces   which way each starts facing
 * @param {number} goal      where the leader is going
 * @param {number} seconds
 */
function run(xs, faces, goal, seconds) {
  const x = [...xs];
  const face = [...faces];
  const gap = 24;
  let strungOut = 0;
  for (let i = 0; i < seconds * 60; i++) {
    const dt = 1 / 60;
    for (let k = 0; k < x.length; k++) {
      const target = k === 0 ? goal : spotBehind(x[k - 1], face[k - 1], gap);
      const nx = follow(x[k], target, dt, followerLag(0.15, k));
      face[k] = facing(face[k], nx - x[k]);
      x[k] = nx;
    }
    strungOut = Math.max(strungOut, Math.abs(x[0] - x[x.length - 1]));
  }
  return { x, face, gap, strungOut };
}

test('the covey strings out on a dash and closes up into a line behind the leader', () => {
  const { x, face, gap, strungOut } = run([100, 76, 52, 28], [1, 1, 1, 1], 700, 6);
  assert.ok(Math.abs(x[0] - 700) < 0.5, 'the leader arrives');
  for (let k = 1; k < x.length; k++) {
    assert.ok(Math.abs(x[k - 1] - x[k] - gap) < 1, `chick ${k} ends a gap behind the one ahead`);
    assert.equal(face[k], 1, `chick ${k} faces the way it came`);
  }
  assert.ok(strungOut > 3 * gap + 20, 'on the way, the line was longer than at rest');
});

test('when the leader turns round, the chicks end up behind her again, on the other side', () => {
  const { x, face, gap } = run([700, 676, 652, 628], [1, 1, 1, 1], 200, 6);
  assert.equal(face[0], -1);
  for (let k = 1; k < x.length; k++) {
    assert.ok(Math.abs(x[k] - x[k - 1] - gap) < 1, `chick ${k} is a gap to the right of the one ahead`);
    assert.equal(face[k], -1, `chick ${k} has turned round too`);
  }
});

test('the page puts one quail and her chicks on a trail, and the script knows both', () => {
  const trail = HOME.match(/<div class="trail trail-quail"[\s\S]*?<\/div>/)?.[0] ?? '';
  const animals = [...trail.matchAll(/data-animal="([a-z]+)"/g)].map((m) => m[1]);
  assert.equal(animals[0], 'quail', 'the adult leads');
  assert.ok(animals.length >= 3 && animals.slice(1).every((name) => name === 'chick'), 'the rest are chicks');
  // every chick says how far behind it follows, and its place in the line (for where it stands without JS)
  assert.equal([...trail.matchAll(/data-animal="chick" data-gap="[\d.]+" style="--i: ?\d"/g)].length, animals.length - 1);
  for (const name of ['quail', 'chick']) {
    assert.ok(CRITTERS[name]?.cycle, `${name} has gait data`);
  }
  const trails = readFileSync(new URL('../js/trails.js', import.meta.url), 'utf8');
  assert.match(trails, /quail: \{ kind: 'run'/);
  assert.match(trails, /chick: \{ kind: 'run'/);
});

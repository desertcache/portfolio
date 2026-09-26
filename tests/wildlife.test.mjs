// Unit tests for js/wildlife.js: where the roadrunner is and what its legs
// are doing. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runWindow, runProgress, runnerX, follow, stride, strideFrame, facing } from '../js/wildlife.js';
import { ROADRUNNER } from '../js/fauna-data.js';

/** @param {number} a @param {number} b @param {number} [eps] */
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('a trail on screen at load runs from the top of the page until it reaches the top', () => {
  // the hero's floor: 850 px down a 900 px screen, on a long page
  assert.deepEqual(runWindow(850, 900, 6000), { from: 0, to: 850 });
});

test('a trail further down runs from when it rises into view', () => {
  assert.deepEqual(runWindow(3000, 900, 6000), { from: 2100, to: 3000 });
});

test('a trail near the end of the page finishes when the page does', () => {
  // the page can only scroll to 5600, before the trail reaches the top
  assert.deepEqual(runWindow(6200, 900, 5600), { from: 5300, to: 5600 });
});

test('the window is never empty, even on a page too short to scroll', () => {
  const win = runWindow(400, 900, 0);
  assert.ok(win.to > win.from);
  near(runProgress(0, win), 0);
});

test('runProgress clamps to 0..1 and is linear in between', () => {
  const win = { from: 2100, to: 3000 };
  near(runProgress(0, win), 0);
  near(runProgress(2100, win), 0);
  near(runProgress(2550, win), 0.5);
  near(runProgress(3000, win), 1);
  near(runProgress(9999, win), 1);
});

test('runnerX maps progress onto the trail, off its edges at the ends', () => {
  near(runnerX(0, -0.1, 1.1, 1000), -100);
  near(runnerX(1, -0.1, 1.1, 1000), 1100);
  near(runnerX(0.5, -0.1, 1.1, 1000), 500);
});

test('follow closes the same gap however the time is sliced into frames', () => {
  const one = follow(0, 100, 0.1, 0.12);
  const two = follow(follow(0, 100, 0.05, 0.12), 100, 0.05, 0.12);
  near(one, two, 1e-9);
  assert.ok(one > 0 && one < 100);
  near(follow(0, 100, 0.1, 0), 100);
  // after five time constants it is all but there
  assert.ok(100 - follow(0, 100, 0.6, 0.12) < 1);
});

test('stride keeps pace with the ground at walking speed', () => {
  // 5 px in a 60 Hz frame (300 px/s, under 4 strides a second) at 80 px
  // per stride: exactly a sixteenth of a stride
  near(stride(2, 5, 80, 1 / 60, 7), 2.0625);
  near(stride(2, -5, 80, 1 / 60, 7), 2.0625); // running left steps forward too
});

test('stride is capped when the runner outpaces the screen', () => {
  // 400 px in one 60 Hz frame would be 5 strides; the cap allows 7/60
  near(stride(0, 400, 80, 1 / 60, 7), 7 / 60);
  assert.equal(stride(3, 50, 0, 1 / 60, 7), 3); // unmeasured size: legs still
});

test('strideFrame walks through every frame once per stride and wraps', () => {
  const frames = ROADRUNNER.runFrames;
  const seen = [];
  for (let k = 0; k < frames; k++) seen.push(strideFrame(4 + (k + 0.5) / frames, frames));
  assert.deepEqual(seen, [...Array(frames).keys()]);
  assert.equal(strideFrame(5, frames), 0);
  assert.equal(strideFrame(-0.01, frames), frames - 1);
  assert.equal(strideFrame(0.999999, frames), frames - 1);
});

test('facing turns with the movement and ignores twitches', () => {
  assert.equal(facing(1, -3), -1);
  assert.equal(facing(-1, 3), 1);
  assert.equal(facing(-1, 0.1), -1);
  assert.equal(facing(1, -0.2), 1);
});

test('the generated flip-book numbers hang together', () => {
  const { viewBox, runFrames, stand, flick, cycle, pivot } = ROADRUNNER;
  assert.equal(viewBox.length, 4);
  assert.ok(viewBox[2] > 0 && viewBox[3] > 0);
  assert.equal(stand, runFrames);
  assert.equal(flick, runFrames + 1);
  assert.ok(cycle > 0);
  assert.ok(pivot > 0 && pivot < 1);
});

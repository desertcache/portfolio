// Tests for js/scrolly.js, the pure half of the featured program's diagram.
// Run: npm test   (Node's built-in runner, no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeStep } from '../js/scrolly.js';

test('before any step reaches the reading line, the first one is current', () => {
  assert.equal(activeStep([500, 700, 900], 450), 0);
});

test('the current step is the last one whose top has reached the line', () => {
  assert.equal(activeStep([-300, 120, 600], 450), 1);
  assert.equal(activeStep([-900, -500, -100], 450), 2, 'past the end, the last step stays current');
});

test('a top exactly on the line counts as reached', () => {
  assert.equal(activeStep([100, 450, 800], 450), 1);
});

test('an empty list is step 0, not undefined', () => {
  assert.equal(activeStep([], 450), 0);
});

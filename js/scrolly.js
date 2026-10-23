// @ts-check
/**
 * Scrollytelling helpers, DOM-free so Node can test them
 * (tests/scrolly.test.mjs). A new file rather than new exports on lib.js: a
 * visitor can hold a cached lib.js, and a missing named export stops a module
 * from loading at all (see DEV-NOTES).
 */

/**
 * Which step is the reader on? The last one whose top edge has reached the
 * reading line, or the first until any has. Steps sit edge to edge, so this
 * is the step the line runs through.
 * @param {readonly number[]} tops each step's top edge in viewport px, in page order
 * @param {number} line the reading line, in viewport px from the top
 * @returns {number} a 0-based index (0 for an empty list)
 */
export function activeStep(tops, line) {
  let active = 0;
  for (let i = 0; i < tops.length; i++) {
    if (tops[i] <= line) active = i;
  }
  return active;
}

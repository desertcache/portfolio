// @ts-check
/**
 * Following, for animals that travel in a line: the Gambel's quail in "How I
 * build" and the chicks behind her. Pure functions; js/trails.js puts them
 * on the page, and tests/covey.test.mjs runs them in Node.
 *
 * Its own file on purpose: a cached module without a new export would stop
 * every module that imports it (see DEV-NOTES).
 */

/** How much slower each place back in the line is to react, as a share of the lag. */
export const LAG_STEP = 0.3;

/**
 * Where a follower wants to stand: `gap` px behind the one ahead of it.
 * "Behind" is the side the one ahead has its back to, so when the leader
 * turns round, the spot crosses to its other side and the line re-forms.
 * @param {number} aheadX     px: where the one ahead is
 * @param {number} aheadFace  +1 if it faces right, -1 if left
 * @param {number} gap        px
 * @returns {number}
 */
export function spotBehind(aheadX, aheadFace, gap) {
  return aheadX - aheadFace * gap;
}

/**
 * The lag for a place in the line (0 is the leader). Each one back reacts a
 * little later than the one ahead, so the line strings out when the leader
 * sets off and closes up when she stops.
 * @param {number} lag    s: the animal's own time constant
 * @param {number} place  0 for the leader, 1 for the first follower, ...
 * @returns {number}
 */
export function followerLag(lag, place) {
  return lag * (1 + LAG_STEP * Math.max(0, place));
}

// @ts-check
/**
 * The roadrunner's engine grew into js/trails.js, which now drives every
 * animal on a trail. This file stays so a browser holding an older main.js in
 * its cache (GitHub Pages caches for about ten minutes) still finds the
 * module and the export it imports.
 */
export { initTrails as initRoadrunners } from './trails.js';

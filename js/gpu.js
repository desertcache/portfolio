// @ts-check
/**
 * Is WebGL drawn by the CPU here? DOM-free so Node can test it
 * (tests/gpu.test.mjs). A new file rather than new exports on lib.js: a
 * visitor can hold a cached lib.js, and a missing named export stops a module
 * from loading at all (see DEV-NOTES).
 *
 * Remote desktops, virtual machines, CI and blocklisted GPU drivers get a
 * software rasterizer. The hero map's shader is cheap on a GPU and ruinous on
 * a CPU: in a software-rendered Chrome it held the main thread for 16 s of a
 * Lighthouse mobile run. Those machines get the map's still frame instead.
 */

/** Software rasterizers as browsers name them: Chrome/ANGLE, Mesa, Windows WARP. */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software ?(?:rasterizer|renderer)|basic render driver/i;

/**
 * @param {string | null | undefined} renderer the WebGL renderer string
 * @returns {boolean}
 */
export function isSoftwareRenderer(renderer) {
  return SOFTWARE.test(renderer ?? '');
}

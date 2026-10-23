// Tests for js/gpu.js: which WebGL renderers draw on the CPU.
// Run: npm test   (Node's built-in runner, no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSoftwareRenderer } from '../js/gpu.js';

test('software rasterizers are recognised, whichever browser names them', () => {
  for (const r of [
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
    'Google SwiftShader',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
    'Mesa softpipe',
    'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'Software Rasterizer',
  ]) assert.equal(isSoftwareRenderer(r), true, r);
});

test('real GPUs, and browsers that hide the renderer, keep the moving map', () => {
  for (const r of [
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'Adreno (TM) 740',
    'Mali-G78',
    'Apple GPU',
    'WebKit WebGL',
    '',
    null,
    undefined,
  ]) assert.equal(isSoftwareRenderer(r), false, String(r));
});

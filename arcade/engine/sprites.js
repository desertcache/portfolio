// Offscreen prerender helpers. Drawing glow/sprites once at load time and
// blitting is dramatically cheaper than per-frame shadowBlur paths.
export function makeSprite(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  return canvas;
}

// A padded glow version of a shape: pad leaves room for the blur halo.
export function makeGlowSprite(w, h, pad, color, blur, draw) {
  return makeSprite(w + pad * 2, h + pad * 2, (ctx) => {
    ctx.save();
    ctx.translate(pad, pad);
    ctx.shadowBlur = blur;
    ctx.shadowColor = color;
    draw(ctx, w, h);
    ctx.restore();
  });
}

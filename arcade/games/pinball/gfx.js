// Shared palette and drawing primitives for Dust Devil Pinball. Flat ink-and-paper: warm
// paper ground, confident ink outlines (2 px, so the cabinet's scanlines don't swallow them),
// red-rock, sage, saguaro green, sunset orange and turquoise accents. No gradients, no glow.
export const TAU = Math.PI * 2;

export const PAL = {
  ink: '#2b2118',
  ink2: '#4a3a30',
  paper: '#f1e4c4',
  paperLight: '#f8efd8',
  sand: '#e8d5b0',
  sandDark: '#d6bf93',
  sandLine: '#c4a977',
  sage: '#9fb08a',
  sageDark: '#6f8560',
  sageLight: '#c3d0aa',
  terracotta: '#c8693f',
  terraLight: '#e08c61',
  redrock: '#a8401d',
  redrockDark: '#7d2f15',
  mustard: '#dcae45',
  mustardLight: '#f4cf72',
  sunset: '#e8803a',
  turq: '#35b5a8',
  turqLight: '#9fdcd2',
  turqDark: '#237f78',
  cactus: '#5f8a4a',
  cactusDark: '#3f6234',
  cactusLight: '#8db96a',
  plum: '#2a2030',
  plumDeep: '#1b141f',
  plumLine: '#4a3a54',
  silver: '#e4e6e5',
  silverDark: '#a3abb0',
  flame: '#ff7a45',
};

export const MONO = 'ui-monospace, "Martian Mono", "SF Mono", Menlo, Consolas, monospace';
export const SANS = 'Archivo, "Helvetica Neue", Arial, sans-serif';

/** Rounded rectangle path (the canvas roundRect() is newer than some browsers still in use). */
export function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** A thick rail along the current path: an ink stroke with a coloured one inside (2 px outline each side). */
export function rail(c, halfWidth, fill, outline = 2) {
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = PAL.ink;
  c.lineWidth = halfWidth * 2 + outline * 2;
  c.stroke();
  c.strokeStyle = fill;
  c.lineWidth = halfWidth * 2;
  c.stroke();
}

export function disc(c, x, y, r, fill, ink = true, lw = 2) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (ink) { c.strokeStyle = PAL.ink; c.lineWidth = lw; c.stroke(); }
}

export function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

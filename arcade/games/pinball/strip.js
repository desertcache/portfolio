// The dot-matrix score strip along the top edge of the canvas. Big amber dots for the score
// and the short messages (taken from the cabinet's own 5x7 pixel font), a small status line
// underneath. The lit dots are rendered once per distinct content, not every frame.
import { drawText } from '../../engine/font.js';
import { MONO, rr } from './gfx.js';

export const STRIP = { x: 6, y: 3, w: 438, h: 43 };

const C = {
  panel: '#17111a', rim: '#2b2118', rim2: '#4a3a54', dim: '#4a3743', amber: '#ffb13b', amberDim: '#a8742c', hot: '#ffe2a0',
  label: '#cdbb92', ok: '#7ad9a8', bad: '#ff7a5c', paper: '#f1e4c4',
};

const PITCH = 3; // px between dots
const CELL = 8 * PITCH; // one character cell
const COLS = 17;
const GX = Math.round((450 - COLS * CELL) / 2); // left edge of the character grid
const GY = 5;

const glyphs = new Map();
/** The lit pixels of one character in the cabinet's 5x7 font, as [x, y] pairs inside its 8x8 cell. */
function glyphOf(ch) {
  let px = glyphs.get(ch);
  if (px) return px;
  const cv = document.createElement('canvas');
  cv.width = 8; cv.height = 8;
  const c = cv.getContext('2d', { willReadFrequently: true });
  drawText(c, ch, 0, 0, { color: '#fff', scale: 1 });
  const data = c.getImageData(0, 0, 8, 8).data;
  px = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (data[(y * 8 + x) * 4 + 3] > 128) px.push([x, y]);
  glyphs.set(ch, px);
  return px;
}

/** The lit pixels of `str`, on an 8-pixel-per-character grid. */
function pixelsOf(str) {
  const out = [];
  [...str.toUpperCase()].forEach((ch, i) => { for (const [x, y] of glyphOf(ch)) out.push([x + i * 8, y]); });
  return out;
}

function dots(c, str, cell, color, r = PITCH * 0.47) {
  const px = pixelsOf(str);
  c.fillStyle = color;
  c.beginPath();
  for (const [x, y] of px) {
    const cx = GX + cell * CELL + x * PITCH + PITCH / 2, cy = GY + y * PITCH + PITCH / 2;
    c.moveTo(cx + r, cy);
    c.arc(cx, cy, r, 0, Math.PI * 2);
  }
  c.fill();
}

export const group = (n) => String(Math.max(0, Math.floor(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function createStrip() {
  // The unlit panel: the rim and every dot of the matrix in its off colour.
  const base = document.createElement('canvas');
  base.width = 450; base.height = 50;
  {
    const c = base.getContext('2d');
    c.lineJoin = 'round';
    c.fillStyle = C.rim; rr(c, STRIP.x - 2, STRIP.y - 2, STRIP.w + 4, STRIP.h + 4, 8); c.fill();
    c.fillStyle = C.panel; rr(c, STRIP.x, STRIP.y, STRIP.w, STRIP.h, 6); c.fill();
    c.strokeStyle = C.rim2; c.lineWidth = 1; rr(c, STRIP.x + 2.5, STRIP.y + 2.5, STRIP.w - 5, STRIP.h - 5, 4); c.stroke();
    c.fillStyle = C.dim;
    c.beginPath();
    const r = PITCH * 0.36;
    for (let cell = 0; cell < COLS; cell++) {
      for (let y = 1; y <= 7; y++) for (let x = 1; x <= 5; x++) {
        const cx = GX + cell * CELL + x * PITCH + PITCH / 2, cy = GY + y * PITCH + PITCH / 2;
        c.moveTo(cx + r, cy); c.arc(cx, cy, r, 0, Math.PI * 2);
      }
    }
    c.fill();
  }

  const live = document.createElement('canvas');
  live.width = 450; live.height = 50;
  const lc = live.getContext('2d');
  let lastKey = '';

  function render(s) {
    lc.clearRect(0, 0, 450, 50);
    // top row: a message takes the whole display, otherwise score on the left and multiplier on the right
    if (s.power) {
      dots(lc, 'POWER', 0, C.amber);
      const n = 10, x0 = GX + 6 * CELL - 2, w = 17, gap = 6; // ten segments: the 7th is the 0.7 pull that clears the gate
      for (let i = 0; i < n; i++) {
        const on = (i + 1) / n <= s.power.frac + 1e-6;
        const go = (i + 1) / n >= s.power.min - 1e-6;
        lc.fillStyle = on ? (go ? C.ok : C.amber) : C.dim;
        rr(lc, x0 + i * (w + gap), GY + 5, w, 17, 3); lc.fill();
      }
    } else if (s.msg) {
      const text = s.msg.slice(0, COLS);
      dots(lc, text, Math.floor((COLS - text.length) / 2), s.hot ? C.hot : C.amber);
    } else {
      const txt = group(s.score);
      dots(lc, txt, Math.floor((COLS - txt.length) / 2), C.amber);
      dots(lc, `X${s.mult}`, COLS - 2, s.mult > 1 ? C.hot : C.amberDim);
    }
    // status line
    lc.font = `bold 11px ${MONO}`;
    lc.textBaseline = 'alphabetic';
    const y = STRIP.y + STRIP.h - 3;
    lc.textAlign = 'left';
    lc.fillStyle = C.label;
    lc.fillText(`BALL ${s.ball} OF ${s.balls}${s.extra ? ` +${s.extra}` : ''}`, STRIP.x + 12, y);
    lc.textAlign = 'right';
    lc.fillText(`BONUS ${group(s.bonus)}`, STRIP.x + STRIP.w - 12, y);
    lc.textAlign = 'center';
    if (s.tilted) { lc.fillStyle = C.bad; lc.fillText('TILT', 225, y); }
    else if (s.save > 0) { lc.fillStyle = C.ok; lc.fillText(`SAVE ${Math.ceil(s.save / 60)}`, 225, y); }
    else if (s.award) { lc.fillStyle = C.amber; lc.fillText(s.award === 'extra' ? 'EXTRA BALL LIT' : 'JACKPOT LIT', 225, y); }
  }

  return {
    /** Draw the strip. `s`: score, mult, ball, balls, extra, bonus, msg, hot, save, award, tilted, power. */
    draw(ctx, s) {
      const key = [s.score, s.mult, s.ball, s.balls, s.extra, s.bonus, s.msg, s.hot, Math.ceil(s.save / 60), s.award, s.tilted,
        s.power ? Math.round(s.power.frac * 40) : '-'].join('|');
      if (key !== lastKey) { lastKey = key; render(s); }
      ctx.drawImage(base, 0, 0);
      ctx.drawImage(live, 0, 0);
    },
  };
}

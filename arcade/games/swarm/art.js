// Swarm vector art. Everything is stroked once into padded glow sprites at
// load time; the game only blits (and rotates) them per frame.
import { makeGlowSprite, makeSprite } from '../../engine/sprites.js';

export const COLORS = {
  night: '#150f24',
  gutter: '#110b1d',
  frame: '#2c2147',
  amber: '#ffb547',
  orange: '#ff7a45',
  pink: '#ff5c93',
  teal: '#46e0d8',
  violet: '#b98cff',
  ink: '#f5eef2',
  dim: '#7d6f9c',
};

const PAD = 8;

function shape(c, pts, close = true) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  if (close) c.closePath();
}

function sides(fn) {
  fn(-1);
  fn(1);
}

// Each enemy faces +y (toward the player). Frame 0/1 flap the wings.
function drawDrone(c, frame, col) {
  c.lineWidth = 1.8;
  c.lineJoin = 'round';
  c.strokeStyle = col.line;
  sides((s) => {
    shape(c, frame === 0
      ? [s * 4, -2, s * 12, -8, s * 11, 2, s * 5, 2]
      : [s * 4, -1, s * 13, -1, s * 10, 6, s * 4, 3]);
    c.stroke();
    shape(c, [s * 2, 7, s * 4, 11], false);
    c.stroke();
  });
  shape(c, [0, -7, 5, 0, 0, 8, -5, 0]);
  c.fillStyle = col.fill;
  c.fill();
  c.stroke();
  c.fillStyle = col.core;
  c.fillRect(-1.5, 1.5, 3, 3);
}

function drawStinger(c, frame, col) {
  c.lineWidth = 1.8;
  c.lineJoin = 'round';
  c.strokeStyle = col.line;
  sides((s) => {
    shape(c, frame === 0
      ? [s * 5, -1, s * 14, 5, s * 12, -8, s * 4, -6]
      : [s * 5, -1, s * 14, -3, s * 9, -12, s * 4, -6]);
    c.stroke();
    shape(c, [s * 2, -8, s * 4, -13], false);
    c.stroke();
  });
  shape(c, [0, 11, 6, -1, 3, -8, -3, -8, -6, -1]);
  c.fillStyle = col.fill;
  c.fill();
  c.stroke();
  c.strokeStyle = col.core;
  c.lineWidth = 1.2;
  shape(c, [0, -4, 0, 6], false);
  c.stroke();
}

function drawWarden(c, frame, col) {
  c.lineWidth = 2;
  c.lineJoin = 'round';
  c.strokeStyle = col.line;
  sides((s) => {
    shape(c, frame === 0
      ? [s * 9, -3, s * 16, -7, s * 16, 6, s * 9, 4]
      : [s * 9, -3, s * 17, 0, s * 13, 10, s * 9, 4]);
    c.stroke();
    shape(c, [s * 5, -8, s * 8, -14], false);
    c.stroke();
  });
  shape(c, [0, -11, 0, -16], false);
  c.stroke();
  shape(c, [0, -11, 9, -6, 9, 4, 0, 11, -9, 4, -9, -6]);
  c.fillStyle = col.fill;
  c.fill();
  c.stroke();
  c.fillStyle = col.core;
  c.beginPath();
  c.arc(0, 1, 3.4, 0, Math.PI * 2);
  c.fill();
  if (col.cracked) {
    c.strokeStyle = col.core;
    c.lineWidth = 1.2;
    shape(c, [-6, -5, -2, -2, -4, 2], false);
    c.stroke();
  }
}

const DRAW = { drone: drawDrone, stinger: drawStinger, warden: drawWarden };

const PALETTES = {
  drone: { line: COLORS.amber, fill: 'rgba(255,181,71,0.22)', core: '#fff3d6' },
  stinger: { line: COLORS.pink, fill: 'rgba(255,92,147,0.22)', core: '#ffd1e1' },
  warden: { line: COLORS.orange, fill: 'rgba(255,122,69,0.2)', core: COLORS.amber },
  wardenHurt: { line: COLORS.violet, fill: 'rgba(185,140,255,0.18)', core: COLORS.pink, cracked: true },
  flash: { line: '#ffffff', fill: 'rgba(255,255,255,0.5)', core: '#ffffff' },
};

const ESIZE = 36; // enemy sprite box (before padding)

function enemySprite(type, frame, pal) {
  return makeGlowSprite(ESIZE, ESIZE, PAD, pal.line, 7, (c) => {
    c.translate(ESIZE / 2, ESIZE / 2);
    DRAW[type](c, frame, pal);
  });
}

// sprites.enemy[type][variant][frame]; variant 0 = normal, 1 = damaged, 2 = white flash.
export function buildSprites() {
  const enemy = {};
  for (const type of ['drone', 'stinger', 'warden']) {
    const normal = PALETTES[type];
    const hurt = type === 'warden' ? PALETTES.wardenHurt : normal;
    enemy[type] = [normal, hurt, PALETTES.flash].map((pal) => [
      enemySprite(type, 0, pal),
      enemySprite(type, 1, pal),
    ]);
  }

  const ship = makeGlowSprite(32, 32, PAD, COLORS.teal, 9, (c) => {
    c.translate(16, 17);
    c.lineWidth = 2;
    c.lineJoin = 'round';
    c.strokeStyle = COLORS.teal;
    shape(c, [0, -15, 4, -7, 4, 1, 12, 7, 13, 12, 5, 10, 3, 13, -3, 13, -5, 10, -13, 12, -12, 7, -4, 1, -4, -7]);
    c.fillStyle = 'rgba(70,224,216,0.16)';
    c.fill();
    c.stroke();
    c.strokeStyle = COLORS.pink;
    c.lineWidth = 1.6;
    sides((s) => {
      shape(c, [s * 12, 7, s * 12, 1], false);
      c.stroke();
    });
    c.fillStyle = COLORS.amber;
    shape(c, [0, -10, 2.2, -4, -2.2, -4]);
    c.fill();
  });

  const shot = makeGlowSprite(4, 14, 6, COLORS.teal, 6, (c) => {
    c.fillStyle = COLORS.teal;
    c.fillRect(0, 0, 4, 14);
    c.fillStyle = '#ffffff';
    c.fillRect(1, 1, 2, 8);
  });

  const bolt = makeGlowSprite(8, 12, 6, COLORS.pink, 6, (c) => {
    c.fillStyle = COLORS.pink;
    shape(c, [4, 0, 8, 6, 4, 12, 0, 6]);
    c.fill();
    c.fillStyle = '#ffffff';
    shape(c, [4, 3, 5.5, 6, 4, 9, 2.5, 6]);
    c.fill();
  });

  // Wave badges for the right gutter: chevron per wave, a flag every five.
  const chevron = makeGlowSprite(12, 12, 4, COLORS.amber, 4, (c) => {
    c.strokeStyle = COLORS.amber;
    c.lineWidth = 2;
    shape(c, [1, 3, 6, 9, 11, 3], false);
    c.stroke();
  });
  const flag = makeGlowSprite(14, 16, 4, COLORS.pink, 5, (c) => {
    c.strokeStyle = COLORS.pink;
    c.fillStyle = 'rgba(255,92,147,0.35)';
    c.lineWidth = 2;
    shape(c, [2, 16, 2, 1, 13, 5, 2, 9], false);
    c.fill();
    c.stroke();
  });

  return { enemy, ship, shot, bolt, chevron, flag, pad: PAD, esize: ESIZE };
}

// Static backdrop: night room, gutters, the playfield frame and a low sunset
// glow along the bottom of the field. Drawn once.
export function buildBackdrop(W, H, PF) {
  return makeSprite(W, H, (c) => {
    c.fillStyle = COLORS.gutter;
    c.fillRect(0, 0, W, H);
    c.fillStyle = COLORS.night;
    c.fillRect(PF.x0, 0, PF.w, H);
    const g = c.createLinearGradient(0, H - 150, 0, H);
    g.addColorStop(0, 'rgba(255,92,147,0)');
    g.addColorStop(0.7, 'rgba(255,122,69,0.07)');
    g.addColorStop(1, 'rgba(255,181,71,0.13)');
    c.fillStyle = g;
    c.fillRect(PF.x0, H - 150, PF.w, 150);
    // Frame rails with teal corner brackets.
    c.strokeStyle = COLORS.frame;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(PF.x0 - 1, 0); c.lineTo(PF.x0 - 1, H);
    c.moveTo(PF.x1 + 1, 0); c.lineTo(PF.x1 + 1, H);
    c.stroke();
    c.strokeStyle = COLORS.teal;
    c.globalAlpha = 0.55;
    const k = 14;
    c.beginPath();
    for (const x of [PF.x0 - 1, PF.x1 + 1]) {
      const d = x < W / 2 ? 1 : -1;
      c.moveTo(x + d * k, 2); c.lineTo(x, 2); c.lineTo(x, 2 + k);
      c.moveTo(x + d * k, H - 2); c.lineTo(x, H - 2); c.lineTo(x, H - 2 - k);
    }
    c.stroke();
    c.globalAlpha = 1;
    // Faint gutter rules.
    c.strokeStyle = 'rgba(125,111,156,0.18)';
    c.lineWidth = 1;
    c.beginPath();
    for (const y of [70, 140, 214]) {
      c.moveTo(16, y); c.lineTo(PF.x0 - 16, y);
      c.moveTo(PF.x1 + 16, y); c.lineTo(W - 16, y);
    }
    c.stroke();
  });
}

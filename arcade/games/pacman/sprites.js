// Actor + fruit rendering. Everything is drawn with canvas primitives at the
// 224×288 logical resolution, so shapes quantize to the pixel grid and stay
// crisp under the integer upscale.
export const GHOST_COLORS = {
  blinky: '#ff0000',
  pinky: '#ffb8ff',
  inky: '#00ffff',
  clyde: '#ffb852',
};

const DIR_ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

// phase 0..1 = mouth openness (0 closed, 1 fully open ±55°).
export function drawPac(ctx, x, y, dirName, phase) {
  const r = 7;
  const open = phase * 0.96; // max half-angle in radians
  const a = DIR_ANGLE[dirName] ?? 0;
  ctx.fillStyle = '#ffff00';
  ctx.beginPath();
  if (open < 0.02) {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  } else {
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, a + open, a - open + Math.PI * 2);
    ctx.closePath();
  }
  ctx.fill();
}

// t 0..1: the death animation — mouth opens all the way around until the
// sprite folds away, then a short "pop" of petals.
export function drawPacDeath(ctx, x, y, t) {
  ctx.fillStyle = '#ffff00';
  if (t < 0.85) {
    const open = 0.35 + (t / 0.85) * (Math.PI - 0.35);
    const a = -Math.PI / 2; // dies facing up
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, 7, a + open, a - open + Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  } else {
    const k = (t - 0.85) / 0.15;
    const r = 2 + k * 6;
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5);
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.stroke();
    }
  }
}

// mode: 'normal' | 'fright' | 'frightFlash' | 'eyes'
export function drawGhost(ctx, x, y, { color = '#ff0000', dirName = 'left', frame = 0, mode = 'normal' } = {}) {
  const r = 7;
  const top = y - 2;

  if (mode !== 'eyes') {
    ctx.fillStyle = mode === 'fright' ? '#2121de' : mode === 'frightFlash' ? '#f8f8ff' : color;
    ctx.beginPath();
    ctx.arc(x, top, r, Math.PI, 0);
    ctx.lineTo(x + r, y + 5);
    // Wavy skirt: three scallops, alternating between two frames.
    const w = (r * 2) / 6;
    if (frame === 0) {
      for (let i = 0; i < 3; i++) {
        const sx = x + r - i * 2 * w;
        ctx.lineTo(sx - w, y + 2.5);
        ctx.lineTo(sx - 2 * w, y + 5);
      }
    } else {
      ctx.lineTo(x + r - w * 0.5, y + 2.5);
      for (let i = 0; i < 2; i++) {
        const sx = x + r - w * 0.5 - i * 2 * w;
        ctx.lineTo(sx - w, y + 5);
        ctx.lineTo(sx - 2 * w, y + 2.5);
      }
      ctx.lineTo(x - r, y + 5);
    }
    ctx.closePath();
    ctx.fill();
  }

  if (mode === 'fright' || mode === 'frightFlash') {
    const fg = mode === 'fright' ? '#ffb8ae' : '#ff0000';
    // dot eyes
    ctx.fillStyle = fg;
    ctx.fillRect(x - 4, top - 1, 2, 2);
    ctx.fillRect(x + 2, top - 1, 2, 2);
    // wavy mouth
    ctx.strokeStyle = fg;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 5, y + 2.5);
    for (let i = 0; i < 4; i++) {
      ctx.lineTo(x - 5 + (i * 2.5 + 1.25), y + (i % 2 === 0 ? 1 : 2.5) + 0.5);
    }
    ctx.stroke();
    return;
  }

  // Normal/eyes: white eyeballs with direction-offset pupils.
  const d = DIR_ANGLE[dirName] ?? Math.PI;
  const px = Math.cos(d) * 1.6;
  const py = Math.sin(d) * 1.6 - (dirName === 'up' ? 0.5 : 0);
  ctx.fillStyle = '#f8f8ff';
  for (const ex of [-3.5, 3.5]) {
    ctx.beginPath();
    ctx.ellipse(x + ex + px * 0.6, top - 1 + py * 0.6, 2.4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#2121de';
  for (const ex of [-3.5, 3.5]) {
    ctx.beginPath();
    ctx.arc(x + ex + px, top - 1 + py, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawFruit(ctx, x, y, name) {
  switch (name) {
    case 'cherry': {
      ctx.strokeStyle = '#00aa00';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 4, y - 5);
      ctx.quadraticCurveTo(x, y - 4, x - 3, y + 1);
      ctx.moveTo(x + 4, y - 5);
      ctx.quadraticCurveTo(x + 3, y - 1, x + 2, y + 2);
      ctx.stroke();
      ctx.fillStyle = '#ff0000';
      circle(x - 3, y + 3, 3);
      circle(x + 2, y + 4, 3);
      break;
    }
    case 'strawberry': {
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 2);
      ctx.quadraticCurveTo(x, y - 6, x + 5, y - 2);
      ctx.quadraticCurveTo(x + 4, y + 4, x, y + 6);
      ctx.quadraticCurveTo(x - 4, y + 4, x - 5, y - 2);
      ctx.fill();
      ctx.fillStyle = '#00aa00';
      ctx.fillRect(x - 2, y - 6, 4, 2);
      ctx.fillStyle = '#f8f8ff';
      for (const [sx, sy] of [[-2, 0], [1, 2], [-1, 3], [2, -1]]) ctx.fillRect(x + sx, y + sy, 1, 1);
      break;
    }
    case 'peach': {
      ctx.fillStyle = '#ffb847';
      circle(x, y + 1, 5);
      stem();
      break;
    }
    case 'apple': {
      ctx.fillStyle = '#ff0000';
      circle(x - 2, y + 1, 4);
      circle(x + 2, y + 1, 4);
      circle(x, y + 2, 4);
      stem();
      break;
    }
    case 'grapes': {
      ctx.fillStyle = '#00aa00';
      ctx.fillRect(x - 1, y - 6, 2, 3);
      ctx.fillStyle = '#a044ff';
      for (const [gx, gy] of [[-3, -1], [0, -2], [3, -1], [-2, 2], [1, 2], [-1, 5], [2, 4]]) {
        circle(x + gx, y + gy, 2.2);
      }
      break;
    }
    case 'galaxian': {
      ctx.fillStyle = '#ffff00';
      ctx.beginPath();
      ctx.moveTo(x, y + 5);
      ctx.lineTo(x - 5, y - 3);
      ctx.lineTo(x + 5, y - 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(x - 6, y - 4, 3, 2);
      ctx.fillRect(x + 3, y - 4, 3, 2);
      ctx.fillRect(x - 1, y - 6, 2, 4);
      break;
    }
    case 'bell': {
      ctx.fillStyle = '#ffff00';
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.quadraticCurveTo(x + 5, y - 4, x + 5, y + 3);
      ctx.lineTo(x - 5, y + 3);
      ctx.quadraticCurveTo(x - 5, y - 4, x, y - 6);
      ctx.fill();
      ctx.fillStyle = '#00ffff';
      ctx.fillRect(x - 5, y + 3, 10, 2);
      ctx.fillRect(x - 1, y + 5, 2, 2);
      break;
    }
    case 'key': {
      ctx.fillStyle = '#00ffff';
      ctx.beginPath();
      ctx.arc(x, y - 4, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a0a0e';
      ctx.beginPath();
      ctx.arc(x, y - 4, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f8f8ff';
      ctx.fillRect(x - 1, y - 1, 2, 7);
      ctx.fillRect(x + 1, y + 2, 2, 1);
      ctx.fillRect(x + 1, y + 4, 2, 1);
      break;
    }
    default: break;
  }

  function circle(cx, cy, r) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function stem() {
    ctx.strokeStyle = '#00aa00';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.quadraticCurveTo(x + 1, y - 6, x + 3, y - 7);
    ctx.stroke();
  }
}

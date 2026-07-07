// Menu attract mode, riffing on the original Pac-Man attract screen: the
// ghost roll-call ("CHARACTER / NICKNAME") across the top of the screen and
// an endless chase strip along the bottom, running behind the menu DOM.
import { drawPac, drawGhost, GHOST_COLORS } from './pacman/sprites.js';
import { drawText } from '../engine/font.js';

const ROLL = [
  { name: 'blinky', character: 'SHADOW', nickname: '"BLINKY"' },
  { name: 'pinky', character: 'SPEEDY', nickname: '"PINKY"' },
  { name: 'inky', character: 'BASHFUL', nickname: '"INKY"' },
  { name: 'clyde', character: 'POKEY', nickname: '"CLYDE"' },
];
const GHOSTS = ['blinky', 'pinky', 'inky', 'clyde'];

export function createAttract(screen) {
  const ctx = screen.ctx;
  let t = 0;

  return {
    tick() {
      t++;
      const W = screen.w;
      const H = screen.h;
      ctx.clearRect(0, 0, W, H);

      // --- roll-call band (top) ---
      drawText(ctx, 'CHARACTER / NICKNAME', W / 2, 18, { color: '#f8f8ff', scale: 2, align: 'center' });
      const idx = Math.floor(t / 200) % ROLL.length;
      const entry = ROLL[idx];
      const appear = t % 200; // staged reveal: sprite, then name, then nickname
      const cx = W / 2;
      ctx.save();
      ctx.translate(cx - 150, 62);
      ctx.scale(2.4, 2.4);
      drawGhost(ctx, 0, 0, {
        color: GHOST_COLORS[entry.name],
        dirName: 'right',
        frame: Math.floor(t / 12) % 2,
        mode: 'normal',
      });
      ctx.restore();
      if (appear > 40) {
        drawText(ctx, entry.character, cx - 110, 48, { color: GHOST_COLORS[entry.name], scale: 2 });
      }
      if (appear > 90) {
        drawText(ctx, entry.nickname, cx - 110, 68, { color: GHOST_COLORS[entry.name], scale: 2 });
      }

      // --- chase strip (bottom) ---
      const y = H - 46;
      const span = W + 240;
      const phase = (t * 1.6) % (span * 2);
      const fleeing = phase >= span; // second half: pac hunts blue ghosts
      const p = fleeing ? span * 2 - phase : phase;
      const px = p - 120;

      ctx.save();
      ctx.translate(0, y);
      const scale = 2;
      ctx.scale(scale, scale);
      const mouth = Math.abs(((t >> 2) % 4) - 2) / 2;
      if (!fleeing) {
        drawPac(ctx, px / scale, 0, 'right', mouth);
        GHOSTS.forEach((g, i) => {
          drawGhost(ctx, (px - 34 - i * 26) / scale, 0, {
            color: GHOST_COLORS[g],
            dirName: 'right',
            frame: Math.floor(t / 10) % 2,
            mode: 'normal',
          });
        });
      } else {
        drawPac(ctx, px / scale, 0, 'left', mouth);
        GHOSTS.forEach((g, i) => {
          drawGhost(ctx, (px - 40 - i * 30) / scale, 0, {
            dirName: 'left',
            frame: Math.floor(t / 10) % 2,
            mode: Math.floor(t / 16) % 4 === 0 ? 'frightFlash' : 'fright',
          });
        });
      }
      ctx.restore();

      // --- insert coin blink ---
      if (Math.floor(t / 40) % 2 === 0) {
        drawText(ctx, 'SELECT A GAME', W / 2, H - 20, { color: '#ffb8ae', align: 'center' });
      }
    },
  };
}

// Neon Snake — classic grid snake with glow trails.
import { makeGlowSprite } from '../engine/sprites.js';

export default {
  id: 'SNAKE',
  title: 'Neon Snake',
  mode: 'landscape',
  start(env) {
    const { ctx, W, H } = env;
    const grid = 20;
    let count = 0;
    let score = 0;
    let speedControl = 8;
    env.onScore(0);

    const applePad = 12;
    const appleSprite = makeGlowSprite(grid - 1, grid - 1, applePad, '#ef4444', 10, (c, w, h) => {
      c.fillStyle = '#ef4444';
      c.fillRect(0, 0, w, h);
    });
    const segPad = 10;
    const segSprite = makeGlowSprite(grid - 1, grid - 1, segPad, '#3b82f6', 8, (c, w, h) => {
      c.fillStyle = '#3b82f6';
      c.fillRect(0, 0, w, h);
    });

    const snake = {
      x: 160, y: 160,
      dx: grid, dy: 0,
      cells: [],
      maxCells: 4,
    };

    const apple = { x: 320, y: 320 };

    env.input.onKeyDown((e) => {
      if (e.key === 'ArrowLeft' && snake.dx === 0) { snake.dx = -grid; snake.dy = 0; }
      else if (e.key === 'ArrowUp' && snake.dy === 0) { snake.dy = -grid; snake.dx = 0; }
      else if (e.key === 'ArrowRight' && snake.dx === 0) { snake.dx = grid; snake.dy = 0; }
      else if (e.key === 'ArrowDown' && snake.dy === 0) { snake.dy = grid; snake.dx = 0; }
    });

    const deathSfx = () => env.audio.play('snake-death', (h) => {
      h.noise({ dur: 0.3, vol: 0.2 });
      h.tone({ f: 220, slideTo: 55, dur: 0.35, type: 'sawtooth', vol: 0.12 });
    });

    env.input.onSwipe((dir) => {
      if (dir === 'right' && snake.dx === 0) { snake.dx = grid; snake.dy = 0; }
      else if (dir === 'left' && snake.dx === 0) { snake.dx = -grid; snake.dy = 0; }
      else if (dir === 'down' && snake.dy === 0) { snake.dy = grid; snake.dx = 0; }
      else if (dir === 'up' && snake.dy === 0) { snake.dy = -grid; snake.dx = 0; }
    });

    const drawGrid = () => {
      ctx.strokeStyle = 'rgba(59,130,246,0.05)';
      ctx.beginPath();
      for (let x = grid; x < W; x += grid) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
      }
      for (let y = grid; y < H; y += grid) {
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.stroke();
    };

    return {
      tick() {
        if (env.fx.consumePause()) return;
        if (++count < speedControl) return;
        count = 0;

        ctx.clearRect(0, 0, W, H);
        const o = env.fx.shakeOffset();
        ctx.save();
        ctx.translate(o.x, o.y);
        drawGrid();
        env.fx.updateAndDraw();

        snake.x += snake.dx;
        snake.y += snake.dy;

        if (snake.x < 0 || snake.x >= W || snake.y < 0 || snake.y >= H) {
          env.fx.burst(snake.x + grid / 2, snake.y + grid / 2, 30, '#3b82f6', [2, 6], [20, 50]);
          env.fx.shake(6, 18);
          env.fx.hitPause(6);
          deathSfx();
          ctx.restore();
          env.onGameOver(score);
          return;
        }

        snake.cells.unshift({ x: snake.x, y: snake.y });
        if (snake.cells.length > snake.maxCells) snake.cells.pop();

        // Apple
        ctx.drawImage(appleSprite, apple.x - applePad, apple.y - applePad);

        // Snake
        for (let i = 0; i < snake.cells.length; i++) {
          ctx.drawImage(segSprite, snake.cells[i].x - segPad, snake.cells[i].y - segPad);
          if (i === 0) {
            ctx.fillStyle = '#93c5fd';
            ctx.fillRect(snake.cells[i].x + 5, snake.cells[i].y + 5, grid - 11, grid - 11);
          }

          if (snake.cells[i].x === apple.x && snake.cells[i].y === apple.y) {
            snake.maxCells++;
            score += 10;
            env.onScore(score);
            env.fx.burst(apple.x + 10, apple.y + 10, 10, '#ef4444', [1, 3], [10, 20]);
            env.fx.hitPause(2);
            const step = Math.min(snake.maxCells - 4, 24);
            env.audio.play('snake-eat', (h) => h.tone({
              f: 440 * Math.pow(2, step / 24), dur: 0.07, type: 'square', vol: 0.1,
            }));
            if (score % 100 === 0 && speedControl > 2) speedControl--;
            apple.x = Math.floor(Math.random() * (W / grid)) * grid;
            apple.y = Math.floor(Math.random() * (H / grid)) * grid;
          }

          for (let j = i + 1; j < snake.cells.length; j++) {
            if (snake.cells[i].x === snake.cells[j].x && snake.cells[i].y === snake.cells[j].y) {
              env.fx.burst(snake.x + grid / 2, snake.y + grid / 2, 30, '#3b82f6', [2, 6], [20, 50]);
              env.fx.shake(6, 18);
              env.fx.hitPause(6);
              deathSfx();
              ctx.restore();
              env.onGameOver(score);
              return;
            }
          }
        }
        ctx.restore();
      },
    };
  },
};

// Breakout — paddle, ball, and a 8x5 brick wall.
import { makeGlowSprite } from '../engine/sprites.js';

export default {
  id: 'BREAKOUT',
  title: 'Breakout',
  mode: 'landscape',
  start(env) {
    const { ctx, W, H } = env;
    ctx.clearRect(0, 0, W, H);

    let score = 0;
    let bricksDestroyed = 0;
    env.onScore(0);

    const paddleW = 100, paddleH = 12;
    let paddleX = (W - paddleW) / 2;

    const ballRadius = 6;
    let ballX = W / 2;
    let ballY = H - 40;
    const ballSpeedBase = 4;
    let ballDX = ballSpeedBase * (Math.random() > 0.5 ? 1 : -1);
    let ballDY = -ballSpeedBase;

    // Brick grid
    const cols = 8, rows = 5;
    const brickPad = 4;
    const brickTopOffset = 40;
    const rowColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];
    let bricks = [];

    // Prerendered glow sprites — blit instead of per-frame shadowBlur.
    // Sprite size rounds the fractional brick width up; gameplay rects
    // keep the exact computed width.
    const brickGlowPad = 10, paddleGlowPad = 12, ballGlowPad = 14;
    const brickSpriteW = Math.ceil((W - brickPad * (cols + 1)) / cols);
    const brickSprites = rowColors.map((color) =>
      makeGlowSprite(brickSpriteW, 18, brickGlowPad, color, 8, (c, w, h) => {
        c.fillStyle = color;
        c.fillRect(0, 0, w, h);
      }));
    const makePaddleSprite = (color) =>
      makeGlowSprite(paddleW, paddleH, paddleGlowPad, color, 10, (c, w, h) => {
        c.fillStyle = color;
        c.fillRect(0, 0, w, h);
      });
    const paddleSprite = makePaddleSprite('#e879f9');
    const paddleFlashSprite = makePaddleSprite('#ffffff');
    const ballSprite = makeGlowSprite(ballRadius * 2, ballRadius * 2, ballGlowPad, '#ffffff', 12, (c, w, h) => {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(w / 2, h / 2, ballRadius, 0, Math.PI * 2);
      c.fill();
    });

    // Visual-only state: ball trail, brick-hit streak, paddle flash.
    const trail = [];
    const trailMax = 6;
    let streak = 0;
    let paddleFlash = 0;

    function buildBricks() {
      bricks = [];
      const brickW = (W - brickPad * (cols + 1)) / cols;
      const brickH = 18;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          bricks.push({
            x: brickPad + c * (brickW + brickPad),
            y: brickTopOffset + r * (brickH + brickPad),
            w: brickW,
            h: brickH,
            color: rowColors[r],
            row: r,
            alive: true,
          });
        }
      }
    }
    buildBricks();

    const movePaddle = (x) => {
      paddleX = Math.max(0, Math.min(W - paddleW, x - paddleW / 2));
    };
    env.input.onMouseMove(movePaddle);
    env.input.onDrag(movePaddle);

    return {
      tick() {
        if (env.fx.consumePause()) return;

        ctx.clearRect(0, 0, W, H);
        const shake = env.fx.shakeOffset();
        ctx.save();
        ctx.translate(shake.x, shake.y);
        env.fx.updateAndDraw();

        // Move ball
        ballX += ballDX;
        ballY += ballDY;
        trail.push({ x: ballX, y: ballY });
        if (trail.length > trailMax) trail.shift();

        // Wall bounces
        if (ballX - ballRadius < 0 || ballX + ballRadius > W) {
          ballDX = -ballDX;
          env.audio.play('breakout-wall', (h) => h.tone({ f: 160, dur: 0.04, vol: 0.08 }));
        }
        if (ballY - ballRadius < 0) {
          ballDY = -ballDY;
          env.audio.play('breakout-wall', (h) => h.tone({ f: 160, dur: 0.04, vol: 0.08 }));
        }

        // Ball below paddle = game over
        if (ballY + ballRadius > H) {
          env.fx.shake(7, 20);
          env.audio.play('breakout-death', (h) => {
            h.noise({ dur: 0.25, vol: 0.16 });
            h.tone({ f: 300, slideTo: 50, dur: 0.4, type: 'sawtooth', vol: 0.12 });
          });
          ctx.restore();
          env.onGameOver(score);
          return;
        }

        // Paddle collision
        if (ballDY > 0 &&
          ballY + ballRadius >= H - 25 - paddleH &&
          ballY + ballRadius <= H - 25 &&
          ballX >= paddleX && ballX <= paddleX + paddleW) {
          // Angle based on hit position
          const hitPos = (ballX - paddleX) / paddleW; // 0..1
          const angle = (hitPos - 0.5) * Math.PI * 0.7; // -63deg to +63deg
          const speed = Math.sqrt(ballDX * ballDX + ballDY * ballDY);
          ballDX = speed * Math.sin(angle);
          ballDY = -speed * Math.cos(angle);
          streak = 0;
          paddleFlash = 4;
          env.audio.play('breakout-paddle', (h) => h.tone({ f: 220, dur: 0.05, vol: 0.12 }));
        }

        // Brick collisions
        for (let i = 0; i < bricks.length; i++) {
          const b = bricks[i];
          if (!b.alive) continue;

          if (ballX + ballRadius > b.x && ballX - ballRadius < b.x + b.w &&
            ballY + ballRadius > b.y && ballY - ballRadius < b.y + b.h) {
            b.alive = false;
            score += 10;
            bricksDestroyed++;
            env.onScore(score);
            env.fx.burst(b.x + b.w / 2, b.y + b.h / 2, 12, b.color, [1, 3], [15, 30]);
            env.fx.shake(Math.min(2 + streak, 6), 6);
            env.fx.hitPause(1);
            const brickFreq = [880, 784, 659, 587, 523][b.row];
            const streakFreq = brickFreq * Math.pow(2, Math.min(streak, 12) / 12);
            env.audio.play('breakout-brick', (h) => h.tone({ f: streakFreq, dur: 0.06, vol: 0.11 }));
            streak++;

            // Speed up every 15 bricks
            if (bricksDestroyed % 15 === 0) {
              const spd = Math.sqrt(ballDX * ballDX + ballDY * ballDY);
              const factor = (spd + 0.5) / spd;
              ballDX *= factor;
              ballDY *= factor;
            }

            // Determine bounce direction
            const overlapLeft = (ballX + ballRadius) - b.x;
            const overlapRight = (b.x + b.w) - (ballX - ballRadius);
            const overlapTop = (ballY + ballRadius) - b.y;
            const overlapBottom = (b.y + b.h) - (ballY - ballRadius);
            const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
            if (minOverlap === overlapTop || minOverlap === overlapBottom) ballDY = -ballDY;
            else ballDX = -ballDX;
            break;
          }
        }

        // All bricks cleared = reset with faster ball
        if (bricks.every(b => !b.alive)) {
          buildBricks();
          const spd = Math.sqrt(ballDX * ballDX + ballDY * ballDY);
          const factor = (spd + 1) / spd;
          ballDX *= factor;
          ballDY *= factor;
        }

        // Draw bricks
        for (let i = 0; i < bricks.length; i++) {
          const b = bricks[i];
          if (!b.alive) continue;
          ctx.drawImage(brickSprites[b.row], b.x - brickGlowPad, b.y - brickGlowPad);
        }

        // Ball trail, oldest first
        for (let i = 0; i < trail.length; i++) {
          const t = i / (trailMax - 1);
          ctx.globalAlpha = 0.05 + 0.25 * t;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(trail[i].x, trail[i].y, 2 + 3 * t, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Draw paddle
        ctx.drawImage(paddleFlash > 0 ? paddleFlashSprite : paddleSprite,
          paddleX - paddleGlowPad, H - 25 - paddleH - paddleGlowPad);
        if (paddleFlash > 0) paddleFlash--;

        // Draw ball
        ctx.drawImage(ballSprite, ballX - ballRadius - ballGlowPad, ballY - ballRadius - ballGlowPad);

        ctx.restore();
      },
    };
  },
};

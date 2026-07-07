// Asteroids — rotate, thrust, and shoot through splitting space rocks.
import { makeGlowSprite } from '../engine/sprites.js';
import { drawText } from '../engine/font.js';

const SHIP_PAD = 12;
const BULLET_PAD = 8;
const AST_PAD = 10;

export default {
  id: 'ASTEROIDS',
  title: 'Asteroids',
  mode: 'landscape',
  start(env) {
    const { ctx, W, H, input, fx } = env;
    ctx.clearRect(0, 0, W, H);

    let score = 0;
    let wave = 1;
    let frame = 0;
    let bannerTimer = 0;
    env.onScore(0);

    // Ship
    const ship = {
      x: W / 2,
      y: H / 2,
      angle: -Math.PI / 2,
      vx: 0, vy: 0,
      radius: 14,
    };

    const shipSprite = makeGlowSprite(ship.radius * 2, ship.radius * 2, SHIP_PAD, '#22d3ee', 10, (c) => {
      c.translate(ship.radius, ship.radius);
      c.strokeStyle = '#22d3ee';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(ship.radius, 0);
      c.lineTo(-ship.radius * 0.7, -ship.radius * 0.6);
      c.lineTo(-ship.radius * 0.4, 0);
      c.lineTo(-ship.radius * 0.7, ship.radius * 0.6);
      c.closePath();
      c.stroke();
    });

    const bulletSprite = makeGlowSprite(4, 4, BULLET_PAD, '#fbbf24', 6, (c) => {
      c.fillStyle = '#fbbf24';
      c.beginPath();
      c.arc(2, 2, 2, 0, Math.PI * 2);
      c.fill();
    });

    const bullets = [];
    const asteroids = [];
    let lastShot = 0;
    const SHOOT_COOLDOWN = 200;

    const touches = input.trackTouches();

    function spawnAsteroids(count) {
      for (let i = 0; i < count; i++) {
        let ax, ay;
        // Spawn away from ship
        do {
          ax = Math.random() * W;
          ay = Math.random() * H;
        } while (Math.hypot(ax - ship.x, ay - ship.y) < 120);
        const angle = Math.random() * Math.PI * 2;
        const spd = 0.5 + Math.random() * 1;
        asteroids.push(makeAsteroid(ax, ay, 40, Math.cos(angle) * spd, Math.sin(angle) * spd));
      }
      bannerTimer = 90;
    }

    function makeAsteroid(x, y, radius, vx, vy) {
      // Irregular polygon 8-12 vertices
      const verts = 8 + Math.floor(Math.random() * 5);
      const shape = [];
      for (let i = 0; i < verts; i++) {
        const a = (i / verts) * Math.PI * 2;
        const r = radius * (0.7 + Math.random() * 0.3);
        shape.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
      }
      const sprite = makeGlowSprite(radius * 2, radius * 2, AST_PAD, '#a78bfa', 5, (c) => {
        c.translate(radius, radius);
        c.strokeStyle = '#a78bfa';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(shape[0].x, shape[0].y);
        for (let v = 1; v < shape.length; v++) {
          c.lineTo(shape[v].x, shape[v].y);
        }
        c.closePath();
        c.stroke();
      });
      const pts = radius >= 35 ? 20 : radius >= 18 ? 50 : 100;
      return { x, y, vx, vy, radius, sprite, points: pts };
    }

    spawnAsteroids(3 + wave);

    input.onKeyDown((e) => {
      if (e.key === ' ') shoot();
    });

    function getTouchZone(t) {
      if (t.x < W * 0.25) return 'left';
      if (t.x > W * 0.75) return 'right';
      if (t.y > H * 0.6) return 'thrust';
      return 'shoot';
    }

    function touchActive(zone) {
      for (const t of touches.values()) {
        if (getTouchZone(t) === zone) return true;
      }
      return false;
    }

    input.onTap((x, y) => {
      if (getTouchZone({ x, y }) === 'shoot') shoot();
    });

    function shoot() {
      const now = Date.now();
      if (now - lastShot < SHOOT_COOLDOWN) return;
      lastShot = now;
      env.audio.play('ast-shoot', (h) => h.tone({ f: 880, slideTo: 120, dur: 0.12, vol: 0.1 }));
      bullets.push({
        x: ship.x + Math.cos(ship.angle) * ship.radius,
        y: ship.y + Math.sin(ship.angle) * ship.radius,
        vx: Math.cos(ship.angle) * 6 + ship.vx * 0.5,
        vy: Math.sin(ship.angle) * 6 + ship.vy * 0.5,
        life: 60,
      });
    }

    function wrap(obj) {
      if (obj.x < 0) obj.x += W;
      if (obj.x > W) obj.x -= W;
      if (obj.y < 0) obj.y += H;
      if (obj.y > H) obj.y -= H;
    }

    return {
      tick() {
        if (fx.consumePause()) return;
        ctx.clearRect(0, 0, W, H);
        frame++;
        const shake = fx.shakeOffset();
        ctx.save();
        ctx.translate(shake.x, shake.y);
        fx.updateAndDraw();

        // Input processing
        const rotSpeed = 0.06;
        if (input.held('ArrowLeft') || touchActive('left')) ship.angle -= rotSpeed;
        if (input.held('ArrowRight') || touchActive('right')) ship.angle += rotSpeed;
        const thrusting = input.held('ArrowUp') || touchActive('thrust');
        if (thrusting) {
          ship.vx += Math.cos(ship.angle) * 0.12;
          ship.vy += Math.sin(ship.angle) * 0.12;
          env.audio.setLoop('ast-thrust', (h) => {
            const length = Math.floor(h.ctx.sampleRate * 0.5);
            const buffer = h.ctx.createBuffer(1, length, h.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let s = 0; s < length; s++) data[s] = Math.random() * 2 - 1;
            const src = h.ctx.createBufferSource();
            src.buffer = buffer;
            src.loop = true;
            const filter = h.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 110;
            const gain = h.ctx.createGain();
            gain.gain.value = 0.12;
            src.connect(filter).connect(gain).connect(h.out);
            src.start();
            return () => { try { src.stop(); } catch { /* already stopped */ } };
          });
        } else {
          env.audio.stopLoop();
        }

        // Friction
        ship.vx *= 0.995;
        ship.vy *= 0.995;
        ship.x += ship.vx;
        ship.y += ship.vy;
        wrap(ship);

        if (thrusting && frame % 2 === 0) {
          fx.burst(
            ship.x - Math.cos(ship.angle) * ship.radius,
            ship.y - Math.sin(ship.angle) * ship.radius,
            2, '#f97316', [0.5, 2], [8, 18]
          );
        }

        // Draw ship (neon cyan wireframe triangle)
        ctx.save();
        ctx.translate(ship.x, ship.y);
        ctx.rotate(ship.angle);
        ctx.drawImage(shipSprite, -SHIP_PAD - ship.radius, -SHIP_PAD - ship.radius);

        // Thrust flame
        if (thrusting) {
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-ship.radius * 0.5, -ship.radius * 0.25);
          ctx.lineTo(-ship.radius * 0.9 - Math.random() * 5, 0);
          ctx.lineTo(-ship.radius * 0.5, ship.radius * 0.25);
          ctx.stroke();
        }
        ctx.restore();

        // Bullets
        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i];
          b.x += b.vx;
          b.y += b.vy;
          b.life--;
          wrap(b);
          if (b.life <= 0) { bullets.splice(i, 1); continue; }
          ctx.drawImage(bulletSprite, b.x - BULLET_PAD - 2, b.y - BULLET_PAD - 2);
        }

        // Asteroids
        for (let i = asteroids.length - 1; i >= 0; i--) {
          const a = asteroids[i];
          a.x += a.vx;
          a.y += a.vy;
          wrap(a);

          ctx.drawImage(a.sprite, a.x - a.radius - AST_PAD, a.y - a.radius - AST_PAD);

          // Bullet-asteroid collision
          for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if (Math.hypot(b.x - a.x, b.y - a.y) < a.radius) {
              score += a.points;
              env.onScore(score);
              bullets.splice(j, 1);
              const big = a.radius >= 35;
              const mid = !big && a.radius >= 18;
              fx.burst(a.x, a.y, big ? 30 : mid ? 20 : 12, '#a78bfa', [1, 4], [20, 40]);
              if (big) {
                fx.shake(4, 10);
                fx.hitPause(2);
              } else if (mid) {
                fx.shake(2, 6);
              }
              env.audio.play('ast-explode', (h) => h.noise({
                dur: big ? 0.5 : mid ? 0.35 : 0.22,
                vol: big ? 0.25 : mid ? 0.18 : 0.14,
                filterFrom: big ? 1200 : 2400,
              }));

              // Split
              if (big) {
                // Large -> 2 medium
                for (let k = 0; k < 2; k++) {
                  const ang = Math.random() * Math.PI * 2;
                  const spd = 1 + Math.random() * 1;
                  asteroids.push(makeAsteroid(a.x, a.y, 20, Math.cos(ang) * spd, Math.sin(ang) * spd));
                }
              } else if (mid) {
                // Medium -> 2 small
                for (let k = 0; k < 2; k++) {
                  const ang = Math.random() * Math.PI * 2;
                  const spd = 1.5 + Math.random() * 1.5;
                  asteroids.push(makeAsteroid(a.x, a.y, 10, Math.cos(ang) * spd, Math.sin(ang) * spd));
                }
              }
              asteroids.splice(i, 1);
              break;
            }
          }
        }

        // Ship-asteroid collision
        for (let i = 0; i < asteroids.length; i++) {
          if (Math.hypot(ship.x - asteroids[i].x, ship.y - asteroids[i].y) < ship.radius + asteroids[i].radius * 0.7) {
            fx.burst(ship.x, ship.y, 50, '#22d3ee', [2, 8], [30, 60]);
            fx.shake(8, 24);
            env.audio.play('ast-death', (h) => {
              h.noise({ dur: 0.6, vol: 0.28, filterFrom: 1000 });
              h.tone({ f: 160, slideTo: 40, dur: 0.6, type: 'sawtooth', vol: 0.12 });
            });
            ctx.restore();
            env.onGameOver(score);
            return;
          }
        }

        // Wave cleared
        if (asteroids.length === 0) {
          wave++;
          spawnAsteroids(3 + wave);
          env.audio.play('ast-wave', (h) => h.seq([
            { f: 660, vol: 0.1 }, { f: 880, vol: 0.1 }, { f: 1100, vol: 0.1 },
          ], 0.08));
        }

        if (bannerTimer > 0) {
          bannerTimer--;
          ctx.globalAlpha = Math.min(1, bannerTimer / 30);
          drawText(ctx, `WAVE ${wave}`, W / 2, 60, { color: '#22d3ee', scale: 3, align: 'center' });
          ctx.globalAlpha = 1;
        }

        ctx.restore();
      },
    };
  },
};

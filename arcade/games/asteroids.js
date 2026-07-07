// Asteroids — rotate, thrust, and shoot through splitting space rocks.

export default {
  id: 'ASTEROIDS',
  title: 'Asteroids',
  mode: 'landscape',
  start(env) {
    const { ctx, W, H, input, fx } = env;
    ctx.clearRect(0, 0, W, H);

    let score = 0;
    let wave = 1;
    env.onScore(0);

    // Ship
    const ship = {
      x: W / 2,
      y: H / 2,
      angle: -Math.PI / 2,
      vx: 0, vy: 0,
      radius: 14,
    };

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
      const pts = radius >= 35 ? 20 : radius >= 18 ? 50 : 100;
      return { x, y, vx, vy, radius, shape, points: pts };
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
        ctx.clearRect(0, 0, W, H);
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

        // Draw ship (neon cyan wireframe triangle)
        ctx.save();
        ctx.translate(ship.x, ship.y);
        ctx.rotate(ship.angle);
        ctx.strokeStyle = '#22d3ee';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#22d3ee';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ship.radius, 0);
        ctx.lineTo(-ship.radius * 0.7, -ship.radius * 0.6);
        ctx.lineTo(-ship.radius * 0.4, 0);
        ctx.lineTo(-ship.radius * 0.7, ship.radius * 0.6);
        ctx.closePath();
        ctx.stroke();

        // Thrust flame
        if (thrusting) {
          ctx.strokeStyle = '#f97316';
          ctx.shadowColor = '#f97316';
          ctx.beginPath();
          ctx.moveTo(-ship.radius * 0.5, -ship.radius * 0.25);
          ctx.lineTo(-ship.radius * 0.9 - Math.random() * 5, 0);
          ctx.lineTo(-ship.radius * 0.5, ship.radius * 0.25);
          ctx.stroke();
        }
        ctx.restore();
        ctx.shadowBlur = 0;

        // Bullets
        ctx.fillStyle = '#fbbf24';
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#fbbf24';
        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i];
          b.x += b.vx;
          b.y += b.vy;
          b.life--;
          wrap(b);
          if (b.life <= 0) { bullets.splice(i, 1); continue; }
          ctx.beginPath();
          ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;

        // Asteroids
        ctx.strokeStyle = '#a78bfa';
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#a78bfa';
        ctx.lineWidth = 1.5;
        for (let i = asteroids.length - 1; i >= 0; i--) {
          const a = asteroids[i];
          a.x += a.vx;
          a.y += a.vy;
          wrap(a);

          // Draw asteroid
          ctx.beginPath();
          ctx.moveTo(a.x + a.shape[0].x, a.y + a.shape[0].y);
          for (let v = 1; v < a.shape.length; v++) {
            ctx.lineTo(a.x + a.shape[v].x, a.y + a.shape[v].y);
          }
          ctx.closePath();
          ctx.stroke();

          // Bullet-asteroid collision
          for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if (Math.hypot(b.x - a.x, b.y - a.y) < a.radius) {
              score += a.points;
              env.onScore(score);
              bullets.splice(j, 1);
              fx.burst(a.x, a.y, 20, '#a78bfa', [1, 4], [20, 40]);
              const big = a.radius >= 35;
              const mid = !big && a.radius >= 18;
              env.audio.play('ast-explode', (h) => h.noise({
                dur: big ? 0.5 : mid ? 0.35 : 0.22,
                vol: big ? 0.25 : mid ? 0.18 : 0.14,
                filterFrom: big ? 1200 : 2400,
              }));

              // Split
              if (a.radius >= 35) {
                // Large -> 2 medium
                for (let k = 0; k < 2; k++) {
                  const ang = Math.random() * Math.PI * 2;
                  const spd = 1 + Math.random() * 1;
                  asteroids.push(makeAsteroid(a.x, a.y, 20, Math.cos(ang) * spd, Math.sin(ang) * spd));
                }
              } else if (a.radius >= 18) {
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
        ctx.shadowBlur = 0;

        // Ship-asteroid collision
        for (let i = 0; i < asteroids.length; i++) {
          if (Math.hypot(ship.x - asteroids[i].x, ship.y - asteroids[i].y) < ship.radius + asteroids[i].radius * 0.7) {
            fx.burst(ship.x, ship.y, 50, '#22d3ee', [2, 8], [30, 60]);
            env.audio.play('ast-death', (h) => {
              h.noise({ dur: 0.6, vol: 0.28, filterFrom: 1000 });
              h.tone({ f: 160, slideTo: 40, dur: 0.6, type: 'sawtooth', vol: 0.12 });
            });
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
      },
    };
  },
};

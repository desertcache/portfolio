// Flat ink-and-paper particles for Mesa Lander: dust puffs, exhaust smoke, debris,
// confetti and sparks. A fixed-size list, no glow and no shadows, so a crash costs
// next to nothing even on a phone.
import { PAL, TAU } from './art.js';
import { surfaceAt } from './physics.js';

const CONFETTI = [PAL.turq, PAL.mustard, PAL.sunset, PAL.sage, PAL.paperHi];
const DEBRIS = [PAL.paperHi, PAL.sunset, PAL.turq, PAL.ink2, PAL.paperHi];

export class Parts {
  constructor(max = 240) {
    this.max = max;
    this.list = [];
  }

  get count() { return this.list.length; }

  clear() { this.list.length = 0; }

  add(p) {
    if (this.list.length < this.max) this.list.push(p);
  }

  dust(x, y, vx, vy, r = 5, life = 34) {
    this.add({ k: 'dust', x, y, vx, vy, life, max: life, r, rot: 0, vr: 0, color: PAL.sand });
  }

  smoke(x, y, vx, vy, r = 3.5, life = 22) {
    this.add({ k: 'smoke', x, y, vx, vy, life, max: life, r, rot: 0, vr: 0, color: PAL.paperHi });
  }

  spark(x, y, vx, vy, life = 20) {
    this.add({ k: 'spark', x, y, vx, vy, life, max: life, r: 2, rot: 0, vr: 0, color: PAL.mustard });
  }

  debris(x, y, vx, vy, rand) {
    const life = 60 + Math.floor(rand() * 40);
    this.add({
      k: 'debris', x, y, vx, vy, life, max: life, r: 2.5 + rand() * 2.5,
      rot: rand() * TAU, vr: (rand() - 0.5) * 0.5, color: DEBRIS[Math.floor(rand() * DEBRIS.length)],
    });
  }

  confetti(x, y, vx, vy, rand) {
    const life = 80 + Math.floor(rand() * 50);
    this.add({
      k: 'confetti', x, y, vx, vy, life, max: life, r: 3 + rand() * 2,
      rot: rand() * TAU, vr: (rand() - 0.5) * 0.4, color: CONFETTI[Math.floor(rand() * CONFETTI.length)],
    });
  }

  /** A ring of dust and chunks for a crash. */
  crash(x, y, rand) {
    for (let i = 0; i < 14; i++) {
      const a = Math.PI + rand() * Math.PI; // thrown upward
      const v = 1.2 + rand() * 3.2;
      this.debris(x, y, Math.cos(a) * v, Math.sin(a) * v - 0.8, rand);
    }
    for (let i = 0; i < 12; i++) {
      const a = rand() * TAU;
      const v = 0.6 + rand() * 1.8;
      this.dust(x + Math.cos(a) * 6, y + Math.sin(a) * 3, Math.cos(a) * v, Math.sin(a) * v * 0.5 - 0.3, 6 + rand() * 5, 34 + Math.floor(rand() * 22));
    }
    for (let i = 0; i < 6; i++) this.spark(x, y, (rand() - 0.5) * 5, -rand() * 4 - 1, 16 + Math.floor(rand() * 10));
  }

  /** @param {import('./physics.js').Terrain | null} [terrain] debris and confetti come to rest on it */
  update(terrain = null) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life--;
      if (p.k === 'debris') {
        p.vy += 0.14;
      } else if (p.k === 'confetti') {
        p.vy += 0.045;
        p.vx *= 0.985;
        if (p.vy > 1.3) p.vy = 1.3;
      } else if (p.k === 'dust') {
        p.vx *= 0.96;
        p.vy *= 0.96;
      } else if (p.k === 'smoke') {
        p.vx *= 0.97;
        p.vy *= 0.97;
      } else if (p.k === 'spark') {
        p.vy += 0.1;
      }
      if (terrain && (p.k === 'debris' || p.k === 'confetti') && p.x > 0 && p.x < terrain.W) {
        const ground = surfaceAt(terrain, p.x);
        if (p.y > ground) {
          p.y = ground;
          p.vy = 0;
          p.vx *= 0.6;
          p.vr = 0;
        }
      }
      if (p.life <= 0) {
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
  }

  /**
   * Draw the particles. Dust and smoke belong behind the lander ('under'), the rest in
   * front of it ('over'); with no layer, all of them.
   * @param {CanvasRenderingContext2D} c
   * @param {'under' | 'over'} [layer]
   */
  draw(c, layer) {
    c.lineWidth = 1.2;
    c.strokeStyle = PAL.ink2;
    for (const p of this.list) {
      if (layer) {
        const under = p.k === 'dust' || p.k === 'smoke';
        if (under !== (layer === 'under')) continue;
      }
      const t = p.life / p.max;
      if (p.k === 'dust') {
        const r = p.r * (1 + (1 - t) * 0.8);
        c.globalAlpha = Math.min(1, t * 1.6);
        c.beginPath(); c.arc(p.x, p.y, r, 0, TAU);
        c.fillStyle = p.color; c.fill(); c.stroke();
      } else if (p.k === 'smoke') {
        const r = p.r * (0.7 + (1 - t) * 0.9);
        c.globalAlpha = Math.min(1, t * 1.4) * 0.9;
        c.beginPath(); c.arc(p.x, p.y, r, 0, TAU);
        c.fillStyle = p.color; c.fill(); c.stroke();
      } else if (p.k === 'spark') {
        c.globalAlpha = Math.min(1, t * 2);
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU);
        c.fillStyle = p.color; c.fill();
      } else {
        c.globalAlpha = Math.min(1, t * 3);
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.fillStyle = p.color;
        if (p.k === 'confetti') {
          const w = p.r * 2 * Math.abs(Math.cos(p.rot * 1.7));
          c.fillRect(-w / 2, -p.r * 0.6, Math.max(1.5, w), p.r * 1.2);
        } else {
          c.beginPath();
          c.moveTo(-p.r, -p.r * 0.7); c.lineTo(p.r, -p.r * 0.3); c.lineTo(p.r * 0.5, p.r * 0.8); c.lineTo(-p.r * 0.8, p.r * 0.5);
          c.closePath();
          c.fill();
          c.stroke();
        }
        c.restore();
      }
    }
    c.globalAlpha = 1;
  }
}

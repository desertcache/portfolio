// Dust Devil Pinball: one table on the tall screen. Real physics (substeps, rotating
// flippers, impulses from the surface's own velocity: see pinball/physics.js), the rules in
// pinball/rules.js, and flat ink-and-paper drawing in pinball/art.js. This file is the
// cabinet's side of it: input, one tick of rules and physics, sounds, then the drawing.
import { createGame } from './pinball/rules.js';
import * as P from './pinball/physics.js';
import { TABLE } from './pinball/table.js';
import { mulberry32 } from './pinball/rng.js';
import { createArt } from './pinball/art.js';
import { createStrip } from './pinball/strip.js';
import { createSfx } from './pinball/sfx.js';
import { PAL } from './pinball/gfx.js';

const LEFT = ['ArrowLeft', 'z', 'Z'];
const RIGHT = ['ArrowRight', '/', '?'];
const PLUNGE = [' ', 'Spacebar', 'ArrowDown'];
const TAU = Math.PI * 2;

// Four dots on a ball, spread so some are always on the visible side: they roll with it.
const MARKS = [[0.577, 0.577, 0.577], [-0.577, -0.577, 0.577], [-0.577, 0.577, -0.577], [0.577, -0.577, -0.577]];

export default {
  id: 'PINBALL',
  title: 'Dust Devil Pinball',
  mode: 'tall',
  ownHud: true,
  start(env) {
    const { ctx, W, input, audio } = env;
    const rng = env.debug ? mulberry32(0xd057) : Math.random; // the game's: skill lane, nudges, ball search
    const fxRng = env.debug ? mulberry32(0x5eed) : Math.random; // the looks' own, so particles never change play
    // Reduced motion: no screen shake, and lamps and messages hold steady instead of blinking.
    const calm = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const g = createGame({ rng });
    const art = createArt(TABLE);
    const strip = createStrip();
    const sfx = createSfx(audio);

    // ---------------------------------------------------------------- input
    const touches = input.trackTouches();
    const latch = { L: false, R: false, plunger: false, nudge: false };
    const dbg = { L: false, R: false, plunger: false, nudge: false };
    const hold = { L: 0, R: 0 };
    input.onKeyDown((e) => {
      if (e.key === '/' || e.key === '?') e.preventDefault(); // Firefox would open quick find
      if (e.repeat) return;
      if (LEFT.includes(e.key)) latch.L = true;
      else if (RIGHT.includes(e.key)) latch.R = true;
      else if (PLUNGE.includes(e.key)) latch.plunger = true;
      else if (e.key === 'ArrowUp') latch.nudge = true;
    });
    const anyHeld = (keys) => keys.some((k) => input.held(k));

    // ---------------------------------------------------------------- view state
    const view = {
      t: 0, shake: 0, touch: false, calm, swirl: 0, trail: [], parts: [], marks: MARKS.map((m) => m.slice()),
    };
    let lastScore = -1;
    let spinCount = 0;
    let reported = false;

    function readInput() {
      let left = anyHeld(LEFT) || latch.L || dbg.L;
      let right = anyHeld(RIGHT) || latch.R || dbg.R;
      let plunger = anyHeld(PLUNGE) || latch.plunger || dbg.plunger;
      const nudge = latch.nudge || dbg.nudge;
      latch.L = latch.R = latch.plunger = latch.nudge = false;
      dbg.nudge = false;

      // Touch: the left half of the screen holds the left flipper and the right half the right one,
      // both at once if you like. While the ball sits on the plunger any touch pulls it instead.
      if (touches.size > 0) {
        view.touch = true;
        if (g.phase === 'serve' && P.ballOnPlunger(g.world)) {
          plunger = true;
        } else {
          let tl = false, tr = false;
          for (const t of touches.values()) { if (t.x < W / 2) tl = true; else tr = true; }
          // a tap shorter than a tick is still seen for a few ticks, so the flipper has time to swing
          if (tl) hold.L = 4;
          if (tr) hold.R = 4;
        }
      }
      if (hold.L > 0) { hold.L--; left = true; }
      if (hold.R > 0) { hold.R--; right = true; }
      return { left, right, plunger, nudge };
    }

    // ---------------------------------------------------------------- effects
    function puff(x, y, n, color, speed = 1.6, r = 3) {
      for (let i = 0; i < n && view.parts.length < 90; i++) {
        const a = (i / n) * TAU + fxRng() * 0.8;
        const s = speed * (0.5 + fxRng() * 0.7);
        const life = 16 + Math.floor(fxRng() * 12);
        view.parts.push({ kind: 'puff', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, r: r * (0.7 + fxRng() * 0.6), color });
      }
    }
    function chips(x, y, n, color) {
      for (let i = 0; i < n && view.parts.length < 90; i++) {
        const a = -Math.PI / 2 + (fxRng() - 0.5) * 2.4;
        const s = 1.2 + fxRng() * 2.2;
        const life = 26 + Math.floor(fxRng() * 14);
        view.parts.push({ kind: 'chip', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, r: 2 + fxRng() * 1.6, color, rot: fxRng() * TAU, vrot: (fxRng() - 0.5) * 0.5 });
      }
    }
    function confetti(x, y, n) {
      const cols = [PAL.mustard, PAL.turq, PAL.terracotta, PAL.paperLight, PAL.sage];
      for (let i = 0; i < n; i++) chips(x, y, 1, cols[i % cols.length]);
    }

    function shake(amount) { if (!calm) view.shake = Math.max(view.shake, amount); }

    function react() {
      const w = g.world;
      for (const c of g.cues) {
        switch (c.t) {
          case 'flip': sfx.flip(); break;
          case 'bumper': {
            sfx.bumper(c.i);
            shake(1.3);
            const b = w.bumpers[c.i];
            puff(b.x, b.y, 7, PAL.paperLight, 1.8, 3.2);
            break;
          }
          case 'sling': {
            sfx.sling();
            shake(1.1);
            const s = w.slings[c.i];
            puff((s.ax + s.bx) / 2 + s.nx * 6, (s.ay + s.by) / 2 + s.ny * 6, 4, PAL.sand, 1.5, 2.6);
            break;
          }
          case 'spin': if ((spinCount++ & 1) === 0) sfx.spin(); break;
          case 'target': {
            sfx.target();
            const t = w.targets[c.i];
            chips((t.ax + t.bx) / 2, (t.ay + t.by) / 2, 6, PAL.redrock);
            break;
          }
          case 'bank': sfx.bank(); confetti(358, 340, 10); break;
          case 'lane': sfx.lane(c.i, c.fresh); break;
          case 'laneSet': sfx.laneSet(); confetti(225, 130, 10); break;
          case 'launch': sfx.launch(); break;
          case 'gate': sfx.gate(); break;
          case 'orbit': sfx.orbit(); break;
          case 'orbitTop': sfx.orbitTop(); break;
          case 'drain': sfx.drain(); break;
          case 'saved': sfx.saved(); break;
          case 'skill': sfx.skill(); confetti(225, 120, 16); break;
          case 'extra': sfx.extra(); confetti(225, 300, 18); break;
          case 'jackpot': sfx.jackpot(); confetti(225, 300, 18); break;
          case 'tilt': sfx.tilt(); shake(5); break;
          case 'warn': sfx.warn(); shake(3); break;
          case 'nudge': sfx.nudge(); shake(3.5); break;
          case 'wall': if (g.tick % 3 === 0) sfx.wall(c.speed); break;
          case 'bonusTick': sfx.bonusTick(); break;
          case 'serve': if (!c.first) sfx.serve(); break;
          case 'over': sfx.over(); break;
          default: break;
        }
      }
    }

    /** Roll the dots on the ball: a rotation about the axis at right angles to its motion. */
    function rollBall() {
      const b = g.world.ball;
      if (!b.active) return;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp < 2) return;
      const ang = Math.min(0.6, sp / 60 / P.BALL_R);
      const ax = -b.vy / sp, ay = b.vx / sp;
      const cs = Math.cos(ang), sn = Math.sin(ang);
      for (const m of view.marks) {
        const [x, y, z] = m;
        const dot = ax * x + ay * y; // a . m   (the axis has no z part)
        m[0] = x * cs + ay * z * sn + ax * dot * (1 - cs);
        m[1] = y * cs - ax * z * sn + ay * dot * (1 - cs);
        m[2] = z * cs + (ax * y - ay * x) * sn;
      }
    }

    function stepView() {
      view.t++;
      view.shake *= 0.86;
      const sp = g.world.spinners[0];
      view.swirl += 0.03 + Math.max(-0.5, Math.min(0.5, sp.omega / 60));
      for (let i = view.parts.length - 1; i >= 0; i--) {
        const p = view.parts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.kind === 'chip') { p.vy += 0.13; p.rot += p.vrot; } else { p.vx *= 0.93; p.vy *= 0.93; }
        if (--p.life <= 0) view.parts.splice(i, 1);
      }
      rollBall();
      const b = g.world.ball;
      if (b.active) {
        view.trail.push(b.x, b.y);
        if (view.trail.length > 8) view.trail.splice(0, 2); // the last four positions
      } else view.trail.length = 0;
    }

    // ---------------------------------------------------------------- the strip's content
    function stripState() {
      const m = g.msg;
      const plunger = g.world.plunger;
      const pulling = g.phase === 'serve' && plunger.state === 'pulling' && plunger.pull > 0.04;
      return {
        score: g.score,
        mult: g.mult,
        ball: g.ball,
        balls: g.ballsTotal,
        extra: g.extra,
        bonus: g.phase === 'bonus' || g.phase === 'drained' ? Math.max(0, g.count.total - g.count.shown) : g.bonus,
        msg: m ? m.text : null,
        hot: m ? (calm ? true : g.tick - m.born < 36 && Math.floor((g.tick - m.born) / 9) % 2 === 0) : false,
        save: g.save.t,
        award: g.orbitLit,
        tilted: g.tilt.tilted,
        power: pulling ? { frac: plunger.pull, min: P.PLUNGE_MIN } : null,
      };
    }

    // ---------------------------------------------------------------- debug hooks
    if (env.debug) {
      env.expose({
        get ball() { const b = g.world.ball; return { x: b.x, y: b.y, vx: b.vx, vy: b.vy, active: b.active, inLane: b.inLane }; },
        get flippers() { const f = g.world.flippers; return { L: f[0].angle, R: f[1].angle, held: { L: f[0].held, R: f[1].held } }; },
        get score() { return g.score; },
        get ballNumber() { return g.ball; },
        get ballsLeft() { return g.ballsTotal - g.ball + g.extra; },
        get lanes() { return g.lanes.slice(); },
        get skillLane() { return g.skill.lane; },
        get skillLive() { return g.skill.live; },
        get targets() { return g.world.targets.map((t) => t.down); },
        get tiltWarnings() { return g.tilt.warnings; },
        get tilted() { return g.tilt.tilted; },
        get ballSave() { return g.save.t; },
        get multiplier() { return g.mult; },
        get bonus() { return g.bonus; },
        get orbitLit() { return g.orbitLit; },
        get phase() { return g.phase; },
        get plunger() { return { pull: g.world.plunger.pull, state: g.world.plunger.state }; },
        get stats() { return { ...g.stats }; },
        get message() { return g.msg ? g.msg.text : null; },
        get game() { return g; },
      });
      env.exposeActions({
        /** Put the ball anywhere on the table, in play. */
        placeBall(x, y, vx = 0, vy = 0) { g.debugPlace(x, y, vx, vy); return true; },
        /** Hold (down true) or release a flipper, 'L' or 'R', on top of the real keys. */
        flip(side, down = true) { dbg[side === 'R' ? 'R' : 'L'] = !!down; return true; },
        /** Fire the plunger at once with this pull, 0 to 1. Only while the ball is on it. */
        launch(power = 1) {
          if (!(g.phase === 'serve' && P.ballOnPlunger(g.world))) return false;
          P.launch(g.world, power);
          return true;
        },
        /** Pull the plunger (down true) or let go. */
        plunge(down = true) { dbg.plunger = !!down; return true; },
        /** Lose the ball now. */
        drain() { g.debugPlace(208, 735, 0, 0); return true; },
        nudge() { dbg.nudge = true; return true; },
        /** Pretend the ball hit drop target i / rolled top lane i. */
        hitTarget(i) { g.world.targets[i].down = true; g.dispatch({ type: 'target', i, speed: 300 }); return true; },
        lane(i) { g.dispatch({ type: 'lane', i }); return true; },
      });
    }

    // ---------------------------------------------------------------- the tick
    return {
      tick() {
        g.update(readInput());
        react();
        stepView();
        if (g.score !== lastScore) { lastScore = g.score; env.onScore(g.score); }
        art.draw(ctx, g, view);
        strip.draw(ctx, stripState());
        if (g.finished && !reported) { reported = true; env.onGameOver(g.score); }
      },
    };
  },
};

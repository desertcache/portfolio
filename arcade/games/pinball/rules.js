// Dust Devil Pinball rules: scoring and the ball-by-ball game. Pure module (no DOM): the
// cabinet module feeds it the player's inputs once per 60 Hz tick and reads back the state to
// draw and the `cues` to make sounds, and Node tests drive it with the same calls.
import * as P from './physics.js';
import { TABLE } from './table.js';

export const BALLS = 3;
export const SAVE_TICKS = 8 * 60; // the ball save lasts this long after the ball leaves the lane
export const SKILL_TICKS = 7 * 60; // how long after the plunge the skill shot stays live
export const BANK_RESET_TICKS = 55; // the drop targets stay down this long after the bank is cleared
export const MULT_MAX = 5;

export const SCORE = {
  bumper: 250,
  sling: 50,
  spin: 100,
  lane: 500, // a lane lit for the first time
  laneAgain: 100,
  laneSet: 2000, // all three lit, times the new multiplier
  multMax: 5000, // all three lit again at the top multiplier
  target: 750,
  bank: 10000,
  orbitIn: 1000, // the ball goes up the orbit
  orbit: 2500, // ...and comes out of the top of it
  jackpot: 50000,
  skill: 5000,
};

// What each feature adds to the end-of-ball bonus (which is then multiplied by 1x to 5x).
export const BONUS = { bumper: 10, sling: 5, spin: 5, lane: 250, target: 100, bank: 2500, orbit: 500 };

// Tilt: a nudge is a small kick to the ball. Four presses inside the window is a warning,
// and the next time it happens the table tilts.
export const NUDGE = { dvy: -95, dvx: 70, cool: 10, window: 150, limit: 4 };

// Message priorities: a higher one replaces a lower one that is still showing.
const PRIO = { info: 3, bank: 5, saved: 6, big: 7, extra: 8, tilt: 9 };

const rotate = (a, dir) => (dir > 0 ? [a[2], a[0], a[1]] : [a[1], a[2], a[0]]);

/**
 * A new game. `opts.rng` is the random source (seed it for repeatable runs), `opts.balls` the
 * number of balls. Call `update(input)` once per tick with
 * `{ left, right, plunger, nudge }` (held flags, and nudge true for one tick per press).
 */
export function createGame(opts = {}) {
  const rng = opts.rng ?? Math.random;
  const ballsTotal = opts.balls ?? BALLS;
  const world = P.createWorld(opts.table ?? TABLE, { rng });

  const g = {
    world,
    rng,
    ballsTotal,
    phase: 'serve', // serve (ball on the plunger) | play | drained | bonus | over
    phaseT: 0,
    tick: 0,
    score: 0,
    ball: 1, // which ball of ballsTotal is being played
    extra: 0, // extra balls earned, shot after this ball drains
    again: false, // this ball is a replayed one (shoot again)
    mult: 1,
    bonus: 0,
    lanes: [false, false, false],
    skill: { lane: 0, live: false, t: 0, taken: false },
    orbitLit: null, // null | 'extra' | 'jackpot'
    extraThisBall: false,
    bank: { resetT: 0, cleared: 0 },
    save: { t: 0, used: false },
    tilt: { warnings: 0, tilted: false, hits: [], cool: 0 },
    onTable: false, // the ball has left the shooter lane this ball
    launched: false, // the plunger has been fired at least once this game
    armed: false, // the plunger may be pulled (it was let go since the ball was served)
    msg: null, // { text, t, prio, born }
    queue: [],
    cues: [],
    count: { shown: 0, total: 0, mult: 1 }, // end-of-ball bonus count
    stats: { bumpers: 0, slings: 0, spins: 0, targets: 0, banks: 0, orbits: 0, skillShots: 0, saves: 0, extras: 0, tilts: 0, lanes: 0 },
    finished: false, // the closing screen has run its course: report the score
    prev: { left: false, right: false },
    update,
    dispatch,
    say,
    serve,
    debugPlace,
  };

  // ---------------------------------------------------------------- messages
  function say(text, ticks = 90, prio = PRIO.info) {
    const m = { text, t: ticks, prio, born: g.tick };
    if (g.msg && g.msg.t > 0 && g.msg.prio > prio) {
      if (g.queue.length < 3) g.queue.push(m);
      return;
    }
    g.msg = m;
  }

  // ---------------------------------------------------------------- balls
  function newBallState() {
    g.mult = 1;
    g.bonus = 0;
    g.lanes = [false, false, false];
    g.orbitLit = null;
    g.extraThisBall = false;
    g.save = { t: 0, used: false };
    g.tilt = { warnings: 0, tilted: false, hits: [], cool: 0 };
    g.bank.resetT = 0;
    P.resetTargets(world);
    for (const t of world.targets) t.flash = 0;
  }

  /** Put a ball on the plunger. */
  function serve(first = false) {
    P.serveBall(world);
    g.phase = 'serve';
    g.phaseT = 0;
    g.onTable = false;
    g.armed = false;
    g.skill = { lane: Math.floor(rng() * 3), live: false, t: 0, taken: false };
    g.cues.push({ t: 'serve', first });
  }

  function startBall(first) {
    newBallState();
    g.msg = null; g.queue.length = 0; // no TILT left over from the last ball
    serve(first);
  }

  function nextBall() {
    if (g.extra > 0) {
      g.extra--;
      g.again = true;
      startBall(false);
      say('SHOOT AGAIN', 110, PRIO.extra);
      return;
    }
    if (g.ball >= g.ballsTotal) {
      g.phase = 'over';
      g.phaseT = 0;
      g.msg = null; g.queue.length = 0;
      say('GAME OVER', 9999, PRIO.tilt);
      g.cues.push({ t: 'over' });
      return;
    }
    g.ball++;
    g.again = false;
    startBall(false);
    say(`BALL ${g.ball}`, 70);
  }

  function endBall(drainX) {
    g.cues.push({ t: 'drain', x: drainX });
    g.skill.live = false;
    if (g.tilt.tilted) {
      g.phase = 'drained';
      g.phaseT = 0;
      g.count = { shown: 0, total: 0, mult: g.mult };
      return;
    }
    if (g.save.t > 0) {
      g.save = { t: 0, used: true };
      g.stats.saves++;
      serve();
      say('BALL SAVED', 110, PRIO.saved);
      g.cues.push({ t: 'saved' });
      return;
    }
    g.phase = 'drained';
    g.phaseT = 0;
    g.count = { shown: 0, total: g.bonus * g.mult, mult: g.mult };
  }

  // ---------------------------------------------------------------- scoring
  function add(points) {
    g.score += points;
  }

  function rollLane(i) {
    if (g.skill.live) {
      g.skill.live = false;
      if (i === g.skill.lane) {
        g.skill.taken = true;
        g.stats.skillShots++;
        add(SCORE.skill);
        say('SKILL SHOT', 130, PRIO.big);
        g.cues.push({ t: 'skill' });
      }
    }
    g.stats.lanes++;
    if (g.lanes[i]) {
      add(SCORE.laneAgain);
      g.cues.push({ t: 'lane', i, fresh: false });
      return;
    }
    g.lanes[i] = true;
    add(SCORE.lane);
    g.bonus += BONUS.lane;
    g.cues.push({ t: 'lane', i, fresh: true });
    if (g.lanes.every(Boolean)) {
      if (g.mult < MULT_MAX) {
        g.mult++;
        add(SCORE.laneSet * g.mult);
        say(`BONUS X${g.mult}`, 110, PRIO.big);
      } else {
        add(SCORE.multMax);
        say('MAX BONUS 5000', 110, PRIO.big);
      }
      g.lanes = [false, false, false];
      g.cues.push({ t: 'laneSet', mult: g.mult });
    }
  }

  function bankCleared() {
    g.stats.banks++;
    g.bank.cleared++;
    g.bank.resetT = BANK_RESET_TICKS;
    add(SCORE.bank);
    g.bonus += BONUS.bank;
    if (!g.extraThisBall && g.orbitLit !== 'extra') {
      g.orbitLit = 'extra';
      say('EXTRA BALL LIT', 130, PRIO.bank);
    } else {
      g.orbitLit = 'jackpot';
      say('JACKPOT LIT', 130, PRIO.bank);
    }
    g.cues.push({ t: 'bank', lit: g.orbitLit });
  }

  function enterOrbit() {
    g.skill.live = false;
    add(SCORE.orbitIn);
    g.cues.push({ t: 'orbit' });
    if (g.orbitLit === 'extra') {
      g.orbitLit = null;
      g.extraThisBall = true;
      g.extra++;
      g.stats.extras++;
      say('EXTRA BALL', 140, PRIO.extra);
      g.cues.push({ t: 'extra' });
    } else if (g.orbitLit === 'jackpot') {
      g.orbitLit = null;
      add(SCORE.jackpot);
      say('JACKPOT 50000', 140, PRIO.big);
      g.cues.push({ t: 'jackpot' });
    }
  }

  /** Handle one event from the physics (or a test). */
  function dispatch(e) {
    switch (e.type) {
      case 'bumper':
        g.stats.bumpers++;
        add(SCORE.bumper); g.bonus += BONUS.bumper;
        g.skill.live = false;
        g.cues.push({ t: 'bumper', i: e.i, speed: e.speed });
        break;
      case 'sling':
        g.stats.slings++;
        add(SCORE.sling); g.bonus += BONUS.sling;
        g.skill.live = false;
        g.cues.push({ t: 'sling', i: e.i });
        break;
      case 'spin':
        if (g.phase !== 'play' && g.phase !== 'serve') break;
        g.stats.spins++;
        add(SCORE.spin); g.bonus += BONUS.spin;
        g.cues.push({ t: 'spin', i: e.i });
        break;
      case 'spinner':
        g.skill.live = false;
        break;
      case 'target': {
        g.stats.targets++;
        add(SCORE.target); g.bonus += BONUS.target;
        g.skill.live = false;
        g.cues.push({ t: 'target', i: e.i });
        if (world.targets.every((t) => t.down) && g.bank.resetT === 0) bankCleared();
        break;
      }
      case 'lane':
        rollLane(e.i);
        break;
      case 'gate':
        if (e.kind === 'lane') {
          g.onTable = true;
          g.phase = 'play';
          g.phaseT = 0;
          // the save covers the first 8 s of a ball, and is spent once: a replayed ball gets none
          g.save = { t: g.tilt.tilted || g.save.used ? 0 : SAVE_TICKS, used: g.save.used };
          g.cues.push({ t: 'gate' });
        } else if (e.kind === 'entry') {
          enterOrbit();
        } else if (e.kind === 'orbit') {
          g.stats.orbits++;
          add(SCORE.orbit); g.bonus += BONUS.orbit;
          say('ORBIT', 60, PRIO.info);
          g.cues.push({ t: 'orbitTop' });
        }
        break;
      case 'flipper-hit':
        g.skill.live = false;
        g.cues.push({ t: 'flipHit', side: e.side, speed: e.speed });
        break;
      case 'launch':
        g.launched = true;
        g.skill.live = true;
        g.skill.t = 0;
        g.cues.push({ t: 'launch', speed: e.speed, power: e.power });
        break;
      case 'drain':
        if (g.phase === 'play' || g.phase === 'serve') endBall(world.ball.x);
        break;
      case 'escape':
        // Should never happen: the physics put the ball back on the plunger.
        g.phase = 'serve'; g.phaseT = 0; g.onTable = false; g.skill.live = false;
        break;
      default:
        break;
    }
  }

  /** Test and debug hook: put the ball anywhere on the table, in play. */
  function debugPlace(x, y, vx = 0, vy = 0) {
    P.placeBall(world, x, y, vx, vy);
    g.phase = 'play';
    g.phaseT = 0;
    g.onTable = !world.ball.inLane;
    g.skill.live = false;
  }

  // ---------------------------------------------------------------- tilt
  function doNudge() {
    if (g.phase !== 'play' || g.tilt.tilted) return;
    const t = g.tilt;
    // Presses closer together than the cooldown still count against you, but kick the ball only once.
    t.hits = t.hits.filter((at) => g.tick - at < NUDGE.window);
    t.hits.push(g.tick);
    if (t.cool <= 0) {
      const dx = (rng() * 2 - 1) * NUDGE.dvx;
      P.nudge(world, dx, NUDGE.dvy);
      t.cool = NUDGE.cool;
      g.cues.push({ t: 'nudge' });
    }
    if (t.hits.length >= NUDGE.limit) {
      t.hits.length = 0;
      t.warnings++;
      if (t.warnings >= 2) {
        t.tilted = true;
        g.stats.tilts++;
        g.save.t = 0;
        g.skill.live = false;
        P.setFlipper(world, 'L', false);
        P.setFlipper(world, 'R', false);
        say('TILT', 9999, PRIO.tilt);
        g.cues.push({ t: 'tilt' });
      } else {
        say('DANGER', 110, PRIO.tilt);
        g.cues.push({ t: 'warn' });
      }
    }
  }

  // ---------------------------------------------------------------- the tick
  function update(input = {}) {
    g.tick++;
    g.phaseT++;
    g.cues.length = 0;

    // messages
    if (g.msg) {
      g.msg.t--;
      if (g.msg.t <= 0) g.msg = g.queue.length ? g.queue.shift() : null;
    }

    if (g.tilt.cool > 0) g.tilt.cool--;
    if (g.bank.resetT > 0 && --g.bank.resetT === 0) {
      P.resetTargets(world);
      g.cues.push({ t: 'bankReset' });
    }
    if (g.save.t > 0) g.save.t--;
    if (g.skill.live && ++g.skill.t > SKILL_TICKS) g.skill.live = false;

    // flippers: the lit-lane rotation happens on the press; a tilted table is dead
    const tilted = g.tilt.tilted;
    const left = !!input.left && !tilted, right = !!input.right && !tilted;
    if (g.phase !== 'over') {
      if (left && !g.prev.left) pressFlipper('L');
      if (right && !g.prev.right) pressFlipper('R');
    }
    g.prev.left = left; g.prev.right = right;
    P.setFlipper(world, 'L', left);
    P.setFlipper(world, 'R', right);

    // plunger: pull while the ball sits on it, once the button has been let go since the serve
    if (!input.plunger) g.armed = true;
    P.setPlunger(world, g.phase === 'serve' && g.armed && !!input.plunger && P.ballOnPlunger(world));

    if (input.nudge) doNudge();

    // physics
    P.stepWorld(world);
    for (const e of world.events) dispatch(e);
    if (world.hitSpeed > 90) g.cues.push({ t: 'wall', speed: world.hitSpeed });

    // a weak plunge: the ball is back on the plunger, so the shot is not live any more
    if (g.phase === 'serve' && g.skill.live && P.ballOnPlunger(world)) g.skill.live = false;

    // phases
    if (g.phase === 'drained') {
      if (g.phaseT >= 40) {
        if (g.tilt.tilted || g.count.total === 0) {
          if (g.phaseT >= 70) nextBall();
        } else {
          g.phase = 'bonus';
          g.phaseT = 0;
        }
      }
    } else if (g.phase === 'bonus') {
      const c = g.count;
      if (c.shown < c.total) {
        const step = Math.min(c.total - c.shown, Math.max(50, Math.ceil(c.total / 75 / 10) * 10));
        c.shown += step;
        g.score += step;
        if (g.tick % 3 === 0) g.cues.push({ t: 'bonusTick' });
      } else if (g.phaseT > 100 || (c.total === 0 && g.phaseT > 30)) {
        nextBall();
      }
    } else if (g.phase === 'over') {
      if (g.phaseT >= 170) g.finished = true;
    }
  }

  function pressFlipper(side) {
    g.cues.push({ t: 'flip', side });
    const dir = side === 'R' ? 1 : -1;
    // While a ball is on the plunger or climbing the shooter lane, the flashing skill lane is on
    // show and the flippers move it (a good read of where the plunge will land can be turned into
    // the bonus). Once the ball is out on the table the skill lane is locked, and the flippers
    // rotate the lit rollover lanes instead.
    if (g.phase === 'serve') {
      g.skill.lane = (g.skill.lane + dir + 3) % 3;
      g.cues.push({ t: 'skillShift' });
    } else if (g.phase === 'play') {
      g.lanes = rotate(g.lanes, dir);
    }
  }

  startBall(true);
  return g;
}

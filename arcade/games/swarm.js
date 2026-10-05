// Swarm: a formation shooter. Squads fly choreographed entries, settle into a
// breathing grid, then peel off in dives, escorts trailing their Warden.
// Paths live in swarm/paths.js, vector art in swarm/art.js, sounds in swarm/sfx.js.
import { drawText, CELL } from '../engine/font.js';
import { makeSprite } from '../engine/sprites.js';
import {
  CX, buildPath, mirror, translate, advance, divePoints,
  ENTRY_A, ENTRY_B, ENTRY_C, PRACTICE_A, PRACTICE_B,
} from './swarm/paths.js';
import { buildSprites, buildBackdrop, COLORS } from './swarm/art.js';
import { createSfx } from './swarm/sfx.js';

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;

const PF = { x0: 140, x1: 660, w: 520 }; // playfield; the side gutters hold the HUD
const LX = 70; // left gutter center
const RX = 730; // right gutter center
const PLAYER_Y = 462;
const PLAYER_SPEED = 3.8;
const FORM_TOP = 66;
const COL_GAP = 40;
const ROW_GAP = 30;

const SHOT_SPEED = 9;
const MAX_SHOTS = 2; // classic: two shots on screen
const AUTO_RATE = 10; // ticks between held-fire shots
const TAP_RATE = 5;

const START_LIVES = 3;
const FIRST_EXTRA = 10000;
const EXTRA_STEP = 30000;

// [in formation, in flight]
const POINTS = { drone: [50, 100], stinger: [80, 160], warden: [150, 400] };
const ESCORT_BONUS = 800; // a Warden downed after both its escorts
const PRACTICE_POINTS = 100;
const PERFECT_BONUS = 10000;
const RADIUS = { drone: 11, stinger: 12, warden: 14 };
const TYPE_COLOR = { drone: COLORS.amber, stinger: COLORS.pink, warden: COLORS.orange };
const TYPES = { D: 'drone', S: 'stinger', W: 'warden' };

const SPARK_COLORS = [COLORS.amber, COLORS.orange, COLORS.pink, COLORS.teal, COLORS.violet, '#ffffff'];
const SPARK_INDEX = Object.fromEntries(SPARK_COLORS.map((c, i) => [c, i]));
const MAX_SPARKS = 900;

const isPracticeWave = (n) => n % 4 === 3; // waves 3, 7, 11, ...

// Squads: each is a list of files [path, mirrored, members]; a member is
// [type, row, col] for its formation slot (10 x 5 grid, 40 ships).
const WAVE_PLAN = [
  [
    [ENTRY_A, false, [['S', 1, 5], ['S', 1, 6], ['D', 3, 5], ['D', 3, 6]]],
    [ENTRY_A, true, [['S', 1, 4], ['S', 1, 3], ['D', 3, 4], ['D', 3, 3]]],
  ],
  [[ENTRY_B, false, [['W', 0, 3], ['S', 2, 3], ['W', 0, 4], ['S', 2, 4], ['W', 0, 5], ['S', 2, 5], ['W', 0, 6], ['S', 2, 6]]]],
  [[ENTRY_B, true, [['S', 1, 8], ['S', 1, 7], ['S', 2, 8], ['S', 2, 7], ['S', 1, 1], ['S', 1, 2], ['S', 2, 1], ['S', 2, 2]]]],
  [[ENTRY_C, false, [['D', 3, 0], ['D', 3, 1], ['D', 3, 2], ['D', 4, 4], ['D', 4, 5], ['D', 3, 7], ['D', 3, 8], ['D', 3, 9]]]],
  [[ENTRY_C, true, [['D', 4, 9], ['D', 4, 8], ['D', 4, 7], ['D', 4, 6], ['D', 4, 3], ['D', 4, 2], ['D', 4, 1], ['D', 4, 0]]]],
];

// Practice: five squads that fly through and leave; nobody fires back.
const PRACTICE_PLAN = [
  [[PRACTICE_A, false, 'DDDD'], [PRACTICE_A, true, 'DDDD']],
  [[PRACTICE_B, false, 'SSSSSSSS']],
  [[PRACTICE_B, true, 'SSSSSSSS']],
  [[PRACTICE_A, false, 'WDWD'], [PRACTICE_A, true, 'WDWD']],
  [[PRACTICE_B, false, 'DSDS'], [PRACTICE_B, true, 'DSDS']],
];

// '%' is missing from the cabinet font; drawn here in the same 5x7 grid.
const PCT_GLYPH = [0x18, 0x19, 0x02, 0x04, 0x08, 0x13, 0x03];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

function text(c, str, x, y, opts) {
  drawText(c, str, x, y, opts);
  if (!str.includes('%')) return;
  const scale = opts.scale || 1;
  const width = str.length * CELL * scale;
  const left = opts.align === 'center' ? x - width / 2 : opts.align === 'right' ? x - width : x;
  c.fillStyle = opts.color;
  for (let i = 0; i < str.length; i++) {
    if (str[i] !== '%') continue;
    const cx = left + i * CELL * scale;
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (PCT_GLYPH[r] & (1 << (4 - col))) c.fillRect(cx + (col + 1) * scale, y + (r + 1) * scale, scale, scale);
      }
    }
  }
}

// Text with a dark drop so it reads over stars and sparks.
function banner(c, str, x, y, color, scale) {
  text(c, str, x + scale, y + scale, { color: '#07040e', scale, align: 'center' });
  text(c, str, x, y, { color, scale, align: 'center' });
}

export default {
  id: 'SWARM',
  title: 'Swarm',
  mode: 'landscape',
  ownHud: true,
  start(env) {
    const { ctx, W, H, input, fx } = env;
    const rng = env.debug ? mulberry32(0x5a4e5) : Math.random; // gameplay
    const crng = env.debug ? mulberry32(0x0c0517) : Math.random; // cosmetics only
    const spr = buildSprites();
    const backdrop = buildBackdrop(W, H, PF);
    const sfx = createSfx(env.audio);
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

    // --- state ---
    let score = 0;
    let lives = START_LIVES;
    let wave = 0;
    let practice = false;
    let phase = 'play'; // play | clear | results | over
    let phaseT = 0;
    let waveT = 0;
    let frame = 0;
    let bannerT = 0;
    let readyT = 0;
    let extraT = 0;
    let warp = 1;
    let nextExtra = FIRST_EXTRA;
    let diveTimer = 0;
    let fireQueued = false;
    let gameOverPending = false;
    let gameOverSent = false;
    let god = false;
    let showPaths = false;
    let shx = 0;
    let shy = 0;
    let entryPaths = [];

    /** @type {any[]} */
    let enemies = [];
    const shots = [];
    const bolts = [];
    const sparks = [];
    const rings = [];
    const popups = [];
    const player = { x: CX, y: PLAYER_Y, alive: true, inv: 0, deadT: 0, fireCd: 0 };
    const stats = { shots: 0, hits: 0, kills: 0 };
    const pstats = { shots: 0, hits: 0, kills: 0, bonus: 0, ratio: 0, perfect: false, total: 40 };
    const form = { t: 0, swayAmp: 1, breatheAmp: 0, sway: 0, spread: 1 };
    const perf = { worst: 0, total: 0, ticks: 0, last: 0 };

    // --- starfield: three parallax layers inside the playfield ---
    const stars = [
      { n: 48, v: 0.22, size: 1, color: '#55467a' },
      { n: 30, v: 0.55, size: 1.5, color: '#a495cf' },
      { n: 14, v: 1.15, size: 2, color: '#f1ebff' },
    ].map((L) => {
      const xs = new Float32Array(L.n);
      const ys = new Float32Array(L.n);
      for (let i = 0; i < L.n; i++) {
        xs[i] = PF.x0 + crng() * PF.w;
        ys[i] = crng() * H;
      }
      return { ...L, xs, ys };
    });

    // --- formation grid ---
    const slotX = (e) => CX + form.sway + (e.col - 4.5) * COL_GAP * form.spread;
    const slotY = (e) => FORM_TOP + e.row * ROW_GAP * (1 + (form.spread - 1) * 0.7);
    const isLive = (e) => e.state === 'entry' || e.state === 'home' || e.state === 'form' || e.state === 'dive';
    const aliveCount = () => enemies.reduce((n, e) => n + (e.state !== 'dead' && e.state !== 'gone' ? 1 : 0), 0);
    const boltCap = () => Math.min(3 + wave, 10);
    const boltSpeed = () => Math.min(3.6 + wave * 0.1, 5);
    const diveSpeed = () => Math.min(3.3 + wave * 0.12, 5);

    function makeEnemy(type, row, col, path, spawnAt, speed) {
      return {
        type, row, col, path, spawnAt, speed,
        hp: type === 'warden' ? 2 : 1,
        state: 'wait',
        x: -100, y: -100, ang: HALF_PI, rot: 0, s: 0, ci: 0,
        flash: 0, shotsLeft: 0, fireCd: 0, delay: 0, pending: null,
        sortie: false, exit: false, escorts: null,
        anim: ((row + col) % 2) * 10,
      };
    }

    function buildWave(n) {
      const list = [];
      entryPaths = [];
      const flip = n % 2 === 0; // alternate waves mirror the whole show
      const plan = practice ? PRACTICE_PLAN : WAVE_PLAN;
      const speed = practice ? 3.6 : Math.min(3.3 + n * 0.1, 4.4);
      const gap = practice ? 100 : Math.max(70, 104 - n * 4);
      // Mirrored squads launch together; from wave 4 every squad is on the clock sooner.
      const order = !practice && n >= 4 ? [0, 1, 1, 2, 2] : [0, 1, 1, 2, 2].map((v, k) => (k === 0 ? 0 : v * 1.25));
      plan.forEach((squad, k) => {
        const t0 = 100 + order[k] * gap;
        for (const [pts, mir, members] of squad) {
          const path = buildPath(mir !== flip ? mirror(pts) : pts);
          entryPaths.push(path);
          [...members].forEach((m, i) => {
            const spec = typeof m === 'string' ? [m, 0, 0] : m;
            const col = typeof m === 'string' ? 0 : flip ? 9 - spec[2] : spec[2];
            list.push(makeEnemy(TYPES[spec[0]], spec[1], col, path, t0 + i * 10, speed));
          });
        }
      });
      return list;
    }

    function startWave(n) {
      wave = n;
      practice = isPracticeWave(n);
      form.t = 0;
      form.swayAmp = 1;
      form.breatheAmp = 0;
      enemies = buildWave(n);
      waveT = 0;
      phase = 'play';
      phaseT = 0;
      bannerT = 130;
      warp = 7;
      diveTimer = 90;
      Object.assign(pstats, { shots: 0, hits: 0, kills: 0, bonus: 0, ratio: 0, perfect: false });
      if (!player.alive && lives > 0) respawn();
      if (practice) sfx.practice(); else sfx.wave();
    }

    function addScore(p) {
      score += p;
      env.onScore(score);
      while (score >= nextExtra) {
        lives++;
        nextExtra += EXTRA_STEP;
        extraT = 150;
        sfx.extra();
      }
    }

    // --- effects ---
    function spark(x, y, vx, vy, life, color) {
      if (sparks.length >= MAX_SPARKS) sparks.shift();
      sparks.push({ x, y, vx, vy, life, max: life, c: SPARK_INDEX[color] ?? 5 });
    }

    function explode(x, y, color, size) {
      const n = 8 + size * 9;
      for (let i = 0; i < n; i++) {
        const a = crng() * TAU;
        const sp = 0.6 + crng() * (2.2 + size * 1.1);
        spark(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 16 + crng() * 22, i % 4 === 0 ? '#ffffff' : color);
      }
      rings.push({ x, y, r: 3, vr: 1.8 + size * 0.7, life: 16 + size * 2, max: 16 + size * 2, color });
    }

    // --- firing ---
    function playerFire() {
      if (shots.length >= MAX_SHOTS || player.fireCd > 0) return false;
      shots.push({ x: player.x, y: player.y - 16 });
      player.fireCd = fireQueued ? TAP_RATE : AUTO_RATE;
      stats.shots++;
      if (practice) pstats.shots++;
      sfx.shot();
      return true;
    }

    function fireBolt(e, dvx = 0, ignoreCap = false) {
      if (!ignoreCap && bolts.length >= boltCap()) return;
      const vy = boltSpeed();
      const t = Math.max(24, (PLAYER_Y - e.y) / vy);
      const vx = clamp((player.x - e.x) / t + (rng() - 0.5) * 0.6 + dvx, -2.2, 2.2);
      bolts.push({ x: e.x, y: e.y + 10, vx, vy });
      sfx.enemyShot();
    }

    // --- dives ---
    function maxDivers() {
      return aliveCount() <= 6 ? 6 : Math.min(2 + Math.floor(wave / 2), 6);
    }
    function diveInterval() {
      return aliveCount() <= 6 ? 30 + rng() * 20 : Math.max(50, 150 - wave * 10) + rng() * 50;
    }

    function startSortie(e, pts, delay, escortOf) {
      e.state = 'dive';
      e.sortie = true;
      e.delay = delay;
      e.escorts = null;
      e.fireCd = 24;
      e.shotsLeft = practice ? 0
        : e.type === 'warden' ? 1
          : escortOf ? 1
            : e.type === 'stinger' ? 2
              : 1 + (wave >= 4 ? 1 : 0);
      if (pts) {
        e.path = buildPath(pts);
        e.s = 0;
        e.ci = 0;
        e.exit = pts[pts.length - 1] > H;
      }
    }

    function launchDive(kind, force) {
      const formed = enemies.filter((e) => e.state === 'form');
      if (!formed.length) return false;
      if (!force && enemies.filter((e) => e.sortie).length >= maxDivers()) return false;
      if (!kind) {
        const r = rng();
        kind = r < 0.22 + Math.min(wave, 8) * 0.01 ? 'warden' : r < 0.6 ? 'stinger' : 'drone';
      }
      let pool = formed.filter((e) => e.type === kind);
      if (!pool.length) pool = formed;
      // Two draws, keep the one nearer a flank: attackers peel off the edges.
      const a = pool[Math.floor(rng() * pool.length)];
      const b = pool[Math.floor(rng() * pool.length)];
      const leader = Math.abs(a.col - 4.5) >= Math.abs(b.col - 4.5) ? a : b;
      const side = leader.col < 4.5 ? -1 : 1;
      const tx = clamp(player.x + (rng() - 0.5) * 60, PF.x0 + 60, PF.x1 - 60);
      const pts = divePoints(leader.type, leader.x, leader.y, side, tx, PLAYER_Y, H);
      startSortie(leader, pts, 0, null);

      if (leader.type === 'warden') {
        // Up to two Stingers from the row below fly escort in tight formation.
        const escorts = formed
          .filter((e) => e.type === 'stinger' && e.row === 1 && Math.abs(e.col - leader.col) <= 1)
          .sort((p, q) => Math.abs(p.col - leader.col) - Math.abs(q.col - leader.col))
          .slice(0, 2);
        for (const es of escorts) {
          startSortie(es, translate(pts, es.x - leader.x, es.y - leader.y), 0, leader);
        }
        leader.escorts = escorts;
      } else if (leader.type === 'drone' && rng() < 0.5) {
        // A wingman from the same row follows a beat later on its own line.
        const mate = formed.find((e) => e !== leader && e.type === 'drone' && e.row === leader.row
          && Math.abs(e.col - leader.col) === 1);
        if (mate) {
          startSortie(mate, null, 14, null);
          mate.pending = { side, tx: clamp(tx + (mate.col - leader.col) * 34, PF.x0 + 60, PF.x1 - 60) };
        }
      }
      sfx.dive();
      return true;
    }

    // --- enemy update ---
    function steerHome(e) {
      const tx = slotX(e);
      const ty = slotY(e);
      const dx = tx - e.x;
      const dy = ty - e.y;
      const d = Math.hypot(dx, dy);
      const sp = e.speed;
      if (d <= sp + 0.5) {
        e.x = tx;
        e.y = ty;
        e.state = 'form';
        e.sortie = false;
        e.escorts = null;
        return;
      }
      if (d < 24) {
        e.x += (dx / d) * sp;
        e.y += (dy / d) * sp;
      } else {
        const turn = d < 70 ? 0.22 : 0.085;
        e.ang += clamp(wrapAngle(Math.atan2(dy, dx) - e.ang), -turn, turn);
        e.x += Math.cos(e.ang) * sp;
        e.y += Math.sin(e.ang) * sp;
      }
      e.rot += wrapAngle(e.ang - HALF_PI - e.rot) * 0.3;
    }

    function updateEnemy(e) {
      if (e.flash > 0) e.flash--;
      switch (e.state) {
        case 'wait':
          if (waveT >= e.spawnAt) {
            e.state = 'entry';
            e.s = 0;
            e.ci = 0;
            advance(e, e.path, 0);
            e.rot = e.ang - HALF_PI;
          }
          break;
        case 'entry': {
          const done = advance(e, e.path, e.speed);
          e.rot = e.ang - HALF_PI;
          if (!practice && wave >= 2 && player.alive && e.y > 140 && e.y < 330 && rng() < 0.0035) fireBolt(e);
          if (done) e.state = practice ? 'gone' : 'home';
          break;
        }
        case 'dive': {
          if (e.delay > 0) {
            e.x = slotX(e);
            e.y = slotY(e);
            if (--e.delay === 0 && e.pending) {
              const pts = divePoints(e.type, e.x, e.y, e.pending.side, e.pending.tx, PLAYER_Y, H);
              e.pending = null;
              startSortie(e, pts, 0, null);
            }
            break;
          }
          const done = advance(e, e.path, diveSpeed());
          e.rot = e.ang - HALF_PI;
          if (e.shotsLeft > 0 && player.alive) {
            if (e.fireCd > 0) e.fireCd--;
            else if (Math.sin(e.ang) > 0.2 && e.y > 150 && e.y < 370 && rng() < 0.06) {
              if (e.type === 'warden') {
                fireBolt(e, -1.1, true);
                fireBolt(e, 0, true);
                fireBolt(e, 1.1, true);
              } else {
                fireBolt(e);
              }
              e.shotsLeft--;
              e.fireCd = 22;
            }
          }
          if (done) {
            if (e.exit) {
              // Off the bottom: re-enter from the top and fall back in.
              e.x = slotX(e);
              e.y = -26;
              e.ang = HALF_PI;
              e.rot = 0;
            }
            e.state = 'home';
          }
          break;
        }
        case 'home':
          steerHome(e);
          break;
        case 'form':
          e.x = slotX(e);
          e.y = slotY(e);
          e.rot += wrapAngle(-e.rot) * 0.15;
          break;
        default:
          break;
      }
    }

    // --- hits and deaths ---
    function hitEnemy(e) {
      stats.hits++;
      if (practice) pstats.hits++;
      e.hp--;
      if (e.hp > 0) {
        e.flash = 10;
        sfx.armor();
        for (let i = 0; i < 6; i++) {
          const a = -HALF_PI + (crng() - 0.5) * 2;
          spark(e.x, e.y + 8, Math.cos(a) * 2, -Math.abs(Math.sin(a)) * 2, 14, COLORS.violet);
        }
        return;
      }
      killEnemy(e);
    }

    function killEnemy(e) {
      const flying = e.state !== 'form';
      stats.kills++;
      if (practice) pstats.kills++;
      let pts;
      if (practice) {
        pts = PRACTICE_POINTS;
      } else {
        pts = POINTS[e.type][flying ? 1 : 0];
        if (e.type === 'warden' && flying && e.escorts && e.escorts.length
          && e.escorts.every((x) => x.state === 'dead')) pts = ESCORT_BONUS;
      }
      e.state = 'dead';
      e.sortie = false;
      addScore(pts);
      if (flying && !practice) {
        popups.push({ x: e.x, y: e.y, text: String(pts), life: 54, color: pts >= 400 ? COLORS.amber : COLORS.ink });
      }
      const big = e.type === 'warden';
      explode(e.x, e.y, TYPE_COLOR[e.type], big ? 2 : 1);
      sfx.boom(big);
      if (big) {
        fx.hitPause(3);
        fx.shake(3, 8);
      }
    }

    function playerDie() {
      player.alive = false;
      player.deadT = 0;
      lives--;
      shots.length = 0;
      fx.burst(player.x, player.y, 34, COLORS.teal, [1, 5], [30, 60]);
      fx.burst(player.x, player.y, 14, COLORS.amber, [0.5, 3], [20, 45]);
      explode(player.x, player.y, COLORS.teal, 3);
      rings.push({ x: player.x, y: player.y, r: 6, vr: 3.2, life: 30, max: 30, color: COLORS.pink });
      fx.shake(9, 36);
      fx.hitPause(8);
      sfx.death();
      if (lives <= 0) {
        phase = 'over';
        phaseT = 0;
      }
    }

    function respawn() {
      player.alive = true;
      player.x = CX;
      player.inv = 110;
      player.fireCd = 0;
      bolts.length = 0;
      readyT = 80;
    }

    function finishPractice() {
      const ratio = pstats.shots ? pstats.hits / pstats.shots : 0;
      pstats.ratio = ratio;
      pstats.perfect = pstats.kills === pstats.total;
      pstats.bonus = Math.round((ratio * pstats.kills * 100) / 10) * 10 + (pstats.perfect ? PERFECT_BONUS : 0);
      if (pstats.bonus > 0) addScore(pstats.bonus);
      sfx.bonus();
    }

    // --- input ---
    const touches = input.trackTouches();
    let dragId = null;
    let dragX = 0;
    input.onKeyDown((e) => {
      if ((e.key === ' ' || e.key === 'Spacebar') && !e.repeat) fireQueued = true;
    });
    input.onTap(() => { fireQueued = true; });

    function updatePlayer() {
      if (player.fireCd > 0) player.fireCd--;
      if (!player.alive) {
        fireQueued = false;
        return;
      }
      if (player.inv > 0) player.inv--;
      let move = 0;
      if (input.held('ArrowLeft') || input.held('a') || input.held('A')) move -= 1;
      if (input.held('ArrowRight') || input.held('d') || input.held('D')) move += 1;
      player.x += move * PLAYER_SPEED;

      // Touch: relative drag (the finger never covers the ship); holding fires.
      let touchHeld = false;
      for (const [id, p] of touches) {
        if (dragId === id) player.x += p.x - dragX;
        dragId = id;
        dragX = p.x;
        touchHeld = true;
        break;
      }
      if (!touchHeld) dragId = null;
      player.x = clamp(player.x, PF.x0 + 16, PF.x1 - 16);

      const held = input.held(' ') || input.held('Spacebar') || touchHeld;
      if (fireQueued || held) playerFire();
      fireQueued = false;
    }

    // --- main update ---
    function update() {
      frame++;
      waveT++;
      if (warp > 1) warp = Math.max(1, warp - 0.08);
      if (bannerT > 0) bannerT--;
      if (readyT > 0) readyT--;
      if (extraT > 0) extraT--;

      // Formation: sways while squads arrive, then breathes.
      const settled = !enemies.some((e) => e.state === 'wait' || e.state === 'entry');
      form.t++;
      form.swayAmp += ((settled ? 0.3 : 1) - form.swayAmp) * 0.01;
      form.breatheAmp += ((settled ? 1 : 0) - form.breatheAmp) * 0.01;
      form.sway = Math.sin(form.t * 0.017) * 26 * form.swayAmp;
      form.spread = 1 + form.breatheAmp * 0.15 * (0.5 - 0.5 * Math.cos(form.t * 0.03));

      updatePlayer();
      for (const e of enemies) updateEnemy(e);

      if (phase === 'play' && !practice && player.alive && settled && --diveTimer <= 0) {
        launchDive(null, false);
        diveTimer = diveInterval();
      }

      // Player shots.
      for (let i = shots.length - 1; i >= 0; i--) {
        const b = shots[i];
        b.y -= SHOT_SPEED;
        if (b.y < -16) { shots.splice(i, 1); continue; }
        for (const e of enemies) {
          if (!isLive(e)) continue;
          const r = RADIUS[e.type];
          if (Math.abs(b.x - e.x) < r && Math.abs(b.y - e.y) < r + 6) {
            shots.splice(i, 1);
            hitEnemy(e);
            break;
          }
        }
      }

      // Enemy bolts.
      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i];
        b.x += b.vx;
        b.y += b.vy;
        if (b.y > H + 12 || b.x < PF.x0 - 12 || b.x > PF.x1 + 12) { bolts.splice(i, 1); continue; }
        if (player.alive && player.inv <= 0 && !god
          && Math.abs(b.x - player.x) < 8 && Math.abs(b.y - player.y) < 12) {
          bolts.splice(i, 1);
          playerDie();
        }
      }

      // Body collisions with anything in flight.
      if (player.alive && player.inv <= 0 && !god) {
        for (const e of enemies) {
          if (e.state !== 'dive' && e.state !== 'entry' && e.state !== 'home') continue;
          if (Math.abs(e.x - player.x) < RADIUS[e.type] + 9 && Math.abs(e.y - player.y) < RADIUS[e.type] + 9) {
            killEnemy(e);
            playerDie();
            break;
          }
        }
      }

      if (!player.alive && phase !== 'over') {
        player.deadT++;
        const sortie = enemies.some((e) => e.sortie);
        if (player.deadT > 150 && (!sortie || player.deadT > 420)) respawn();
      }

      // Particles.
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.94;
        p.vy = p.vy * 0.94 + 0.02;
        if (--p.life <= 0) sparks.splice(i, 1);
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.r += r.vr;
        r.vr *= 0.93;
        if (--r.life <= 0) rings.splice(i, 1);
      }
      for (let i = popups.length - 1; i >= 0; i--) {
        popups[i].y -= 0.4;
        if (--popups[i].life <= 0) popups.splice(i, 1);
      }

      // Phases.
      if (phase === 'play') {
        if (waveT > 100 && enemies.every((e) => e.state === 'dead' || e.state === 'gone')) {
          phaseT = 0;
          if (practice) {
            phase = 'results';
            finishPractice();
          } else {
            phase = 'clear';
            sfx.clear();
          }
        }
      } else if (phase === 'clear') {
        if (++phaseT > 110) startWave(wave + 1);
      } else if (phase === 'results') {
        if (++phaseT > 270) startWave(wave + 1);
      } else if (phase === 'over') {
        if (++phaseT === 170 && !gameOverSent) gameOverPending = true;
      }
    }

    // --- rendering ---
    function drawStars() {
      const stretch = warp - 1;
      for (const L of stars) {
        ctx.fillStyle = L.color;
        const v = L.v * warp;
        const h = L.size + stretch * L.v * 4;
        for (let i = 0; i < L.n; i++) {
          let y = L.ys[i] + v;
          if (y > H) {
            y -= H;
            L.xs[i] = PF.x0 + crng() * PF.w;
          }
          L.ys[i] = y;
          if ((frame + i * 37) % 160 < 8) continue; // twinkle
          ctx.fillRect(L.xs[i], y, L.size, h);
        }
      }
    }

    function drawEnemies() {
      for (const e of enemies) {
        if (!isLive(e)) continue;
        const variant = e.flash > 0 && (e.flash & 2) ? 2 : e.type === 'warden' && e.hp < 2 ? 1 : 0;
        const f = e.state === 'form'
          ? Math.floor((form.t + e.anim) / 22) % 2
          : Math.floor(frame / 6) % 2;
        const img = spr.enemy[e.type][variant][f];
        const c = Math.cos(e.rot);
        const s = Math.sin(e.rot);
        ctx.setTransform(c, s, -s, c, e.x + shx, e.y + shy);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
      }
      ctx.setTransform(1, 0, 0, 1, shx, shy);
    }

    function drawSparks() {
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      for (let c = 0; c < SPARK_COLORS.length; c++) {
        ctx.strokeStyle = SPARK_COLORS[c];
        for (let band = 0; band < 3; band++) {
          ctx.globalAlpha = band === 0 ? 0.35 : band === 1 ? 0.7 : 1;
          ctx.beginPath();
          let any = false;
          for (const p of sparks) {
            if (p.c !== c) continue;
            const k = p.life / p.max;
            if ((k < 0.33 ? 0 : k < 0.66 ? 1 : 2) !== band) continue;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 3 - 0.5, p.y - p.vy * 3 - 0.5);
            any = true;
          }
          if (any) ctx.stroke();
        }
      }
      ctx.lineWidth = 2;
      for (const r of rings) {
        ctx.globalAlpha = r.life / r.max;
        ctx.strokeStyle = r.color;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.lineCap = 'butt';
    }

    function drawPlayer() {
      if (!player.alive) return;
      if (player.inv > 0 && (frame >> 2) % 2 === 0) return;
      const img = spr.ship;
      ctx.drawImage(img, player.x - img.width / 2, player.y - img.height / 2);
      // Engine flicker.
      const flick = 3 + crng() * 5;
      ctx.strokeStyle = (frame >> 1) % 2 ? COLORS.amber : COLORS.orange;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(player.x - 3, player.y + 15);
      ctx.lineTo(player.x, player.y + 15 + flick);
      ctx.lineTo(player.x + 3, player.y + 15);
      ctx.stroke();
    }

    function drawProjectiles() {
      const so = spr.shot;
      for (const b of shots) ctx.drawImage(so, b.x - so.width / 2, b.y - so.height / 2);
      const bo = spr.bolt;
      for (const b of bolts) ctx.drawImage(bo, b.x - bo.width / 2, b.y - bo.height / 2);
    }

    function drawOverlayText() {
      for (const p of popups) {
        ctx.globalAlpha = Math.min(1, p.life / 20);
        banner(ctx, p.text, p.x, p.y - 30, p.color, 2);
      }
      ctx.globalAlpha = 1;

      const mid = 200;
      if (bannerT > 0 && phase === 'play') {
        ctx.globalAlpha = Math.min(1, bannerT / 25);
        if (practice) {
          banner(ctx, 'PRACTICE WAVE', CX, mid, COLORS.pink, 3);
          banner(ctx, 'NO RETURN FIRE', CX, mid + 40, COLORS.amber, 2);
        } else {
          banner(ctx, `WAVE ${wave}`, CX, mid, COLORS.teal, 4);
        }
        ctx.globalAlpha = 1;
      }
      if (readyT > 0 && phase !== 'over' && bannerT <= 0) banner(ctx, 'READY', CX, mid + 40, COLORS.amber, 3);
      if (extraT > 0 && (extraT >> 3) % 2 === 0) banner(ctx, 'EXTRA SHIP', CX, 300, COLORS.amber, 2);
      if (phase === 'clear') banner(ctx, 'WAVE CLEAR', CX, mid, COLORS.teal, 3);
      if (phase === 'results') {
        banner(ctx, pstats.perfect ? 'PERFECT' : 'PRACTICE OVER', CX, mid - 50, pstats.perfect ? COLORS.amber : COLORS.pink, 3);
        banner(ctx, `DOWNED ${pstats.kills}/${pstats.total}`, CX, mid, COLORS.ink, 2);
        banner(ctx, `HIT RATIO ${Math.round(pstats.ratio * 100)}%`, CX, mid + 26, COLORS.ink, 2);
        if (phaseT > 40) banner(ctx, `BONUS ${pstats.bonus}`, CX, mid + 62, COLORS.amber, 3);
      }
      // The cabinet's own game-over card takes the final frame, so ours steps aside.
      if (phase === 'over' && !gameOverPending) {
        banner(ctx, 'GAME OVER', CX, mid, COLORS.pink, 4);
        const ratio = stats.shots ? Math.round((stats.hits / stats.shots) * 100) : 0;
        banner(ctx, `HIT RATIO ${ratio}%`, CX, mid + 48, COLORS.ink, 2);
      }
    }

    // HUD lives in the gutters and only re-renders when a value changes.
    const hud = makeSprite(W, H, () => {});
    const hctx = hud.getContext('2d');
    let hudKey = '';
    function drawHud() {
      const ratio = stats.shots ? Math.round((stats.hits / stats.shots) * 100) : 0;
      const best = Math.max(env.pb || 0, score);
      const key = `${score}|${best}|${wave}|${lives}|${practice}|${nextExtra}|${ratio}|${pstats.kills}|${player.alive}`;
      if (key !== hudKey) {
        hudKey = key;
        const c = hctx;
        c.clearRect(0, 0, W, H);
        const dim = COLORS.dim;
        text(c, 'SCORE', LX, 18, { color: dim, scale: 2, align: 'center' });
        text(c, String(score), LX, 40, { color: COLORS.amber, scale: 2, align: 'center' });
        text(c, 'BEST', LX, 88, { color: dim, scale: 2, align: 'center' });
        text(c, String(best), LX, 110, { color: COLORS.ink, scale: 2, align: 'center' });
        text(c, 'WAVE', LX, 156, { color: dim, scale: 2, align: 'center' });
        text(c, String(wave), LX, 178, { color: COLORS.teal, scale: 3, align: 'center' });
        if (practice) text(c, 'BONUS', LX, 226, { color: COLORS.pink, scale: 2, align: 'center' });
        text(c, 'SWARM', LX, 424, { color: COLORS.pink, scale: 3, align: 'center' });
        text(c, coarse ? 'DRAG TO MOVE' : 'ARROWS MOVE', LX, 456, { color: dim, scale: 1, align: 'center' });
        text(c, coarse ? 'HOLD TO FIRE' : 'SPACE FIRES', LX, 470, { color: dim, scale: 1, align: 'center' });

        text(c, 'SHIPS', RX, 18, { color: dim, scale: 2, align: 'center' });
        const reserve = Math.max(0, lives - (player.alive ? 1 : 0));
        const icons = Math.min(reserve, 4);
        const iw = spr.ship.width * 0.62;
        for (let i = 0; i < icons; i++) {
          const x = RX - ((icons - 1) * 26) / 2 + i * 26;
          c.drawImage(spr.ship, x - iw / 2, 34, iw, iw);
        }
        if (reserve > 4) text(c, `+${reserve - 4}`, RX + 58, 46, { color: COLORS.teal, scale: 1, align: 'left' });
        text(c, '1UP AT', RX, 88, { color: dim, scale: 2, align: 'center' });
        text(c, String(nextExtra), RX, 110, { color: COLORS.ink, scale: 2, align: 'center' });
        if (practice) {
          text(c, 'DOWNED', RX, 156, { color: dim, scale: 2, align: 'center' });
          text(c, `${pstats.kills}/40`, RX, 178, { color: COLORS.pink, scale: 3, align: 'center' });
        } else {
          text(c, 'RATIO', RX, 156, { color: dim, scale: 2, align: 'center' });
          text(c, `${ratio}%`, RX, 178, { color: COLORS.teal, scale: 3, align: 'center' });
        }
        // Wave badges: a chevron per wave, a pink flag for every five.
        const flags = Math.floor(wave / 5);
        const chevs = wave % 5;
        const badges = [];
        for (let i = 0; i < flags; i++) badges.push(spr.flag);
        for (let i = 0; i < chevs; i++) badges.push(spr.chevron);
        badges.slice(-20).forEach((img, i) => {
          const colN = i % 5;
          const rowN = Math.floor(i / 5);
          c.drawImage(img, RX - 50 + colN * 22 - img.width / 2 + 6, H - 34 - rowN * 22 - img.height / 2 + 6);
        });
      }
      ctx.drawImage(hud, 0, 0);
    }

    function drawDebugPaths() {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(70,224,216,0.45)';
      const all = entryPaths.concat(enemies.filter((e) => e.state === 'dive' && e.delay === 0).map((e) => e.path));
      for (const p of all) {
        ctx.beginPath();
        ctx.moveTo(p.xs[0], p.ys[0]);
        for (let i = 1; i < p.xs.length; i++) ctx.lineTo(p.xs[i], p.ys[i]);
        ctx.stroke();
      }
    }

    function render() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = COLORS.gutter;
      ctx.fillRect(0, 0, W, H);
      const sh = fx.shakeOffset();
      shx = sh.x;
      shy = sh.y;
      ctx.setTransform(1, 0, 0, 1, shx, shy);
      ctx.drawImage(backdrop, 0, 0);

      ctx.save();
      ctx.beginPath();
      ctx.rect(PF.x0, 0, PF.w, H);
      ctx.clip();
      drawStars();
      if (showPaths) drawDebugPaths();
      drawEnemies();
      drawProjectiles();
      drawPlayer();
      drawSparks();
      drawOverlayText();
      ctx.restore();

      drawHud();
      fx.updateAndDraw();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // --- debug surface (?debug=1) ---
    if (env.debug) {
      const counts = () => {
        const out = { alive: 0, wait: 0, entry: 0, home: 0, form: 0, dive: 0, dead: 0, gone: 0, drone: 0, stinger: 0, warden: 0 };
        for (const e of enemies) {
          out[e.state]++;
          if (e.state !== 'dead' && e.state !== 'gone') {
            out.alive++;
            out[e.type]++;
          }
        }
        return out;
      };
      env.expose({
        get phase() { return phase; },
        get wave() { return wave; },
        get practice() { return practice; },
        get score() { return score; },
        get lives() { return lives; },
        get waveT() { return waveT; },
        get player() { return { x: player.x, y: player.y, alive: player.alive, inv: player.inv }; },
        get shots() { return shots.length; },
        get bolts() { return bolts.length; },
        get counts() { return counts(); },
        get enemies() {
          return enemies.map((e, i) => ({ i, type: e.type, state: e.state, hp: e.hp, row: e.row, col: e.col, x: Math.round(e.x), y: Math.round(e.y), sortie: e.sortie }));
        },
        get formation() { return { spread: form.spread, sway: form.sway, breathe: form.breatheAmp }; },
        get stats() { return { ...stats }; },
        get practiceStats() { return { ...pstats }; },
        get particles() { return { sparks: sparks.length, rings: rings.length, engine: fx.count }; },
        get perf() { return { worst: perf.worst, avg: perf.ticks ? perf.total / perf.ticks : 0, ticks: perf.ticks, last: perf.last }; },
        get nextExtra() { return nextExtra; },
      });
      env.exposeActions({
        skipEntry() {
          for (const e of enemies) {
            if (e.state === 'wait' || e.state === 'entry' || e.state === 'home') {
              e.state = practice ? 'gone' : 'form';
              e.x = slotX(e);
              e.y = slotY(e);
              e.rot = 0;
            }
          }
          waveT = Math.max(waveT, 140);
          bannerT = 0;
        },
        dive(kind) { return launchDive(kind, true); },
        shootAt(i) {
          const e = enemies[i];
          if (!e || !isLive(e)) return false;
          shots.push({ x: e.x, y: e.y + 4 }); // inside the hitbox: lands next tick
          stats.shots++;
          if (practice) pstats.shots++;
          return true;
        },
        fire() { fireQueued = true; },
        movePlayer(x) { player.x = clamp(x, PF.x0 + 16, PF.x1 - 16); },
        killPlayer() { if (player.alive) playerDie(); },
        setLives(n) { lives = n; },
        god(on) { god = !!on; },
        gotoWave(n) { startWave(n); },
        clearWave() {
          for (const e of enemies) {
            if (e.state !== 'dead' && e.state !== 'gone') {
              if (isLive(e)) explode(e.x, e.y, TYPE_COLOR[e.type], 1);
              e.state = 'dead';
              e.sortie = false;
            }
          }
        },
        stress(n = 20) {
          const live = enemies.filter(isLive);
          for (let i = 0; i < n; i++) {
            const e = live[i % Math.max(1, live.length)];
            explode(e ? e.x : CX, e ? e.y : 200, SPARK_COLORS[i % 5], 2);
          }
          fx.burst(CX, 300, 60, COLORS.teal, [1, 5], [40, 80]);
        },
        resetPerf() { perf.worst = 0; perf.total = 0; perf.ticks = 0; },
        showPaths(on) { showPaths = !!on; },
        addScore(p) { addScore(p); },
      });
    }

    startWave(1);
    env.onScore(0);

    return {
      tick() {
        const t0 = performance.now();
        if (fx.consumePause()) return;
        update();
        render();
        const dt = performance.now() - t0;
        perf.last = dt;
        perf.total += dt;
        perf.ticks++;
        if (dt > perf.worst) perf.worst = dt;
        if (gameOverPending && !gameOverSent) {
          gameOverSent = true;
          env.onGameOver(score);
        }
      },
    };
  },
};

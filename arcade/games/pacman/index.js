// PAC-MAN — full arcade-rules implementation: authentic maze, per-ghost AI
// personalities with scatter/chase waves, frightened chains, ghost-house
// dot counters, Cruise Elroy, fruit, level speed tables, and the classic
// game flow (READY! / death / maze flash). See the sibling modules; rules
// follow the Pac-Man Dossier.
import { createMaze, TILE, MAZE_Y, HOUSE } from './maze.js';
import { levelSpec, SCORING, BASE_SPEED } from './levels.js';
import { DIRS, tileOf, centerOf, stepActor, wrapTunnel, resetTileMemory, isReverse } from './actors.js';
import { createGhost, updateGhost, reverseGhost, ghostTarget, dirName } from './ghosts.js';
import { drawPac, drawPacDeath, drawGhost, drawFruit, GHOST_COLORS } from './sprites.js';
import { drawText } from '../../engine/font.js';
import {
  playIntro, playWaka, playFruit, playGhostEat, playExtraLife, playDeath,
  sirenLoop, frightLoop, eyesLoop,
} from './sfx.js';

const GHOST_ORDER = ['blinky', 'pinky', 'inky', 'clyde'];
const HOUSE_PREFERENCE = ['pinky', 'inky', 'clyde'];
const FRUIT_POS = { x: 14 * TILE, y: MAZE_Y + 17 * TILE + TILE / 2 };

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default {
  id: 'PACMAN',
  title: 'Pac-Man',
  mode: 'portrait',
  start(env) {
    const { ctx, W, H } = env;
    const rng = env.debug ? mulberry32(0xc0ffee) : Math.random;
    const maze = createMaze();

    // --- persistent-across-levels state ---
    let level = 1;
    let spec = levelSpec(level);
    let score = 0;
    let lives = 3;
    let extraLifeAwarded = false;
    let hiScore = Math.max(env.pb || 0, 0);
    const fruitHistory = [spec.fruit.name];
    let firstReady = true;

    // --- per-life/per-level state (initialized by resetActors) ---
    let pac, ghosts, ghostList;
    let ghostMode, waveIndex, waveTimer;
    let frightTimer = 0;
    let ghostChain = 0;
    let dotsEaten = 0;
    let usePersonalCounters = true;
    let globalDotCounter = 0;
    let noDotTimer = 0;
    let fruit = null; // { timer }
    let fruitShown = { 70: false, 170: false };
    let scoreTags = []; // { x, y, text, timer, color }
    let freezeTimer = 0;
    let hiddenGhost = null;

    // --- phase machine ---
    let phase = 'ready'; // ready | play | dying | levelclear | gameover
    let phaseTimer = 0;
    let animTick = 0;

    function resetActors() {
      pac = {
        x: 14 * TILE,
        y: MAZE_Y + 23 * TILE + TILE / 2,
        dir: DIRS.left,
        nextDir: DIRS.left,
        mouth: 0,
        eatPause: 0,
      };
      resetTileMemory(pac);
      ghosts = {};
      for (const name of GHOST_ORDER) ghosts[name] = createGhost(name);
      ghostList = GHOST_ORDER.map((n) => ghosts[n]);
      ghostMode = 'scatter';
      waveIndex = 0;
      waveTimer = 0;
      frightTimer = 0;
      ghostChain = 0;
      noDotTimer = 0;
      freezeTimer = 0;
      hiddenGhost = null;
      scoreTags = [];
      fruit = null;
    }

    function startLevel(newLevel) {
      level = newLevel;
      spec = levelSpec(level);
      maze.reset();
      dotsEaten = 0;
      fruitShown = { 70: false, 170: false };
      usePersonalCounters = true;
      globalDotCounter = 0;
      if (fruitHistory[fruitHistory.length - 1] !== spec.fruit.name || level === 1) {
        if (level > 1) fruitHistory.push(spec.fruit.name);
        if (fruitHistory.length > 7) fruitHistory.shift();
      }
      resetActors();
      enterReady();
    }

    function enterReady() {
      phase = 'ready';
      phaseTimer = firstReady ? 260 : 130;
      if (firstReady) playIntro(env.audio);
      firstReady = false;
      env.audio.stopLoop();
    }

    function addScore(points) {
      score += points;
      if (score > hiScore) hiScore = score;
      env.onScore(score);
      if (!extraLifeAwarded && score >= SCORING.extraLifeAt) {
        extraLifeAwarded = true;
        lives++;
        playExtraLife(env.audio);
      }
    }

    // --- input ---
    const keyDirs = {
      ArrowUp: 'up', ArrowLeft: 'left', ArrowDown: 'down', ArrowRight: 'right',
      w: 'up', a: 'left', s: 'down', d: 'right',
      W: 'up', A: 'left', S: 'down', D: 'right',
    };
    env.input.onKeyDown((e) => {
      const d = keyDirs[e.key];
      if (d) pac.nextDir = DIRS[d];
    });
    env.input.onSwipe((d) => {
      pac.nextDir = DIRS[d];
    });

    // --- house release logic (Dossier: personal counters, global counter
    // after a death, and a no-dot release timer) ---
    function preferredHomeGhost() {
      for (const name of HOUSE_PREFERENCE) {
        if (ghosts[name].state === 'home') return ghosts[name];
      }
      return null;
    }

    function onDotEaten() {
      noDotTimer = 0;
      if (usePersonalCounters) {
        const g = preferredHomeGhost();
        if (g) g.dotCounter++;
      } else {
        globalDotCounter++;
      }
    }

    function updateHouse() {
      const g = preferredHomeGhost();
      if (!g) return;
      if (usePersonalCounters) {
        if (g.dotCounter >= spec.houseDotLimits[g.name]) g.state = 'leaving';
      } else if (globalDotCounter >= spec.globalDotLimits[g.name]) {
        g.state = 'leaving';
      }
      noDotTimer++;
      if (noDotTimer >= spec.noDotReleaseSeconds * 60) {
        noDotTimer = 0;
        const still = preferredHomeGhost();
        if (still) still.state = 'leaving';
      }
    }

    // --- eating / scoring ---
    function eatAt(col, row) {
      const ate = maze.eatAt(col, row);
      if (!ate) return;
      dotsEaten++;
      onDotEaten();
      playWaka(env.audio);
      if (ate === 'dot') {
        addScore(SCORING.dot);
        pac.eatPause = 1;
      } else {
        addScore(SCORING.energizer);
        pac.eatPause = 3;
        startFright();
      }
      if ((dotsEaten === 70 || dotsEaten === 170) && !fruitShown[dotsEaten]) {
        fruitShown[dotsEaten] = true;
        fruit = { timer: 540 + Math.floor(rng() * 60) };
      }
      updateElroy();
    }

    function startFright() {
      ghostChain = 0;
      if (spec.frightSeconds > 0) frightTimer = spec.frightSeconds * 60;
      for (const g of ghostList) {
        if (g.state === 'eyes' || g.state === 'entering') continue;
        if (spec.frightSeconds > 0) g.frightened = true;
        reverseGhost(g);
      }
    }

    function updateElroy() {
      const blinky = ghosts.blinky;
      const clydeOut = ghosts.clyde.state !== 'home';
      if (!clydeOut) { blinky.elroy = 0; return; }
      const left = maze.remaining;
      blinky.elroy = left <= spec.elroy2Dots ? 2 : left <= spec.elroy1Dots ? 1 : 0;
    }

    // --- pac movement ---
    function movePac() {
      if (pac.eatPause > 0) { pac.eatPause--; return; }
      // Reversal is allowed at any time.
      if (isReverse(pac.nextDir, pac.dir)) {
        pac.dir = pac.nextDir;
        resetTileMemory(pac);
      }
      // Pre-turn cornering: a buffered perpendicular turn engages within
      // 3px of the tile center (the original's corner-cutting advantage).
      const { col, row } = tileOf(pac);
      const c = centerOf(col, row);
      const perp = pac.nextDir !== pac.dir && pac.nextDir.x !== pac.dir.x && pac.nextDir.y !== pac.dir.y;
      if (perp) {
        const offAxis = pac.dir.x !== 0 ? Math.abs(pac.x - c.x) : Math.abs(pac.y - c.y);
        if (offAxis <= 3 && maze.pacCanEnter(col + pac.nextDir.x, row + pac.nextDir.y)) {
          pac.x = c.x;
          pac.y = c.y;
          pac.dir = pac.nextDir;
          resetTileMemory(pac);
        }
      }
      const speedPct = frightTimer > 0 ? spec.speeds.pacFright : spec.speeds.pac;
      stepActor(pac, BASE_SPEED * speedPct, {
        canEnter: (cc, rr) => maze.pacCanEnter(cc, rr),
        chooseDir: (cc, rr) => {
          if (pac.nextDir !== pac.dir && maze.pacCanEnter(cc + pac.nextDir.x, rr + pac.nextDir.y)) {
            return pac.nextDir;
          }
          return null;
        },
        onTile: (cc, rr) => eatAt(cc, rr),
      });
      wrapTunnel(pac);
      if (!pac.blocked) pac.mouth = (pac.mouth + 1) % 20;
    }

    // --- ghost mode waves ---
    function updateWaves() {
      if (frightTimer > 0) {
        frightTimer--;
        if (frightTimer === 0) {
          for (const g of ghostList) g.frightened = false;
          ghostChain = 0;
        }
        return; // wave clock pauses during fright
      }
      const waveSeconds = spec.waves[waveIndex];
      if (waveSeconds !== Infinity) {
        waveTimer++;
        if (waveTimer >= waveSeconds * 60) {
          waveTimer = 0;
          waveIndex++;
          ghostMode = waveIndex % 2 === 0 ? 'scatter' : 'chase';
          for (const g of ghostList) reverseGhost(g);
        }
      }
    }

    // --- collisions ---
    function checkCollisions() {
      const pt = tileOf(pac);
      for (const g of ghostList) {
        if (g.state !== 'normal') continue;
        const gt = tileOf(g);
        if (gt.col !== pt.col || gt.row !== pt.row) continue;
        if (g.frightened) {
          ghostChain = Math.min(ghostChain + 1, 4);
          const points = SCORING.ghost[ghostChain - 1];
          addScore(points);
          playGhostEat(env.audio);
          scoreTags.push({ x: g.x, y: g.y, text: String(points), timer: 60, color: '#00ffff' });
          g.state = 'eyes';
          g.frightened = false;
          resetTileMemory(g);
          freezeTimer = 40;
          hiddenGhost = g;
        } else {
          phase = 'dying';
          phaseTimer = 0;
          env.audio.stopLoop();
          return;
        }
      }
    }

    function onDeathComplete() {
      lives--;
      if (lives > 0) {
        usePersonalCounters = false; // switch to the global counter
        globalDotCounter = 0;
        resetActors();
        enterReady();
      } else {
        phase = 'gameover';
        phaseTimer = 200;
        env.audio.stopLoop();
      }
    }

    // --- background loop selection ---
    function updateLoops() {
      if (env.audio.muted) return;
      if (phase !== 'play') return;
      const anyEyes = ghostList.some((g) => g.state === 'eyes' || g.state === 'entering');
      if (anyEyes) {
        env.audio.setLoop(eyesLoop.name, eyesLoop.builder);
      } else if (frightTimer > 0) {
        env.audio.setLoop(frightLoop.name, frightLoop.builder);
      } else {
        const left = maze.remaining;
        const stage = left > 196 ? 0 : left > 144 ? 1 : left > 96 ? 2 : left > 48 ? 3 : 4;
        const siren = sirenLoop(stage);
        env.audio.setLoop(siren.name, siren.builder);
      }
    }

    // --- drawing ---
    function drawHud() {
      const oneUpOn = Math.floor(animTick / 16) % 2 === 0;
      if (oneUpOn) drawText(ctx, '1UP', 3 * TILE, 0, { color: '#f8f8ff' });
      drawText(ctx, 'HIGH SCORE', 9 * TILE, 0, { color: '#f8f8ff' });
      drawText(ctx, String(score || '00'), 7 * TILE, TILE, { color: '#f8f8ff', align: 'right' });
      if (hiScore > 0) {
        drawText(ctx, String(hiScore), 17 * TILE, TILE, { color: '#f8f8ff', align: 'right' });
      }
      // Lives (bottom-left) and fruit history (bottom-right).
      for (let i = 0; i < Math.min(lives - 1, 5); i++) {
        drawPac(ctx, 3 * TILE + i * 2 * TILE, H - TILE, 'left', 0.7);
      }
      for (let i = 0; i < fruitHistory.length; i++) {
        const x = W - 3 * TILE - i * 2 * TILE;
        drawFruit(ctx, x, H - TILE, fruitHistory[fruitHistory.length - 1 - i]);
      }
    }

    function drawActors({ pacVisible = true, ghostsVisible = true } = {}) {
      if (fruit) drawFruit(ctx, FRUIT_POS.x, FRUIT_POS.y, spec.fruit.name);

      if (pacVisible) {
        const openness = pac.blocked ? 0.6 : Math.abs((pac.mouth % 10) - 5) / 5;
        drawPac(ctx, pac.x, pac.y, dirName(pac.dir), openness);
      }
      if (ghostsVisible) {
        const flashing = frightTimer > 0 && frightTimer < spec.frightFlashes * 28 * 2;
        for (const g of ghostList) {
          if (g === hiddenGhost && freezeTimer > 0) continue;
          let mode = 'normal';
          if (g.state === 'eyes' || g.state === 'entering') mode = 'eyes';
          else if (g.frightened) {
            mode = flashing && Math.floor(animTick / 14) % 2 === 0 ? 'frightFlash' : 'fright';
          }
          drawGhost(ctx, g.x, g.y, {
            color: g.color,
            dirName: dirName(g.dir),
            frame: Math.floor(g.animFrame / 8),
            mode,
          });
        }
      }
      for (const tag of scoreTags) {
        drawText(ctx, tag.text, tag.x, tag.y - 3, { color: tag.color, align: 'center' });
      }
    }

    function drawDebug() {
      if (!env.debug) return;
      ctx.save();
      ctx.globalAlpha = 0.85;
      for (const g of ghostList) {
        if (g.state !== 'normal' || g.frightened) continue;
        const t = ghostTarget(g, world());
        if (!t) continue;
        ctx.strokeStyle = g.color;
        ctx.strokeRect(t.col * TILE + 1, MAZE_Y + t.row * TILE + 1, TILE - 2, TILE - 2);
      }
      ctx.restore();
      drawText(ctx, `${ghostMode} W${waveIndex}`, 0, H - 3 * TILE, { color: '#888', scale: 1 });
    }

    const world = () => ({
      maze,
      mode: ghostMode,
      level: spec,
      rng,
      pac: { ...tileOf(pac), x: pac.x, y: pac.y, dir: pac.dir },
      blinky: ghosts.blinky,
    });

    function draw() {
      ctx.fillStyle = '#0a0a0e';
      ctx.fillRect(0, 0, W, H);
      const flashOn = phase === 'levelclear' && phaseTimer < 100 && Math.floor(phaseTimer / 12) % 2 === 0;
      ctx.drawImage(flashOn ? maze.wallsFlash : maze.walls, 0, 0);
      if (phase !== 'levelclear') {
        maze.drawDots(ctx, { blinkOn: Math.floor(animTick / 10) % 2 === 0 });
      }
      drawHud();
    }

    function expose() {
      if (!env.debug) return;
      env.expose({
        phase,
        level,
        score,
        lives,
        mode: ghostMode,
        waveIndex,
        frightTimer,
        dotsEaten,
        dotsRemaining: maze.remaining,
        totalDots: maze.totalDots,
        pac: tileOf(pac),
        ghosts: Object.fromEntries(ghostList.map((g) => [g.name, {
          state: g.state,
          frightened: g.frightened,
          elroy: g.elroy,
          tile: tileOf(g),
          target: g.state === 'normal' && !g.frightened ? ghostTarget(g, world()) : null,
        }])),
      });
    }

    startLevel(1);

    // Debug-only hooks so scripted tests can reach states that are slow or
    // luck-dependent to produce by playing (chains, Elroy, level clears).
    if (env.debug && env.exposeActions) {
      env.exposeActions({
        fright: () => startFright(),
        teleport: (col, row) => {
          const c = centerOf(col, row);
          pac.x = c.x;
          pac.y = c.y;
          resetTileMemory(pac);
        },
        spawnFruit: () => { fruit = { timer: 540 }; },
        eatAllBut: (n) => {
          for (const key of [...maze.dots]) {
            if (maze.dots.size <= n) break;
            maze.dots.delete(key);
            dotsEaten++;
          }
          if (n === 0) {
            for (const key of [...maze.energizers]) {
              maze.energizers.delete(key);
              dotsEaten++;
            }
          }
          updateElroy();
        },
      });
    }

    return {
      tick() {
        animTick++;

        switch (phase) {
          case 'ready': {
            phaseTimer--;
            draw();
            drawActors();
            drawText(ctx, 'READY!', 14 * TILE, MAZE_Y + 17 * TILE, { color: '#ffff00', align: 'center' });
            if (phaseTimer <= 0) phase = 'play';
            break;
          }

          case 'play': {
            if (freezeTimer > 0) {
              freezeTimer--;
              if (freezeTimer === 0) hiddenGhost = null;
              draw();
              drawActors({ pacVisible: freezeTimer === 0 });
              break;
            }
            updateWaves();
            movePac();
            const w = world();
            for (const g of ghostList) updateGhost(g, w);
            updateHouse();
            updateElroy();
            checkCollisions();

            if (fruit && --fruit.timer <= 0) fruit = null;
            const pt = tileOf(pac);
            if (fruit && pt.row === 17 && (pt.col === 13 || pt.col === 14)) {
              fruit = null;
              addScore(spec.fruit.points);
              playFruit(env.audio);
              scoreTags.push({ x: FRUIT_POS.x, y: FRUIT_POS.y, text: String(spec.fruit.points), timer: 90, color: '#ffb8ff' });
            }
            for (let i = scoreTags.length - 1; i >= 0; i--) {
              if (--scoreTags[i].timer <= 0) scoreTags.splice(i, 1);
            }

            updateLoops();
            draw();
            drawActors();
            drawDebug();

            if (maze.remaining === 0) {
              phase = 'levelclear';
              phaseTimer = 160;
              env.audio.stopLoop();
            }
            break;
          }

          case 'dying': {
            phaseTimer++;
            draw();
            if (phaseTimer < 50) {
              drawActors(); // brief stunned pause with ghosts visible
            } else {
              if (phaseTimer === 50) playDeath(env.audio);
              drawActors({ pacVisible: false, ghostsVisible: false });
              drawPacDeath(ctx, pac.x, pac.y, Math.min((phaseTimer - 50) / 90, 1));
            }
            if (phaseTimer >= 150) onDeathComplete();
            break;
          }

          case 'levelclear': {
            phaseTimer--;
            draw();
            if (phaseTimer >= 100) drawActors({ ghostsVisible: false });
            if (phaseTimer <= 0) startLevel(level + 1);
            break;
          }

          case 'gameover': {
            phaseTimer--;
            draw();
            drawText(ctx, 'GAME OVER', 14 * TILE, MAZE_Y + 17 * TILE, { color: '#ff0000', align: 'center' });
            if (phaseTimer <= 0) {
              env.onGameOver(score);
              return;
            }
            break;
          }

          default: break;
        }

        expose();
      },
    };
  },
};

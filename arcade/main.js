// Cabinet controller: owns the menu / game / game-over state machine, the
// screen, input lifetimes, HUD, and personal bests. Games are plug-in modules
// — see games/*.js for the contract: { id, title, mode, start(env) => {tick} }.
import { createLoop } from './engine/loop.js';
import { createScreen } from './engine/canvas.js';
import { createInput } from './engine/input.js';
import { createFx } from './engine/fx.js';
import { getPB, getPBs, recordPB } from './engine/storage.js';

import snake from './games/snake.js';
import flappy from './games/flappy.js';
import breakout from './games/breakout.js';
import asteroids from './games/asteroids.js';

const GAMES = [snake, flappy, breakout, asteroids];

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';

// --- DOM ---
const displayCanvas = document.getElementById('gameCanvas');
const menuScreen = document.getElementById('arcade-menu');
const gameOverScreen = document.getElementById('game-over-screen');
const hudScore = document.getElementById('hud-score');
const currentScoreText = document.getElementById('current-score');
const finalScoreText = document.getElementById('final-score');

// --- Engine singletons ---
const screen = createScreen(displayCanvas);
const input = createInput(screen);
const fx = createFx(screen.ctx);

// Phase 2 replaces this stub with the WebAudio engine.
const audioStub = {
  play() {},
  startLoop() {},
  stopLoop() {},
  unlock() {},
};

// --- State ---
let activeGame = null; // registry entry
let loop = null;
let currentScore = 0;
let drainToken = 0; // invalidates a running death-particle drain

const debugState = { sfxLog: [] };
if (DEBUG) {
  window.__arcade = {
    get game() { return activeGame ? activeGame.id : null; },
    get score() { return currentScore; },
    sfxLog: debugState.sfxLog,
    screen,
  };
}

// --- HUD / overlays ---
function renderPBs() {
  const pbs = getPBs();
  document.querySelectorAll('[data-game]').forEach((el) => {
    const value = pbs[el.dataset.game];
    el.textContent = value != null ? `PB · ${value}` : 'PB · —';
  });
}

function showMenu() {
  drainToken++;
  stopScene();
  menuScreen.style.display = 'block';
  gameOverScreen.style.display = 'none';
  hudScore.style.display = 'none';
  screen.setMode('landscape');
  screen.ctx.clearRect(0, 0, screen.w, screen.h);
  screen.blit();
  renderPBs();
}

function stopScene() {
  if (loop) loop.stop();
  loop = null;
  input.detachAll();
  fx.clear();
  activeGame = null;
}

function startGame(entry) {
  drainToken++;
  if (loop) loop.stop();
  input.detachAll();
  fx.clear();

  activeGame = entry;
  currentScore = 0;
  menuScreen.style.display = 'none';
  gameOverScreen.style.display = 'none';
  hudScore.style.display = 'block';
  currentScoreText.textContent = '0';

  screen.setMode(entry.mode);
  input.attach();

  const env = {
    ctx: screen.ctx,
    W: screen.w,
    H: screen.h,
    input,
    fx,
    audio: audioStub,
    debug: DEBUG,
    onScore(score) {
      currentScore = score;
      currentScoreText.textContent = score;
    },
    onGameOver(score) {
      onGameOver(score);
    },
    expose(state) {
      if (DEBUG) window.__arcade.gameState = state;
    },
  };

  const scene = entry.start(env);
  loop = createLoop({ tick: scene.tick, render: screen.blit });
  loop.start();
}

function onGameOver(score) {
  const entry = activeGame;
  if (loop) loop.stop();
  loop = null;
  input.detachAll();

  const isNewPB = recordPB(entry.id, score);
  finalScoreText.textContent = `Score: ${score}`;
  if (isNewPB) {
    const badge = document.createElement('span');
    badge.className = 'new-pb';
    badge.textContent = 'new personal best';
    finalScoreText.append(' ', badge);
  }
  renderPBs();
  hudScore.style.display = 'none';
  gameOverScreen.style.display = 'block';

  // Let death particles drain on top of the final frame (ported behavior).
  const token = ++drainToken;
  const ctx = screen.ctx;
  (function drain() {
    if (token !== drainToken || fx.count === 0) return;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.15)';
    ctx.fillRect(0, 0, screen.w, screen.h);
    fx.updateAndDraw();
    screen.blit();
    requestAnimationFrame(drain);
  })();
}

// --- Wiring ---
for (const entry of GAMES) {
  const btn = document.getElementById(`btn-${entry.id.toLowerCase()}`);
  if (btn) btn.addEventListener('click', () => startGame(entry));
}

document.getElementById('btn-restart').addEventListener('click', () => {
  const entry = activeGame;
  if (entry) startGame(entry);
});

document.getElementById('btn-menu').addEventListener('click', showMenu);

renderPBs();
showMenu();

// Deep links: ?game=snake|flappy|breakout|asteroids (pacman arrives later).
const requested = (params.get('game') || '').toUpperCase();
const deepLink = GAMES.find((g) => g.id === requested);
if (deepLink) startGame(deepLink);

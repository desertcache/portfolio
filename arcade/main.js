// Cabinet controller: owns the menu / game / game-over state machine, the
// screen, input lifetimes, HUD, and personal bests. Games are plug-in modules
// — see games/*.js for the contract: { id, title, mode, start(env) => {tick} }.
import { createLoop } from './engine/loop.js';
import { createScreen } from './engine/canvas.js';
import { createInput } from './engine/input.js';
import { createFx } from './engine/fx.js';
import { createAudio } from './engine/audio.js';
import { getPB, getPBs, recordPB, getSettings, setSetting } from './engine/storage.js';

import pacman from './games/pacman/index.js';
import snake from './games/snake.js';
import flappy from './games/flappy.js';
import breakout from './games/breakout.js';
import asteroids from './games/asteroids.js';
import pacmanAi from './games/pacman-ai.js';
import four from './games/four.js';
import evolve from './games/evolve.js';
import crossing from './games/crossing.js';
import swarm from './games/swarm.js';
import quadra from './games/quadra.js';
import pinball from './games/pinball.js';
import mesa from './games/mesa.js';
import mesaAi from './games/mesa-ai.js';
import { createAttract } from './games/attract.js';
import { EXPLAINERS } from './explainers.js';
import { iconCanvas } from './icons.js';

const GAMES = [pacman, pacmanAi, snake, flappy, breakout, asteroids, four, evolve, crossing, swarm, quadra, pinball, mesa, mesaAi];

// The deck's cartridges, in GAMES order: menu number and a label short enough for a tile.
const CARTS = {
  PACMAN: ['01', 'Pac-Man'], PACMANAI: ['AI', 'AI Pac'], SNAKE: ['02', 'Snake'], FLAPPY: ['03', 'Flappy'],
  BREAKOUT: ['04', 'Breakout'], ASTEROIDS: ['05', 'Asteroids'], FOUR: ['06', 'Four'], EVOLVE: ['07', 'Evolve'],
  CROSSING: ['08', 'Roadrunner'], SWARM: ['09', 'Swarm'], QUADRA: ['10', 'QUADRA'],
  PINBALL: ['11', 'Pinball'], MESA: ['12', 'Mesa'], MESAAI: ['AI', 'AI Mesa'],
};
const AI_TITLES = new Set(['PACMANAI', 'FOUR', 'EVOLVE', 'MESAAI']);

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

const debugState = { sfxLog: [] };
const audio = createAudio({
  muted: getSettings().muted,
  onPlay(name) {
    debugState.sfxLog.push(name);
    if (debugState.sfxLog.length > 200) debugState.sfxLog.shift();
  },
});

// Autoplay policy: the context can only start from a user gesture.
document.addEventListener('pointerdown', () => audio.unlock());
document.addEventListener('keydown', () => audio.unlock());

// Attract mode runs on the menu canvas; a reduced-motion preference gets a
// single static frame instead of the animation.
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const attract = createAttract(screen);
const attractLoop = createLoop({ tick: () => attract.tick(), render: screen.blit });

const cabinet = document.getElementById('arcade-section');
const crtBtn = document.getElementById('btn-crt');
function renderCrt() {
  const on = getSettings().crt;
  cabinet.classList.toggle('crt-off', !on);
  if (crtBtn) crtBtn.textContent = on ? 'CRT · ON' : 'CRT · OFF';
}
if (crtBtn) {
  crtBtn.addEventListener('click', () => {
    setSetting('crt', !getSettings().crt);
    renderCrt();
  });
}
renderCrt();

const muteBtn = document.getElementById('btn-mute');
function renderMute() {
  if (muteBtn) muteBtn.textContent = audio.muted ? 'SOUND · OFF' : 'SOUND · ON';
}
if (muteBtn) {
  muteBtn.addEventListener('click', () => {
    audio.setMuted(!audio.muted);
    setSetting('muted', audio.muted);
    renderMute();
  });
  renderMute();
}

// --- State ---
let activeGame = null; // registry entry
let loop = null;
let currentScore = 0;
let drainToken = 0; // invalidates a running death-particle drain

if (DEBUG) {
  window.__arcade = {
    get game() { return activeGame ? activeGame.id : null; },
    get score() { return currentScore; },
    get audioReady() { return audio.ready; },
    sfxLog: debugState.sfxLog,
    screen,
  };
}

// --- HUD / overlays ---
function renderPBs() {
  const pbs = getPBs();
  document.querySelectorAll('[data-game]').forEach((el) => {
    const value = pbs[el.dataset.game];
    el.textContent = value != null ? `PB · ${value}` : 'PB · –';
  });
}

// --- The deck and the explainer: both follow whatever is on the screen ---
const deckCarts = document.getElementById('deck-carts');
/** @type {Map<string, HTMLButtonElement>} */
const carts = new Map();
for (const entry of GAMES) {
  const [num, label] = CARTS[entry.id] || ['', entry.title];
  const cart = document.createElement('button');
  cart.type = 'button';
  cart.className = AI_TITLES.has(entry.id) ? 'cart ai' : 'cart';
  cart.title = EXPLAINERS[entry.id]?.name || entry.title;
  cart.setAttribute('aria-label', cart.title);
  const numEl = document.createElement('span');
  numEl.className = 'cart-num';
  numEl.textContent = num;
  const nameEl = document.createElement('span');
  nameEl.className = 'cart-name';
  nameEl.textContent = label;
  cart.append(iconCanvas(entry.id), numEl, nameEl);
  // Hand the keyboard straight back to the game: a focused button would turn the
  // next Space (fire, flap, drop) into a click that restarts the game.
  cart.addEventListener('click', () => { cart.blur(); startGame(entry); });
  deckCarts?.append(cart);
  carts.set(entry.id, cart);
}

/** @param {number} step */
function stepGame(step) {
  const i = activeGame ? GAMES.indexOf(activeGame) : (step > 0 ? -1 : 0);
  startGame(GAMES[(i + step + GAMES.length) % GAMES.length]);
}
/** @param {string} id @param {() => void} fn */
function deckButton(id, fn) {
  const b = document.getElementById(id);
  if (b) b.addEventListener('click', () => { b.blur(); fn(); });
}
deckButton('deck-prev', () => stepGame(-1));
deckButton('deck-next', () => stepGame(1));
deckButton('deck-menu', () => showMenu());
// [ and ] switch games from anywhere on the page, unless you're typing somewhere.
document.addEventListener('keydown', (e) => {
  if ((e.key !== '[' && e.key !== ']') || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  e.preventDefault();
  stepGame(e.key === ']' ? 1 : -1);
});

const howName = document.getElementById('how-name');
const howTitle = document.getElementById('how-title');
const howBody = document.getElementById('how-body');
const howRows = document.getElementById('how-rows');

/** Light the active cartridge, swap the explainer, and keep the address bar shareable.
 * @param {string | null} id */
function sceneChanged(id) {
  cabinet.classList.toggle('is-playing', id !== null);
  for (const [cid, cart] of carts) cart.setAttribute('aria-current', String(cid === id));
  const lit = id ? carts.get(id) : null;
  if (lit && deckCarts) {
    // Scroll the row only (scrollIntoView would also scroll the page on phones).
    const left = lit.offsetLeft - deckCarts.offsetLeft - (deckCarts.clientWidth - lit.offsetWidth) / 2;
    deckCarts.scrollTo({ left, behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
  }

  const ex = EXPLAINERS[id || 'MENU'] || EXPLAINERS.MENU;
  if (howName) howName.textContent = ex.name;
  if (howTitle) howTitle.textContent = ex.title;
  if (howBody) howBody.textContent = ex.body;
  if (howRows) {
    howRows.replaceChildren(...ex.rows.flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      return [dt, dd];
    }));
  }

  const url = new URL(location.href);
  if (id) url.searchParams.set('game', id.toLowerCase());
  else url.searchParams.delete('game');
  if (url.href !== location.href) history.replaceState(history.state, '', url);
}

function showMenu() {
  drainToken++;
  stopScene();
  sceneChanged(null);
  menuScreen.style.display = 'block';
  gameOverScreen.style.display = 'none';
  hudScore.style.display = 'none';
  screen.setMode('landscape');
  screen.ctx.clearRect(0, 0, screen.w, screen.h);
  renderPBs();
  if (REDUCED_MOTION) {
    attract.tick();
  } else {
    attractLoop.start();
  }
  screen.blit();
}

function stopScene() {
  attractLoop.stop();
  if (loop) loop.stop();
  loop = null;
  input.detachAll();
  audio.stopLoop();
  fx.clear();
  activeGame = null;
}

function startGame(entry) {
  drainToken++;
  attractLoop.stop();
  if (loop) loop.stop();
  input.detachAll();
  fx.clear();

  activeGame = entry;
  sceneChanged(entry.id);
  currentScore = 0;
  menuScreen.style.display = 'none';
  gameOverScreen.style.display = 'none';
  hudScore.style.display = entry.ownHud ? 'none' : 'block';
  currentScoreText.textContent = '0';

  screen.setMode(entry.mode);
  input.attach();

  const env = {
    ctx: screen.ctx,
    W: screen.w,
    H: screen.h,
    input,
    fx,
    audio,
    pb: getPB(entry.id),
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
    exposeActions(actions) {
      if (DEBUG) window.__arcade.actions = actions;
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
  audio.stopLoop();

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

// Menu keyboard navigation: arrows move focus, Enter starts, 1-9, 0, - and = quick-start
// the numbered titles (0 is 10, - is 11, = is 12), A starts "Watch the AI play" and L
// starts "Watch it learn".
const MENU_NUMS = { '0': '10', '-': '11', '=': '12' };
const menuButtons = [...menuScreen.querySelectorAll('.arcade-btn')];
document.addEventListener('keydown', (e) => {
  if (menuScreen.style.display === 'none') return;
  const idx = menuButtons.indexOf(document.activeElement);
  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
    e.preventDefault();
    menuButtons[(idx + 1 + menuButtons.length) % menuButtons.length].focus();
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
    e.preventDefault();
    menuButtons[(idx - 1 + menuButtons.length) % menuButtons.length].focus();
  } else if (/^[0-9=-]$/.test(e.key)) {
    const num = MENU_NUMS[e.key] || e.key.padStart(2, '0');
    const btn = menuButtons.find((b) => b.querySelector('.num')?.textContent === num);
    if (btn) btn.click();
  } else if (e.key === 'a' || e.key === 'A') {
    document.getElementById('btn-pacmanai')?.click();
  } else if (e.key === 'l' || e.key === 'L') {
    document.getElementById('btn-mesaai')?.click();
  }
});

renderPBs();
showMenu();

// Deep links: ?game=<id>, e.g. ?game=pacman, ?game=pacmanai, ?game=four, ?game=pinball, ?game=mesaai.
const requested = (params.get('game') || '').toUpperCase();
const deepLink = GAMES.find((g) => g.id === requested);
if (deepLink) startGame(deepLink);

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

// What the now-playing bar calls each game.
const LABELS = {
  PACMAN: 'Pac-Man', PACMANAI: 'Pac-Man · AI', SNAKE: 'Neon Snake', FLAPPY: 'Flappy UFO',
  BREAKOUT: 'Breakout', ASTEROIDS: 'Asteroids', FOUR: 'Four in a Row', EVOLVE: 'UFO Evolution',
  CROSSING: 'Roadrunner', SWARM: 'Swarm', QUADRA: 'QUADRA',
  PINBALL: 'Pinball', MESA: 'Mesa Lander', MESAAI: 'Mesa Lander · AI',
};
// The menu has twelve tiles. Two games carry an AI twin that is reached from the same tile
// (and the bar's mode button) rather than being a tile of its own, so [ and ] step through
// twelve stops, not fourteen.
const AI_TWIN = { PACMAN: 'PACMANAI', MESA: 'MESAAI' };
const HUMAN_TWIN = { PACMANAI: 'PACMAN', MESAAI: 'MESA' };
const STEPS = GAMES.filter((g) => !(g.id in HUMAN_TWIN));
const byId = (id) => GAMES.find((g) => g.id === id);

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

// Fill screen: the stage (cabinet + game bar) goes fullscreen and the screen takes the room
// (engine/canvas.js sizes to it). Hidden where the browser can't fullscreen an element (iPhone).
const stage = document.getElementById('arcade-stage');
const fillBtn = document.getElementById('btn-fill');
if (fillBtn && stage && stage.requestFullscreen && document.fullscreenEnabled) {
  fillBtn.addEventListener('click', () => {
    fillBtn.blur(); // keep Space (fire, flap, drop) from clicking the button again
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.requestFullscreen().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => {
    fillBtn.textContent = document.fullscreenElement ? 'EXIT FILL' : 'FILL SCREEN';
    screen.resize();
  });
} else if (fillBtn) {
  fillBtn.hidden = true;
}

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
// The menu's tiles carry their pixel icons; the markup is static so the page reads without script.
document.querySelectorAll('.tile-main[data-icon]').forEach((btn) => {
  btn.querySelector('.tile-icon')?.append(iconCanvas(btn.dataset.icon));
});

// The bar under the cabinet: previous / now playing / next, plus the AI twin and the way back
// to the menu. Whatever is on the screen drives it (see sceneChanged).
const deckEl = (id) => document.getElementById(id);
const deckNow = { icon: deckEl('deck-now-icon'), name: deckEl('deck-now-name'), meta: deckEl('deck-now-meta') };
const deckMode = deckEl('deck-mode');
const deckMenu = deckEl('deck-menu');

/** The game at a step position, counting an AI twin as its human game.
 * @param {string | null} id */
function stepIndex(id) {
  return id ? STEPS.findIndex((g) => g.id === (HUMAN_TWIN[id] || id)) : -1;
}
/** @param {number} step */
function stepGame(step) {
  const i = activeGame ? stepIndex(activeGame.id) : (step > 0 ? -1 : 0);
  startGame(STEPS[(i + step + STEPS.length) % STEPS.length]);
}
/** @param {string} id @param {() => void} fn */
function deckButton(id, fn) {
  const b = document.getElementById(id);
  // Hand the keyboard straight back to the game: a focused button would turn the
  // next Space (fire, flap, drop) into a click that restarts the game.
  if (b) b.addEventListener('click', () => { b.blur(); fn(); });
}
deckButton('deck-prev', () => stepGame(-1));
deckButton('deck-next', () => stepGame(1));
deckButton('deck-menu', () => showMenu());
deckButton('deck-mode', () => {
  if (!activeGame) return;
  const twin = AI_TWIN[activeGame.id] || HUMAN_TWIN[activeGame.id];
  if (twin) startGame(byId(twin));
});
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

/** @param {string | null} id */
function renderDeck(id) {
  const at = stepIndex(id);
  const prev = STEPS[((at < 0 ? 0 : at) - 1 + STEPS.length) % STEPS.length];
  const next = STEPS[(at + 1) % STEPS.length];
  deckEl('deck-prev-name').textContent = LABELS[prev.id];
  deckEl('deck-next-name').textContent = LABELS[next.id];

  deckNow.icon.replaceChildren(...(id ? [iconCanvas(id)] : []));
  deckNow.name.textContent = id ? LABELS[id] : 'Pick a game';
  deckNow.meta.textContent = id ? `Game ${at + 1} of ${STEPS.length}${id in HUMAN_TWIN ? ' · AI mode' : ''}` : `${STEPS.length} games`;
  deckNow.icon.hidden = id === null;

  const twin = id ? AI_TWIN[id] || HUMAN_TWIN[id] : null;
  deckMode.hidden = !twin;
  if (twin) deckMode.textContent = id in AI_TWIN ? 'Watch the AI' : 'Play it yourself';
  deckMenu.hidden = id === null;
}

/** Update the now-playing bar, swap the explainer, and keep the address bar shareable.
 * @param {string | null} id */
function sceneChanged(id) {
  cabinet.classList.toggle('is-playing', id !== null);
  renderDeck(id);

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

// Menu keyboard navigation: arrows move across the tile grid, Enter starts, 1-9, 0, - and =
// quick-start the numbered titles (0 is 10, - is 11, = is 12), A starts "Watch the AI play"
// and L starts "Watch it learn".
const MENU_NUMS = { '0': '10', '-': '11', '=': '12' };
const menuTiles = [...menuScreen.querySelectorAll('.tile-main')];
document.addEventListener('keydown', (e) => {
  if (menuScreen.style.display === 'none' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key.startsWith('Arrow')) {
    // Tiles per row, read from the live grid so the phone's 3 columns work like the desktop's 4.
    const cols = getComputedStyle(menuScreen.querySelector('.menu-buttons')).gridTemplateColumns.split(' ').length;
    const here = menuTiles.indexOf(document.activeElement?.closest('.tile')?.querySelector('.tile-main'));
    const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
    e.preventDefault();
    let to = here < 0 ? 0 : here + move;
    if (here >= 0 && Math.abs(move) === 1) to = (to + menuTiles.length) % menuTiles.length; // rows wrap
    else if (here >= 0) to = Math.min(Math.max(to, 0), menuTiles.length - 1); // columns stop at the ends
    menuTiles[to].focus();
  } else if (/^[0-9=-]$/.test(e.key)) {
    const num = MENU_NUMS[e.key] || e.key.padStart(2, '0');
    const btn = menuTiles.find((b) => b.querySelector('.num')?.textContent === num);
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

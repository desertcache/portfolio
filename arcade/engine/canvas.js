// Screen with fixed logical resolutions. Games draw to an offscreen canvas at
// a constant logical size and never see the display size, so resizing the
// window mid-game cannot change gameplay geometry (the old arcade.js bug).
// The display canvas is presentation only: aspect-fit for vector games,
// device-pixel integer scaling for pixel-art (Pac-Man). maxW and maxH cap the
// display box in CSS pixels; the height is also held to what the window leaves under
// the page header and the cabinet's own frame. In fill-screen mode the caps are off.
export const MODES = {
  landscape: { w: 800, h: 500, pixelArt: false, maxW: 1200, maxH: 760 },
  // A tall vector screen for the pinball table.
  tall: { w: 450, h: 720, pixelArt: false, maxW: 600, maxH: 860 },
  portrait: { w: 224, h: 288, pixelArt: true, maxW: 700, maxH: 800 },
};

// Air kept around the stage (12 under the nav, where the page scrolls it to, and 12 below), and
// the shortest screen a short window will shrink the game to. The rest of the vertical budget
// is measured (see pageChrome in createScreen).
const AIR = 24;
const MIN_H = 220;

export function createScreen(displayCanvas) {
  const displayCtx = displayCanvas.getContext('2d');
  const logical = document.createElement('canvas');
  const ctx = logical.getContext('2d');
  let mode = MODES.landscape;

  function setMode(name) {
    mode = MODES[name] || MODES.landscape;
    logical.width = mode.w;
    logical.height = mode.h;
    displayCanvas.classList.toggle('pixel-art', mode.pixelArt);
    resize();
  }

  // Width comes from the room around the bezel, never the bezel itself: the bezel
  // shrink-wraps whatever canvas it holds, so measuring it let a narrow game
  // (portrait Pac-Man) pin every later landscape game at Pac-Man's width.
  const bezel = displayCanvas.parentElement;
  const room = bezel.parentElement || bezel;
  const px = (/** @type {CSSStyleDeclaration} */ s, /** @type {string[]} */ props) =>
    props.reduce((sum, p) => sum + (parseFloat(s.getPropertyValue(p)) || 0), 0);

  // The game bar under the cabinet is part of the stage, so the screen's height budget has to
  // leave room for it too.
  const deck = room.closest('.cabinet-stage')?.querySelector('.game-deck') ?? null;

  // Everything in the window that isn't the screen while a game plays: the fixed nav, the
  // cabinet's padding and the bezel around the screen, the game bar and its gap, and some air.
  // The page scrolls the stage to sit just under the nav (arcade/main.js), so the whole stage
  // is in view when the screen takes the rest.
  function verticalEdge() {
    return room === bezel ? 0
      : px(getComputedStyle(room), ['padding-top', 'padding-bottom', 'border-top-width', 'border-bottom-width'])
        + px(getComputedStyle(bezel), ['padding-top', 'padding-bottom', 'border-top-width', 'border-bottom-width']);
  }
  function pageChrome() {
    const nav = document.getElementById('nav');
    const bar = deck ? deck.offsetHeight + px(getComputedStyle(deck), ['margin-top']) : 0;
    return (nav ? nav.offsetHeight : 68) + verticalEdge() + bar + AIR;
  }

  function availableBox() {
    // clientWidth already excludes the room's border; take off its padding, then the
    // bezel's padding and border so the bezel's outer edge fits the room.
    const roomInner = room === bezel ? room.clientWidth
      : room.clientWidth - px(getComputedStyle(room), ['padding-left', 'padding-right']);
    const bezelEdge = room === bezel ? 0
      : px(getComputedStyle(bezel), ['padding-left', 'padding-right', 'border-left-width', 'border-right-width']);
    const w = Math.max(160, roomInner - bezelEdge);
    if (document.fullscreenElement) {
      // Fill-screen mode: the stage fixes the room's height, so the screen takes all of it.
      return { w, h: Math.max(160, room.clientHeight - verticalEdge()) };
    }
    // Height budget: what the window leaves once the nav, the cabinet's frame and the game bar
    // are in, so the whole stage fits without scrolling.
    const h = Math.max(MIN_H, Math.min(window.innerHeight - pageChrome(), mode.maxH));
    return { w: Math.min(w, mode.maxW), h };
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const box = availableBox();
    if (mode.pixelArt) {
      // Integer scale in *device* pixels for perfectly square pixels.
      const kCss = Math.max(1, Math.min(box.w / mode.w, box.h / mode.h));
      const k = Math.max(1, Math.floor(kCss * dpr));
      displayCanvas.width = mode.w * k;
      displayCanvas.height = mode.h * k;
      displayCanvas.style.width = `${(mode.w * k) / dpr}px`;
      displayCanvas.style.height = `${(mode.h * k) / dpr}px`;
    } else {
      const scale = Math.min(box.w / mode.w, box.h / mode.h);
      const cssW = Math.floor(mode.w * scale);
      const cssH = Math.floor(mode.h * scale);
      displayCanvas.width = Math.floor(cssW * dpr);
      displayCanvas.height = Math.floor(cssH * dpr);
      displayCanvas.style.width = `${cssW}px`;
      displayCanvas.style.height = `${cssH}px`;
    }
    blit();
  }

  function blit() {
    displayCtx.imageSmoothingEnabled = !mode.pixelArt;
    displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
    displayCtx.drawImage(logical, 0, 0, displayCanvas.width, displayCanvas.height);
  }

  // Map a client-space point (mouse/touch) into logical pixels.
  function toLogical(clientX, clientY) {
    const rect = displayCanvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * mode.w,
      y: ((clientY - rect.top) / rect.height) * mode.h,
    };
  }

  const observer = new ResizeObserver(() => resize());
  observer.observe(room);
  if (deck) observer.observe(deck); // its height is part of the budget (fonts, wrapping)
  window.addEventListener('resize', resize);

  setMode('landscape');

  return {
    ctx,
    blit,
    setMode,
    resize,
    toLogical,
    get w() { return mode.w; },
    get h() { return mode.h; },
    get element() { return displayCanvas; },
  };
}

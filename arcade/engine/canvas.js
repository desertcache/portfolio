// Screen with fixed logical resolutions. Games draw to an offscreen canvas at
// a constant logical size and never see the display size, so resizing the
// window mid-game cannot change gameplay geometry (the old arcade.js bug).
// The display canvas is presentation only: aspect-fit for vector games,
// device-pixel integer scaling for pixel-art (Pac-Man).
export const MODES = {
  landscape: { w: 800, h: 500, pixelArt: false },
  portrait: { w: 224, h: 288, pixelArt: true },
};

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

  function availableBox() {
    const holder = displayCanvas.parentElement;
    const styles = getComputedStyle(holder);
    const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const w = Math.max(160, holder.clientWidth - padX);
    // Height budget: don't exceed the viewport so the whole screen stays visible.
    const h = Math.max(160, Math.min(window.innerHeight * 0.72, mode.pixelArt ? 620 : 520));
    return { w: Math.min(w, mode.pixelArt ? 560 : 800), h };
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
  observer.observe(displayCanvas.parentElement);
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

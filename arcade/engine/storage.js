// Personal bests + settings. The PB key and game IDs predate the rewrite —
// they must not change, or returning visitors lose their scores.
const PB_KEY = 'sb_arcade_pb_v1';
const SETTINGS_KEY = 'sb_arcade_settings_v1';

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode) — play on without persistence */
  }
}

export function getPBs() {
  return read(PB_KEY, {});
}

export function getPB(gameId) {
  return getPBs()[gameId] ?? null;
}

// Returns true when the score is a new personal best.
export function recordPB(gameId, score) {
  if (!gameId || score == null) return false;
  const pbs = getPBs();
  if (score > (pbs[gameId] || 0)) {
    pbs[gameId] = score;
    write(PB_KEY, pbs);
    return true;
  }
  return false;
}

const DEFAULT_SETTINGS = { muted: false, crt: true };

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY, {}) };
}

export function setSetting(name, value) {
  const settings = getSettings();
  settings[name] = value;
  write(SETTINGS_KEY, settings);
}

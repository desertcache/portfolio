// Shared movement for maze actors. Positions are float pixel centers on the
// 224×288 logical canvas; tiles are 8px. Actors travel the center lines of
// corridors, make decisions at tile centers, and accumulate fractional speed
// (the original moves at percentage speeds of ~1.26 px per 60 Hz tick).
import { TILE, MAZE_Y, COLS } from './maze.js';

export const DIRS = {
  up: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  down: { x: 0, y: 1 },
  right: { x: 1, y: 0 },
};

export function tileOf(actor) {
  return {
    col: Math.floor(actor.x / TILE),
    row: Math.floor((actor.y - MAZE_Y) / TILE),
  };
}

export function centerOf(col, row) {
  return { x: col * TILE + TILE / 2, y: MAZE_Y + row * TILE + TILE / 2 };
}

export function isReverse(a, b) {
  return a.x === -b.x && a.y === -b.y && (a.x !== 0 || a.y !== 0);
}

export function distSq(ax, ay, bx, by) {
  return (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
}

// Horizontal wrap through the tunnel (row 14). A little off-screen padding
// lets the sprite slide fully out one side before appearing on the other.
export function wrapTunnel(actor) {
  const min = -TILE, max = COLS * TILE + TILE;
  if (actor.x < min) actor.x = max;
  else if (actor.x > max) actor.x = min;
}

// Advance an actor `speed` px along its dir with grid rules:
//  - onTile(col,row) fires once whenever the actor enters a new tile
//  - chooseDir(col,row) fires once per tile at its center; returning a dir
//    changes course (the actor is snapped to the center line)
//  - canEnter(col,row) gates movement; blocked actors pin to the center
// Pac-Man's pre-turn cornering is handled by the caller via tryCorner.
export function stepActor(actor, speed, { canEnter, chooseDir, onTile }) {
  let remaining = speed;
  let guard = 8; // safety against infinite loops
  while (remaining > 0.0001 && guard-- > 0) {
    const { col, row } = tileOf(actor);
    const tileKey = `${col},${row}`;
    if (onTile && actor._tileKey !== tileKey) {
      actor._tileKey = tileKey;
      onTile(col, row);
    }

    const c = centerOf(col, row);
    const ahead = (c.x - actor.x) * actor.dir.x + (c.y - actor.y) * actor.dir.y;

    if (ahead > 0.0001) {
      // Approach (or land on) this tile's center.
      const move = Math.min(remaining, ahead);
      actor.x += actor.dir.x * move;
      actor.y += actor.dir.y * move;
      remaining -= move;
      if (remaining <= 0.0001) return;
    }

    // At or past the center: one decision per tile.
    if (chooseDir && actor._decidedKey !== tileKey) {
      actor._decidedKey = tileKey;
      const next = chooseDir(col, row);
      if (next && next !== actor.dir) {
        actor.dir = next;
        actor.x = c.x;
        actor.y = c.y;
      }
    }

    const nextCol = col + actor.dir.x;
    const nextRow = row + actor.dir.y;
    if (!canEnter(nextCol, nextRow)) {
      actor.x = c.x;
      actor.y = c.y;
      actor.blocked = true;
      return;
    }
    actor.blocked = false;

    // Move toward the next tile's center (loop re-enters for its decision).
    const move = Math.min(remaining, TILE);
    actor.x += actor.dir.x * move;
    actor.y += actor.dir.y * move;
    remaining -= move;
  }
}

// Reset per-tile memory (after teleports, respawns, reversals).
export function resetTileMemory(actor) {
  actor._tileKey = null;
  actor._decidedKey = null;
}

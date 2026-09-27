// Deterministic movement math shared by the sim worker, the WS server,
// HTTP routes and the browser. Pure: no DB, no Phaser, no timers.
//
// A `Move` is data: a tile path, a start time and a speed. The position
// of an entity at wall-clock time `t` is a pure function of that data,
// so every client renders the same motion at the same instant no matter
// when it received the move, and the server can answer "where is this
// NPC right now?" without anyone streaming positions.
//
// Beats: time is cut into epoch-aligned WORLD_TICK_MS slots. Moves are
// decided on beat k and start on beat k+1 (see constants.ts).

import { WORLD_TICK_MS } from "@/lib/constants";
import { CELL_PX, cellToWorldCenter, worldToCell } from "@/lib/nav/chunkIndex";
import type { Facing, GridPoint, Point } from "@/types/world";
import type { MotionSample, Move, MoverKind, MovingRow } from "@/types/motion";

const TILE = CELL_PX;

/** Centre of tile (tx, ty) in world pixels. Entities rest on tile centres. */
export const tileCenter: (t: GridPoint) => Point = cellToWorldCenter;

/** Tile containing world pixel (x, y). */
export function tileOf(x: number, y: number): GridPoint {
  return worldToCell({ x, y });
}

function facingOfDelta(dx: number, dy: number): Facing {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

/** Total path length in whole tiles. */
export function pathTiles(path: readonly GridPoint[]): number {
  let n = 0;
  for (let i = 1; i < path.length; i++) {
    n += Math.abs(path[i].tx - path[i - 1].tx) + Math.abs(path[i].ty - path[i - 1].ty);
  }
  return n;
}

/** Duration of a move in ms. */
export function moveDurationMs(move: Move): number {
  if (move.speed <= 0) return 0;
  return (pathTiles(move.path) * TILE * 1000) / move.speed;
}

/** Epoch ms when the move ends. */
export function moveEndAt(move: Move): number {
  return move.startAt + moveDurationMs(move);
}

/** Final tile of a move. */
export function moveDestination(move: Move): GridPoint {
  return move.path[move.path.length - 1];
}

/**
 * Where the entity is at time `t`. Before `startAt` it stands on the
 * origin tile facing its first leg; after the end it stands on the
 * destination facing its last leg.
 */
export function positionAt(move: Move, t: number): MotionSample {
  const path = move.path;
  const origin = tileCenter(path[0]);
  if (path.length < 2) return { ...origin, facing: "down", moving: false };

  let remaining = ((t - move.startAt) / 1000) * move.speed; // px travelled
  const firstLeg = tileCenter(path[1]);
  if (remaining <= 0) {
    return { ...origin, facing: facingOfDelta(firstLeg.x - origin.x, firstLeg.y - origin.y), moving: false };
  }
  for (let i = 1; i < path.length; i++) {
    const a = tileCenter(path[i - 1]);
    const b = tileCenter(path[i]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.abs(dx) + Math.abs(dy); // legs are axis-aligned
    const facing = facingOfDelta(dx, dy);
    if (remaining < len) {
      const f = remaining / len;
      return { x: a.x + dx * f, y: a.y + dy * f, facing, moving: true };
    }
    remaining -= len;
    if (i === path.length - 1) return { ...b, facing, moving: false };
  }
  // Unreachable: the loop always returns on the last leg.
  return { ...tileCenter(path[path.length - 1]), facing: "down", moving: false };
}

/** Rebuild a `Move` from DB columns, or null when the row has none. */
export function moveOfRow(row: MovingRow): Move | null {
  if (!row.movePath || row.movePath.length < 2 || row.moveStartAt == null || row.moveSpeed == null) return null;
  return { path: row.movePath, startAt: Number(row.moveStartAt), speed: row.moveSpeed };
}

/** Where a DB row's entity is at time `t` (its resting x/y if it has no move). */
export function rowPositionAt(row: MovingRow, t: number): Point {
  const move = moveOfRow(row);
  if (!move) return { x: row.x, y: row.y };
  const p = positionAt(move, t);
  return { x: p.x, y: p.y };
}

/**
 * Collapse a list of 4-connected tile steps (or world-pixel cell
 * centres from the A* planner) into axis-aligned legs: only the corner
 * points are kept. Consecutive duplicates are dropped.
 */
export function compressToLegs(tiles: readonly GridPoint[]): GridPoint[] {
  const out: GridPoint[] = [];
  for (const t of tiles) {
    const last = out[out.length - 1];
    if (last && last.tx === t.tx && last.ty === t.ty) continue;
    if (out.length >= 2) {
      const prev = out[out.length - 2];
      const sameX = prev.tx === last.tx && last.tx === t.tx;
      const sameY = prev.ty === last.ty && last.ty === t.ty;
      if (sameX || sameY) {
        out[out.length - 1] = t;
        continue;
      }
    }
    out.push(t);
  }
  return out;
}

// ── Beats ───────────────────────────────────────────────────────────────

/** Index of the beat containing `t`. */
export function beatIndex(t: number, beatMs = WORLD_TICK_MS): number {
  return Math.floor(t / beatMs);
}

/** Epoch ms of the first beat boundary strictly after `t`. */
export function nextBeatAt(t: number, beatMs = WORLD_TICK_MS): number {
  return (beatIndex(t, beatMs) + 1) * beatMs;
}

/** Epoch ms of the start of the beat containing `t`. */
export function beatStartAt(t: number, beatMs = WORLD_TICK_MS): number {
  return beatIndex(t, beatMs) * beatMs;
}

/**
 * Stable per-entity phase in [0, beatsPerInterval). FNV-1a over the
 * kind + id so NPC 3 and animal 3 land on different beats.
 */
export function entityPhase(kind: MoverKind, id: number, beatsPerInterval: number): number {
  let h = 0x811c9dc5;
  const s = `${kind}:${id}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % Math.max(1, beatsPerInterval);
}

/**
 * True when entity (kind, id) should pick a new move on beat `beat`.
 * Each entity is due exactly once every `intervalMs`, staggered by its
 * phase so a different subset moves on each beat.
 */
export function isDue(kind: MoverKind, id: number, beat: number, intervalMs: number, beatMs = WORLD_TICK_MS): boolean {
  const n = Math.max(1, Math.round(intervalMs / beatMs));
  const phase = entityPhase(kind, id, n);
  return (((beat - phase) % n) + n) % n === 0;
}

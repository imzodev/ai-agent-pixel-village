// Skill-based combat rules: where an attack lands, and whether a player
// dodged it. Enemy attacks are data with timestamps, like
// moves (src/lib/motion.ts): the WS server plans a strike, every client
// draws its telegraph from the same clock, and the server resolves it at
// `hitAt` against the players' live positions. Pure.

import type { StrikeShape } from "@/types/combat";
import type { Facing, Point } from "@/types/world";

const DIR: Readonly<Record<Facing, readonly [number, number]>> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
export const dirVec = (f: Facing): readonly [number, number] => DIR[f];

/** The cardinal direction from `a` towards `b` (attacks read in four directions). */
export function cardinalTo(a: Point, b: Point): Facing {
  const dx = b.x - a.x, dy = b.y - a.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "down" : "up";
}

/** Does an attack of `shape` at `origin` pointing `dir` cover point `p`? (A small body radius is allowed.) */
export function inShape(shape: StrikeShape, origin: Point, dir: Facing, p: Point, body = 6): boolean {
  const dx = p.x - origin.x, dy = p.y - origin.y;
  const [fx, fy] = DIR[dir];
  switch (shape.type) {
    case "circle":
      return Math.hypot(dx, dy) <= shape.r + body;
    case "cone": {
      const d = Math.hypot(dx, dy);
      if (d > shape.r + body) return false;
      if (d <= body) return true;
      const cos = (dx * fx + dy * fy) / d;
      return cos >= Math.cos(shape.half);
    }
    case "line": {
      const along = dx * fx + dy * fy, across = Math.abs(dx * -fy + dy * fx);
      return along >= -body && along <= shape.length + body && across <= shape.width / 2 + body;
    }
  }
}

// ── Chip damage ──────────────────────────────────────────────────────────
/** Standing in a telegraph hurts a little while it fills: this often… */
export const CHIP_EVERY_MS = 450;
/** …for this share of the full hit, and never less than CHIP_MIN. */
export const CHIP_FRAC = 0.2;
export const CHIP_MIN = 2;
export const chipDamage = (dmg: number): number => Math.max(CHIP_MIN, Math.round(dmg * CHIP_FRAC));

// ── Dodging ──────────────────────────────────────────────────────────────
/** A roll's invulnerable window, its length (px) and how long the dash takes. */
export const ROLL_IFRAMES_MS = 320;
export const ROLL_PX = 48;
export const ROLL_MS = 220;
/** The least time between two rolls (so they can't be chained forever). */
export const ROLL_COOLDOWN_MS = 800;
/** A roll reported this long ago (network delay) still counts. */
export const ROLL_LATE_MS = 250;

/** Can a player who last rolled at `last` roll again at `now`? */
export const canRoll = (last: number | undefined, now: number): boolean => last == null || now - last >= ROLL_COOLDOWN_MS;

/** Was `t` inside any dodge window (each a roll's start time)? */
export function dodged(rolls: readonly number[], t: number): boolean {
  return rolls.some((r) => t >= r && t <= r + ROLL_IFRAMES_MS);
}

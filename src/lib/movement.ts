// Shared movement primitives used by both the client (WorldScene player
// movement) and the server (NPC / animal / enemy ticks). Kept dependency-
// free so it can be imported from either side without dragging in `db`.
//
// Types live in @/types/world; this module is logic only.

import type { Facing, StepResult, WalkableChecker } from "@/types/world";

export function facingOf(dx: number, dy: number): Facing {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

/**
 * Axis-separated step that respects chunk collision: try the full diagonal
 * move, then x-only and y-only, sliding along obstacles instead of getting
 * stuck. Mirrors the player's WorldScene.updatePlayer movement so NPCs and
 * animals behave like the player around corners.
 *
 * `isWalkable` is injectable so the server (which needs to lazy-load
 * surrounding chunks before checking) and the client (which already has
 * chunks registered) can share the same step function.
 */
export async function stepTowardWalkable(
  x: number,
  y: number,
  tx: number,
  ty: number,
  dist: number,
  isWalkable: WalkableChecker,
): Promise<StepResult> {
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.hypot(dx, dy);
  const facing = facingOf(dx, dy);

  if (d === 0) return { x, y, arrived: true, facing, stuck: false };
  const step = Math.min(dist, d);
  const ux = dx / d;
  const uy = dy / d;
  const nx = x + ux * step;
  const ny = y + uy * step;

  if (d <= step) return { x: tx, y: ty, arrived: true, facing, stuck: false };

  if (await isWalkable(nx, ny)) return { x: nx, y: ny, arrived: false, facing, stuck: false };

  const xOpen = await isWalkable(nx, y);
  const yOpen = await isWalkable(x, ny);
  if (xOpen && yOpen) {
    // Both axes open — pick whichever has the larger component for natural
    // sliding around corners.
    return Math.abs(ux) >= Math.abs(uy)
      ? { x: nx, y, arrived: false, facing, stuck: false }
      : { x, y: ny, arrived: false, facing, stuck: false };
  }
  if (xOpen) return { x: nx, y, arrived: false, facing, stuck: false };
  if (yOpen) return { x, y: ny, arrived: false, facing, stuck: false };
  return { x, y, arrived: false, facing, stuck: true };
}
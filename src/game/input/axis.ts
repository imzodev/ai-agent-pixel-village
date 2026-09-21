// Pure axis math for keyboard / d-pad movement. No DOM, no Phaser — easy
// to unit-test in the node environment.

import type { CommandId } from "@/types/input";

/** Convert the currently-held movement commands into a normalized axis. */
export function axisFromHeld(held: ReadonlySet<CommandId>): { x: number; y: number } {
  let x = 0;
  let y = 0;
  if (held.has("move.left")) x -= 1;
  if (held.has("move.right")) x += 1;
  if (held.has("move.up")) y -= 1;
  if (held.has("move.down")) y += 1;
  // Snap to dominant axis so WASD stays cardinal-only (matches the
  // existing facing logic in the scene).
  if (x !== 0 && y !== 0) {
    if (Math.abs(x) > Math.abs(y)) y = 0;
    else x = 0;
  }
  return { x, y };
}

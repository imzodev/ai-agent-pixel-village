// What E acts on: the nearest usable thing in front of you (within about
// 60° of where you face), or anything right underfoot. Never something
// beside or behind you — in a wood that used to mean chopping the tree at
// your back. Pure; the scene builds the candidates (src/game/WorldScene.ts).

import type { InteractCandidate } from "@/types/game";
import type { Facing } from "@/types/world";

/** How far E reaches. */
export const REACH_PX = 110;
/** Closer than this counts whichever way you face (an item at your feet). */
export const TOUCH_PX = 18;
/** How far off your facing still counts as "in front" (cos 60°). */
export const FRONT_COS = 0.5;

const DIR: Readonly<Record<Facing, readonly [number, number]>> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

export function pickTarget<S>(cands: readonly InteractCandidate<S>[], player: { x: number; y: number }, facing: Facing): S | null {
  const [fx, fy] = DIR[facing];
  let best: S | null = null, bestD = Infinity;
  for (const c of cands) {
    const dx = c.x - player.x, dy = c.y - player.y, d = Math.hypot(dx, dy);
    if (d >= REACH_PX || d >= bestD) continue;
    const inFront = d > 0 && (dx * fx + dy * fy) / d >= FRONT_COS;
    if (d <= TOUCH_PX || inFront) { best = c.sel; bestD = d; }
  }
  return best;
}

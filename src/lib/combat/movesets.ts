// What each enemy kind does in a fight: one to three attacks with a
// readable wind-up. Tougher kinds and elites telegraph for less time.
// Pure; the WS server plans strikes from these (src/lib/world-stream.ts).

import { cardinalTo } from "./strikes";
import type { MoveDef, Strike } from "@/types/combat";
import type { Point } from "@/types/world";

const T = 16;

export const MOVESETS: Readonly<Record<string, readonly MoveDef[]>> = {
  wolf: [{ name: "lunge", shape: { type: "line", length: 4 * T, width: 18 }, trigger: 70, windupMs: 650, cooldownMs: 1800, dmgMult: 1, dash: 4 }],
  frostwolf: [{ name: "frost lunge", shape: { type: "line", length: 4 * T, width: 18 }, trigger: 70, windupMs: 600, cooldownMs: 1800, dmgMult: 1, dash: 4, status: { kind: "slow", ms: 2200 } }],
  boar: [
    { name: "charge", shape: { type: "line", length: 7 * T, width: 22 }, trigger: 110, windupMs: 1000, cooldownMs: 3400, dmgMult: 1.5, dash: 7 },
    { name: "gore", shape: { type: "cone", r: 34, half: 0.8 }, trigger: 32, windupMs: 450, cooldownMs: 1500, dmgMult: 1 },
  ],
  scorpion: [{ name: "tail jab", shape: { type: "cone", r: 42, half: 0.5 }, trigger: 40, windupMs: 520, cooldownMs: 1500, dmgMult: 1, status: { kind: "poison", ms: 3000 } }],
  lurker: [{ name: "slam", shape: { type: "circle", r: 46 }, trigger: 44, windupMs: 1100, cooldownMs: 2600, dmgMult: 1.8 }],
  shade: [
    { name: "shadow bolt", shape: { type: "circle", r: 16 }, trigger: 150, windupMs: 700, cooldownMs: 2200, dmgMult: 1, projectile: 220, atTarget: true },
    { name: "chill touch", shape: { type: "cone", r: 30, half: 0.9 }, trigger: 28, windupMs: 500, cooldownMs: 1500, dmgMult: 0.8 },
  ],
  wisp: [{ name: "wisp bolt", shape: { type: "circle", r: 16 }, trigger: 150, windupMs: 650, cooldownMs: 2000, dmgMult: 1, projectile: 240, atTarget: true }],
  thornling: [{ name: "thorn burst", shape: { type: "circle", r: 40 }, trigger: 38, windupMs: 800, cooldownMs: 2400, dmgMult: 1.2 }],
  bat: [{ name: "swoop", shape: { type: "line", length: 3 * T, width: 14 }, trigger: 50, windupMs: 450, cooldownMs: 1600, dmgMult: 1, dash: 3 }],
  rootking: [
    { name: "root spikes", shape: { type: "circle", r: 24 }, trigger: 180, windupMs: 1100, cooldownMs: 3000, dmgMult: 1.2, atTarget: true },
    { name: "sweep", shape: { type: "cone", r: 120, half: 0.7 }, trigger: 120, windupMs: 900, cooldownMs: 2600, dmgMult: 1.5 },
    { name: "ring slam", shape: { type: "circle", r: 100 }, trigger: 90, windupMs: 1500, cooldownMs: 5000, dmgMult: 2 },
  ],
};

/** Tougher fights telegraph for less time: −20% at tier 2, −30% beyond (and elites −20% more). */
export function speedScale(tier: number, elite: boolean): number {
  return (tier >= 3 ? 0.7 : tier >= 2 ? 0.8 : 1) * (elite ? 0.8 : 1);
}

/** The moves usable against a target `dist` px away. */
export const usableMoves = (kind: string, dist: number): readonly MoveDef[] => (MOVESETS[kind] ?? []).filter((m) => dist <= m.trigger);

/**
 * Plan one strike by an enemy at `at` against a target at `target`:
 * telegraph from `now`, landing after the (scaled) wind-up. Lunges get their
 * timing here; the server adds the actual dash path (walls stop it).
 */
export function planStrike(o: {
  id: number; enemyId: number; kind: string; move: MoveDef; at: Point; target: Point; now: number; baseDmg: number; scale: number;
}): Strike {
  const m = o.move;
  const dir = cardinalTo(o.at, o.target);
  const windup = Math.round(m.windupMs * o.scale);
  const releaseAt = o.now + windup;
  const origin = m.atTarget ? { ...o.target } : { ...o.at };
  let hitAt = releaseAt;
  if (m.projectile) hitAt = releaseAt + Math.round((Math.hypot(o.target.x - o.at.x, o.target.y - o.at.y) / m.projectile) * 1000);
  if (m.dash) hitAt = releaseAt + Math.round(((m.dash * T) / DASH_SPEED) * 1000);
  return {
    id: o.id, enemyId: o.enemyId, move: m.name, shape: m.shape, origin, dir,
    windupAt: o.now, releaseAt, hitAt, dmg: Math.max(1, Math.round(o.baseDmg * m.dmgMult)),
    ...(m.projectile ? { from: { ...o.at } } : {}),
    ...(m.status ? { status: m.status } : {}),
  };
}

/** How fast lunges and charges travel (px/s). */
export const DASH_SPEED = 300;

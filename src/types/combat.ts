// Skill-based combat (src/lib/combat/*). Types only.

import type { Move } from "@/types/motion";
import type { Facing, Point } from "@/types/world";

/** The area an attack hits, around its origin, pointing `dir`. */
export type StrikeShape =
  | { type: "circle"; r: number }
  /** A wedge: `half` is the half-angle in radians. */
  | { type: "cone"; r: number; half: number }
  /** A straight band starting at the origin. */
  | { type: "line"; length: number; width: number };

export type StatusKind = "slow" | "poison";
export type StatusEffect = { kind: StatusKind; ms: number };

/** One attack an enemy kind knows. */
export type MoveDef = {
  name: string;
  shape: StrikeShape;
  /** Used when the target is this close (px). */
  trigger: number;
  /** How long the telegraph shows before it lands (or the lunge / bolt starts). */
  windupMs: number;
  cooldownMs: number;
  /** × the kind's base hit. */
  dmgMult: number;
  /** Lunge / charge this many tiles along `dir` after the wind-up. */
  dash?: number;
  /** A bolt flying at this speed (px/s) to where the target stood. */
  projectile?: number;
  /** Centre the shape on the target (spikes, bolts) instead of the enemy. */
  atTarget?: boolean;
  status?: StatusEffect;
};

/** An attack under way: announced at once, resolved at `hitAt` against live positions. */
export type Strike = {
  id: number;
  enemyId: number;
  move: string;
  shape: StrikeShape;
  origin: Point;
  dir: Facing;
  windupAt: number;
  /** When the telegraph ends: the hit, the lunge's start, or the bolt's launch. */
  releaseAt: number;
  hitAt: number;
  dmg: number;
  /** A bolt: it flies from here to `origin` between releaseAt and hitAt. */
  from?: Point;
  /** A lunge or charge: the enemy's move (clients play it at once). */
  dash?: Move;
  status?: StatusEffect;
};

/** An enemy row as the combat clock caches it (src/lib/world-stream.ts). */
export type CombatEnemy = typeof import("@/db/schema").enemies.$inferSelect;

/** The WS server's fight state (in memory; shared with the API routes). */
export type CombatState = {
  /** Strikes under way, with their resolve timers. */
  strikes: Map<number, Strike & { timer: ReturnType<typeof setTimeout> | null; /** Last chip of damage dealt during the wind-up. */ chipAt?: number }>;
  /** An enemy can't start another attack before this (ms). */
  busyUntil: Map<number, number>;
  /** Aggressive enemies by id: read in full every resync (30 s), kept
   *  current in between from spawns, the beat's moves, dashes and kills. */
  rows: Map<number, CombatEnemy>;
  rowsAt: number;
  /** When an enemy about to strike was last confirmed alive in the DB. */
  verifiedAt: Map<number, number>;
  nextId: number;
  /** Each player's recent rolls (start times; the latest sets the cooldown). */
  rolls: Map<number, number[]>;
  timer: ReturnType<typeof setInterval> | null;
};

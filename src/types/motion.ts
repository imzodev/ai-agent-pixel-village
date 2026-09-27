// Deterministic, beat-synced movement. Types only — no logic.
//
// The server never streams positions for NPCs / animals / enemies. It
// decides a `Move` once, stores it, and everyone (server range checks,
// every client) derives the exact position at any instant from
// `positionAt(move, t)` in `src/lib/motion.ts`.

import type { Facing, GridPoint, Point } from "@/types/world";

/** Which table / snapshot list a moving entity belongs to. */
export type MoverKind = "npc" | "animal" | "enemy";

/** Cardinal direction of a wander move. N = up (y decreases). */
export type CardinalDir = "N" | "S" | "E" | "W";

/**
 * A scheduled move. `path[0]` is the origin tile; each following point
 * differs from the previous one on exactly ONE axis (an axis-aligned
 * leg). A wander move has exactly two points; a goal move (fox raid,
 * remote agent) may have many.
 */
export type Move = {
  path: GridPoint[];
  /** Epoch ms (server clock) when the entity leaves `path[0]`. */
  startAt: number;
  /** World pixels per second along the path. */
  speed: number;
};

/** What `positionAt` returns: where the entity is and how to draw it. */
export type MotionSample = Point & {
  facing: Facing;
  /** True while strictly between `startAt` and the end of the path. */
  moving: boolean;
};

/**
 * Rectangle, in TILE coordinates (inclusive), an entity should stay in.
 * A step that leaves it is only allowed when it brings the entity
 * closer (so an entity spawned outside can walk back in).
 */
export type TileLeash = { minTx: number; maxTx: number; minTy: number; maxTy: number };

/** Bounds + chooser for `pickWanderMove`. `rng` returns [0, 1). */
export type WanderOptions = {
  minTiles: number;
  maxTiles: number;
  leash: TileLeash | null;
  rng?: () => number;
};

/** One candidate / result of `pickWanderMove`. */
export type WanderPick = { dir: CardinalDir; tiles: number; to: GridPoint };

/** A move scheduled this beat, as broadcast to WS clients. */
export type ScheduledMove = {
  kind: MoverKind;
  id: number;
  /** Resting position once the move completes (= row x/y). */
  x: number;
  y: number;
  move: Move;
};

/** A pending DB write for one entity's new move (batched per table). */
export type MoveWrite = {
  id: number;
  x: number;
  y: number;
  facing: Facing;
  move: Move;
};

/** Minimal row shape needed to know where an entity is right now. */
export type MovingRow = {
  x: number;
  y: number;
  movePath: GridPoint[] | null;
  moveStartAt: number | null;
  moveSpeed: number | null;
};

/** Parsed env-overridable movement interval. */
export type IntervalConfig = { ms: number; warning: string | null };

/** A ground egg the raiding fox may target. */
export type EggCandidate = { id: number; x: number; y: number };

/** The beat a sim tick runs on. */
export type TickBeat = {
  /** Beat index (`floor(now / WORLD_TICK_MS)`). */
  index: number;
  /** Wall-clock ms the tick started. */
  nowMs: number;
  /** Epoch ms of the next beat — moves scheduled this tick start here. */
  startAt: number;
};

/** A WS peer as seen by the move fan-out planner. */
export type FanoutPeer = { x: number; y: number; backedUp: boolean };

/** One serialise-once group: every peer gets the same `moves` payload. */
export type FanoutBucket<P> = { peers: P[]; moves: ScheduledMove[] };

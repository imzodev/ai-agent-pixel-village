// Shared world / game-domain primitives. Types only — no logic.
//
// `Facing` is the single canonical declaration: it used to be duplicated
// in lib/protocol.ts, lib/movement.ts, and types/input.ts. Everything
// imports it from here.

export type Facing = "up" | "down" | "left" | "right";

export type Point = { x: number; y: number };

/** Tile-grid coordinates. Centered cell semantics: cell (0,0) spans world px 0..CELL_PX. */
export type GridPoint = { tx: number; ty: number };

export type StepResult = Point & {
  arrived: boolean;
  facing: Facing;
  /**
   * True when the step couldn't make any forward progress (diagonal and
   * both single-axis alternatives blocked). Callers use this to abandon a
   * pinned target and re-roll a walkable destination.
   */
  stuck: boolean;
};

export type WalkableChecker = (x: number, y: number) => Promise<boolean> | boolean;

/**
 * A planned route through the world. Waypoints are pixel coordinates so
 * the path-follower doesn't have to convert back; `cost` is tile count and
 * is best-effort (capped searches may understate it).
 */
export type WalkPath = {
  waypoints: Point[];
  cost: number;
};

export type NavResult = { path: WalkPath } | null;

/**
 * DIP contract for the navigation planner. Sim depends on this interface,
 * not on a concrete class, so a nav-mesh implementation is drop-in later.
 *
 * `invalidate(id)` lets callers drop a cached plan when their move target
 * changes (NPC re-targets, fox raid interrupts, etc.) without reaching
 * into the cache directly.
 */
export interface Navigator {
  plan(from: Point, to: Point, opts?: NavOptions): Promise<NavResult>;
  invalidate(id: number): void;
}

export type NavOptions = { maxTiles?: number };

/**
 * Server-computed behaviour label for an NPC. Surfaced in the wire as a
 * small icon over the sprite so players can read what the NPC is up to
 * (resting, paused to face the player, walking, etc.).
 */
export type NpcState = "idle" | "walking" | "resting" | "facing_player" | "chatting";

// What the player has clicked/hovered in the world. Rendered by the HUD
// as the inspect card and consumed by the scene for interaction prompts.
export type Selection =
  | { type: "player"; id: number; name: string; distance: number }
  | { type: "npc"; id: number; name: string; role: string; sponsored: boolean; distance: number }
  | { type: "animal"; id: number; name: string; species: string; distance: number }
  | { type: "enemy"; id: number; kind: string; hp: number; maxHp: number; distance: number }
  | { type: "item"; id: number; itemKey: string; distance: number }
  | {
      type: "node";
      id: number;
      kind: string;
      /** Current regrowth stage. 0 = picked/empty; (stages-1) = fully grown. */
      stage: number;
      /** Total visual stages for this kind. */
      stages: number;
      distance: number;
    }
  | {
      type: "building";
      id: number;
      key: string;
      name: string;
      reservable: boolean;
      hasSponsor: boolean;
      distance: number;
    };

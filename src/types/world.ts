// Shared world / game-domain primitives. Types only — no logic.
//
// `Facing` is the single canonical declaration: it used to be duplicated
// in lib/protocol.ts, lib/movement.ts, and types/input.ts. Everything
// imports it from here.

export type Facing = "up" | "down" | "left" | "right";

export type Point = { x: number; y: number };

/**
 * Tile-grid coordinates. Cell (0, 0) spans world pixels (0..CELL_PX) —
 * `CELL_PX` aliases the chunk tile size so the planner's per-cell
 * walkability check aligns with the production `isWalkableAt`
 * foot-box check. Used by `src/lib/nav/`.
 */
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
    }
  // An empty garden plot (a crop in it is selected as its `node` instead).
  | { type: "plot"; lotKey: string; plot: number; x: number; y: number; distance: number };

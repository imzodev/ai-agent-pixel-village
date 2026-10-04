// A* planner shapes (src/lib/nav/navigator.ts). Types only — no logic.

import type { GridPoint, Point } from "@/types/world";

/** Plan input options. */
export type PlanOptions = {
  /**
   * Cap the number of waypoints returned (excluding the start). When
   * the planner finds a longer path, it returns null instead. Default 80
   * (~80 cells of detour — enough to route around any in-chunk
   * obstacle at the current world scale).
   */
  maxTiles?: number;
};

/** Result of a successful plan. The first waypoint equals `from`. */
export type PlanPath = {
  waypoints: Point[];
  /** Sum of edge costs (each step costs 1 cell). */
  cost: number;
};

/** A* open-set entry (internal to the planner). */
export type PlanNode = {
  key: number;
  tx: number;
  ty: number;
  g: number;
  f: number;
  parent: number;
};

// ── Route planning (src/lib/nav/route.ts and friends) ────────────────────

/**
 * The world as the router sees it: whether an NPC fits on a tile, and what
 * it costs to walk there (10 = open ground; roads are cheaper). Tiles of a
 * block that isn't loaded read as not walkable. Blocks are BLOCK_W×BLOCK_H
 * tiles (the game's chunks); `ensureBlock` loads one before it's searched.
 */
export type NavGrid = {
  walkable(tx: number, ty: number): boolean;
  /** Tenths: 10 open ground, 6 a road. */
  cost(tx: number, ty: number): number;
  ensureBlock(bx: number, by: number): Promise<void>;
};

/** A cell of a block's border where routes may cross into the next block. */
export type Entrance = { tx: number; ty: number };

/** A block's part of the route graph: its entrances and what it costs to cross between them. */
export type BlockGraph = { entrances: Entrance[]; edges: Map<number, { to: number; cost: number }[]> };

/** A planned route: every tile in order, and the same as straight legs (for moves). */
export type Route = { tiles: GridPoint[]; legs: GridPoint[]; cost: number };

/** Search bounds (inclusive tiles), so a search can be kept inside a block. */
export type Bounds = { tx0: number; ty0: number; tx1: number; ty1: number };

/** One block of the real world's nav grid: walkable flags and step costs, per tile. */
export type NavBlock = { walk: Uint8Array; cost: Uint8Array; at: number };

/** Somewhere to keep block graphs between runs (the world router uses .cache/nav). */
export type GraphStore = {
  load(bx: number, by: number): Promise<BlockGraph | null>;
  save(bx: number, by: number, g: BlockGraph): Promise<void>;
};

/** A named spot NPCs can know about and travel to (src/lib/nav/places.ts). */
export type Place = { key: string; name: string; kind: string; x: number; y: number };

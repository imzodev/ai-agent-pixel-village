// A* planner shapes (src/lib/nav/navigator.ts). Types only — no logic.

import type { Point } from "@/types/world";

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

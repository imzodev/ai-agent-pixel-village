// Harvest Haul, the stacking minigame (src/lib/haul/): the produce, the road,
// the rigid bodies and a run's state. Types only.

export type HaulItemKey =
  | "pumpkin" | "cabbage" | "watermelon" | "cheese" | "eggs"
  | "hay" | "crate" | "flour" | "churn" | "cake";

/** A box (half sizes) or a circle (radius). */
export type HaulShape = { kind: "box"; hw: number; hh: number } | { kind: "circle"; r: number };

export type HaulItemDef = {
  key: HaulItemKey;
  name: string;
  icon: string;
  shape: HaulShape;
  /** Mass per unit of area (heavier items push harder). */
  density: number;
  friction: number;
  /** What it's worth delivered whole. */
  value: number;
  /** Breaks when it hits anything faster than this (units a second); none if absent. */
  breakSpeed?: number;
};

/** The road: heights every ROAD_STEP units from x = 0, y growing downwards. */
export type HaulRoad = { heights: number[]; length: number };

/** One day's run: the produce in order, and the road to market. */
export type HaulCourse = {
  day: string;
  number: number;
  seed: number;
  items: HaulItemKey[];
  road: HaulRoad;
};

/** A rigid body. Rotation is a unit pair (c, s): no angles, so no trig. */
export type HaulBody = {
  id: number;
  x: number; y: number;
  c: number; s: number;
  vx: number; vy: number; w: number;
  invMass: number; invI: number;
  friction: number;
  shape: HaulShape;
  /** -1 for the cart's parts; else the item's index in the course. */
  item: number;
};

export type HaulContact = {
  x: number; y: number;
  nx: number; ny: number;
  separation: number;
  /** Accumulated normal and tangent impulses (kept across ticks to warm-start). */
  pn: number; pt: number;
  massNormal: number; massTangent: number;
  bias: number;
  /** Which edges made it, so the same contact is matched next tick. */
  feature: number;
};

/** A touching pair of bodies (indices into the bodies, a < b). */
export type HaulArbiter = { a: number; b: number; contacts: HaulContact[]; friction: number };

export type HaulItemStatus = "waiting" | "placed" | "lost";

export type HaulPhase = "stack" | "settle" | "drive" | "arrive" | "done";

export type HaulState = {
  tick: number;
  phase: HaulPhase;
  /** When the current phase started. */
  phaseAt: number;
  bodies: HaulBody[];
  arbiters: HaulArbiter[];
  /** Per course item: where it is, and whether it broke. */
  status: HaulItemStatus[];
  broken: boolean[];
  /** The next item to drop (course index), and when it can be dropped. */
  next: number;
  readyAt: number;
  /** The cart: distance along the road, speed, and how far it leans (-1…1). */
  dist: number;
  speed: number;
  lean: number;
  /** What the player holds: -1, 0 or 1. */
  leanInput: number;
  done: boolean;
};

/** A drop (x across the cart, r quarter turns), "go" (start driving now), or a lean. */
export type HaulInput =
  | { t: number; k: "drop"; x: number; r: number }
  | { t: number; k: "go" }
  | { t: number; k: "lean"; v: number };

export type HaulDetail = { delivered: number; broken: number; lost: number };

/** The view's top-left corner, in world units (src/components/haul/draw.ts). */
export type HaulCamera = { x: number; y: number };
/** A body's place and turn last tick, to draw in between ticks. */
export type HaulPose = { x: number; y: number; c: number; s: number };
/** A word shown where something happened ("crack!"), for a moment. */
export type HaulFx = { x: number; y: number; text: string; color: string; at: number };

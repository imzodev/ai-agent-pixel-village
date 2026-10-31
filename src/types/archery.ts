// Pip's Archery Butts, the arcade's shooting game (src/lib/archery/). Types only.

/** A post stands still; a hoist rides a rope up and down; a cart rolls back and forth along the range; the King's butt (weekends) is far and pays double. */
export type ArcheryTargetKind = "post" | "hoist" | "cart" | "king";

/**
 * A butt on the day's range. Its face is upright, `RING_OUTER` either side of
 * its centre. Moving ones go from (x0, y0) to (x1, y1) and back over `period`
 * ticks, linearly (a triangle wave), starting `phase` ticks in.
 */
export type ArcheryTarget = {
  kind: ArcheryTargetKind;
  /** Where it stands along the range, in metres from the archer. */
  x0: number;
  x1: number;
  /** The face's centre, in metres above the ground. */
  y0: number;
  y1: number;
  period: number;
  phase: number;
  /** Ring points are multiplied by this (further and harder pays more). */
  worth: number;
};

/** The golden apple on the scarecrow's hat: there for a while, worth a bonus once. */
export type ArcheryApple = { x: number; y: number; from: number; to: number };

export type ArcheryCourse = {
  day: string;
  number: number;
  seed: number;
  targets: ArcheryTarget[];
  /** The scarecrow stands here (the apple sits on its hat). */
  scarecrowX: number;
  apple: ArcheryApple;
  /** The day's wind, −4 (towards the archer) to 4 (down the range), one per WIND_SEG_TICKS. */
  wind: number[];
};

export type ArcheryRing = "bull" | "inner" | "outer";

export type ArcheryArrow = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** The tick it was loosed. */
  at: number;
  state: "fly" | "stuck" | "ground" | "gone" | "apple";
  /** stuck: which target, and how far from the face's centre (it rides along). */
  target: number;
  dy: number;
};

export type ArcheryEventKind = "loose" | "bull" | "inner" | "outer" | "apple" | "miss";

export type ArcheryEvent = {
  k: ArcheryEventKind;
  at: number;
  /** The arrow's index (in loosing order). */
  arrow: number;
  target?: number;
  points?: number;
  /** The run of hits this one made (×1…×CHAIN_MAX). */
  chain?: number;
};

export type ArcheryState = {
  tick: number;
  arrows: ArcheryArrow[];
  /** Arrows still in the quiver. */
  quiver: number;
  /** The next arrow is on the string from this tick. */
  nockAt: number;
  points: number;
  hits: number;
  bulls: number;
  apple: boolean;
  chain: number;
  bestChain: number;
  /** The tick the last arrow came down (for the time bonus). */
  lastLand: number;
  log: ArcheryEvent[];
  done: boolean;
};

/** A pull of the bowstring: forward and up, in draw units (dx² + dy² ≤ MAX_DRAW²). */
export type ArcheryInput = { t: number; k: "loose"; dx: number; dy: number };

export type ArcheryDetail = { hits: number; bulls: number; apple: number; arrows: number; chain: number };

/** Words that float up where something happened. */
export type ArcheryFx = { x: number; y: number; text: string; color: string; at: number; big?: boolean };

/** A puff of straw, a leaf, a splinter (drawing only). */
export type ArcheryParticle = {
  kind: "straw" | "dust" | "gold";
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  size: number;
  color: string;
};

// Fenwick's Orchard Catch, the arcade's catching game (src/lib/catch/). Types only.

/** Good fruit (apple, pear, plum, the golden pear) pays; a rotten apple costs; a wasp stings. */
export type CatchFruitKind = "apple" | "pear" | "plum" | "golden" | "rotten" | "wasp";

/** Fenwick shakes a tree: it rustles from `at`, and its fruit drops SHAKE_TICKS later. */
export type CatchShake = { at: number; tree: number };

/** A fruit leaving the branch: when, from where (1/16 px), its nudge sideways. */
export type CatchDrop = { at: number; tree: number; x: number; vx: number; kind: CatchFruitKind };

export type CatchCourse = {
  day: string;
  number: number;
  seed: number;
  /** The three trees' trunks, in px from the left. */
  trees: number[];
  shakes: CatchShake[];
  /** In the order they drop. */
  drops: CatchDrop[];
  /** The day's gusts, −3 (towards the press) to 3, one per WIND_SEG_TICKS. */
  wind: number[];
  /** Harvest day (weekends): more pears, and a tree shaken three times over. */
  weekend: boolean;
};

export type CatchFruit = {
  kind: CatchFruitKind;
  /** 1/16 px, and 1/16 px a tick. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: "fall" | "caught" | "ground" | "bounced";
  /** The tick it caught or landed. */
  at: number;
};

export type CatchEventKind = "catch" | "miss" | "bounce" | "rotten" | "sting" | "golden" | "press" | "shake";

export type CatchEvent = {
  k: CatchEventKind;
  at: number;
  /** The fruit (its index), or the tree for "shake". */
  i: number;
  points?: number;
  /** catch: the multiplier it was paid at; press: how many went in. */
  n?: number;
};

export type CatchState = {
  tick: number;
  /** The basket's middle and where it's heading, 1/16 px. */
  basketX: number;
  target: number;
  /** The basket can't move until this tick (stung). */
  stunUntil: number;
  /** Fruit in the basket (BASKET_CAP and it's full). */
  load: number;
  points: number;
  /** Good catches in a row (the multiplier grows every CHAIN_STEP). */
  streak: number;
  bestStreak: number;
  caught: number;
  missed: number;
  rotten: number;
  stings: number;
  golden: boolean;
  /** Fruit tipped into the press. */
  pressed: number;
  /** Every fruit dropped so far, in drop order. */
  fruit: CatchFruit[];
  /** The next drop / shake to come. */
  nextDrop: number;
  nextShake: number;
  log: CatchEvent[];
  done: boolean;
};

/** Steer the basket: its new target, in whole px. */
export type CatchInput = { t: number; k: "to"; x: number };

export type CatchDetail = { caught: number; missed: number; golden: number; stings: number; rotten: number; streak: number };

/** Words that float up where something happened. */
export type CatchFx = { x: number; y: number; text: string; color: string; at: number; big?: boolean };

/** Juice, a splinter of wasp, a leaf (drawing only). */
export type CatchParticle = { x: number; y: number; vx: number; vy: number; born: number; life: number; size: number; color: string };

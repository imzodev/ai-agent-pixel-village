// Marigold's Oven, the arcade's baking game (src/lib/oven/). Types only.

/** Marigold's goods (the world's item keys, src/lib/itemDefs.ts / orchard.ts). */
export type OvenGoodKey = "bread" | "honey_bun" | "apple_pie" | "cherry_pie" | "peach_pie";
export type OvenPieKey = "apple_pie" | "cherry_pie" | "peach_pie";

/** A good as the game bakes it: how long it takes, how long it stays golden, what it's worth. */
export type OvenGoodDef = {
  key: OvenGoodKey;
  name: string;
  icon: string;
  /** Ticks to golden in a normal oven. */
  bakeTicks: number;
  /** Ticks it stays golden before it burns. */
  goldenTicks: number;
  points: number;
  /** Its crust and filling colours (the field and the cards). */
  crust: string;
  fill: string;
};

/** A customer: when they come, what they want, how long they'll wait (ticks). */
export type OvenTicket = { at: number; items: OvenGoodKey[]; patience: number; rush?: true };

export type OvenCourse = {
  day: string;
  number: number;
  seed: number;
  /** The day's pie: with bread and buns, the three doughs. */
  pie: OvenPieKey;
  /** Each oven's heat in quarters: 4 normal, 5 the hot one (bakes and burns 1.25× as fast). */
  heat: number[];
  tickets: OvenTicket[];
};

/** What's in an oven: a good and when it went in, or nothing. */
export type OvenSlot = { item: OvenGoodKey; at: number } | null;

/** How a bake came out, as the screen tells it. */
export type OvenEventKind = "load" | "doughy" | "golden" | "perfect" | "burnt" | "arrive" | "served" | "left";
export type OvenEvent = { k: OvenEventKind; at: number; oven?: number; ticket?: number; good?: OvenGoodKey; points?: number };

export type OvenTicketStatus = "coming" | "open" | "served" | "left";

export type OvenTicketState = {
  status: OvenTicketStatus;
  /** Per item: the points it brings (0 while still wanted). */
  got: number[];
};

export type OvenState = {
  tick: number;
  ovens: OvenSlot[];
  tickets: OvenTicketState[];
  /** Golden goods nobody's asked for yet, oldest first: their points. */
  shelf: Record<OvenGoodKey, number[]>;
  points: number;
  served: number;
  perfect: number;
  spoiled: number;
  left: number;
  /** Everything that happened, in order (the screen reads what's new). */
  log: OvenEvent[];
  done: boolean;
};

/** Dough into an empty oven, or take out what's in one. */
export type OvenInput =
  | { t: number; k: "load"; oven: number; item: OvenGoodKey }
  | { t: number; k: "take"; oven: number };

export type OvenDetail = { served: number; perfect: number; spoiled: number; left: number };

/** A word shown where something happened ("perfect!"), for a moment. */
export type OvenFx = { x: number; y: number; text: string; color: string; at: number };

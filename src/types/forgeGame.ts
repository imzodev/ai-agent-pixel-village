// Bjorn's Forge, the arcade's smithing game (src/lib/forgeGame/). Types only.

/** The pieces Bjorn can forge (the world's item keys, src/lib/itemDefs.ts). */
export type ForgePieceKey = "axe" | "stone_sword" | "thorn_blade" | "wisp_blade" | "steel_sword" | "wyvernbone_blade";

export type ForgeFuelKey = "charcoal" | "coal" | "coke";
export type ForgeHammerKey = "stone" | "iron" | "tinker";
export type ForgeTongsKey = "short" | "long" | "quench";

/** What the smith picks before the fire is lit. */
export type ForgeLoadout = {
  fuel: ForgeFuelKey;
  hammer: ForgeHammerKey;
  tongs: ForgeTongsKey;
};

export type ForgePieceDef = {
  key: ForgePieceKey;
  name: string;
  icon: string;
  /** How many blows the commission needs at least. */
  strikes: number;
  /** The quality it needs to be finished. */
  quality: number;
  /** What a finished commission pays. */
  points: number;
  /** How fast it loses heat on the anvil, in heat units a tick. */
  coolRate: number;
  /** The width of its sweet band (around SWEET_MID), in heat units. */
  band: number;
  /** Its colour cold (the metal). */
  color: string;
  /** How it's drawn as it takes shape. */
  shape: "axe" | "blade";
};

export type ForgeFuelDef = {
  key: ForgeFuelKey;
  name: string;
  icon: string;
  /** Heat units a tick in the fire (at a fire strength of 4 quarters). */
  rate: number;
  blurb: string;
};

export type ForgeHammerDef = {
  key: ForgeHammerKey;
  name: string;
  icon: string;
  /** The strike's timing window, in ticks either side of the beat. */
  window: number;
  /** The quality a good strike gives. */
  gain: number;
  /** The quality a perfect strike gives. */
  perfectGain: number;
  blurb: string;
};

export type ForgeTongsDef = {
  key: ForgeTongsKey;
  name: string;
  icon: string;
  /** Ticks to carry the billet between the fire and the anvil. */
  moveTicks: number;
  /** Heat in the fire, in quarters (4 is as it comes). */
  reach: number;
  /** How many quenches the run has. */
  quenches: number;
  blurb: string;
};

export type ForgeCommission = {
  piece: ForgePieceKey;
  strikes: number;
  quality: number;
  points: number;
};

export type ForgeCourse = {
  day: string;
  number: number;
  seed: number;
  commissions: ForgeCommission[];
  /** The day's fire: its strength in quarters (3 low, 4 steady, 5 roaring), one per FIRE_SEG_TICKS. */
  fire: number[];
};

export type ForgeEventKind =
  | "strike"
  | "perfect"
  | "glance"
  | "cold_crack"
  | "burnt"
  | "knock"
  | "quench"
  | "completed"
  | "finished";

export type ForgeEvent = {
  k: ForgeEventKind;
  at: number;
  commission?: number;
  points?: number;
  /** A blow struck outside the piece's sweet band (it counts a step less). */
  dull?: boolean;
};

/** How a commission on the board ended. */
export type ForgeOutcome = "made" | "half" | "ruined";

export type ForgeCommissionState = {
  piece: ForgePieceKey;
  quality: number;
  strikes: number;
};

export type ForgePlace = "anvil" | "fire";

export type ForgeState = {
  tick: number;
  /** The prep phase runs first; the clock starts when the fire is lit. */
  phase: "prep" | "work" | "done";
  /** The tick the fire was lit (the beat and the clock count from it). */
  startAt: number;
  loadout: ForgeLoadout;
  heat: number;
  /** Where the billet is (or is going, while `moving`). */
  place: ForgePlace;
  /** Ticks left carrying it there. */
  moving: number;
  commission: number;
  work: ForgeCommissionState;
  /** Each commission's end, in board order (null: not yet). */
  outcomes: (ForgeOutcome | null)[];
  points: number;
  perfectStrikes: number;
  /** Billets cracked or burnt. */
  ruined: number;
  completed: number;
  chain: number;
  bestChain: number;
  /** The beat the last blow fell on (one blow a beat). */
  lastBeat: number;
  quenchesLeft: number;
  /** A scale waiting to be knocked off; it blocks the next strike. */
  scale: boolean;
  log: ForgeEvent[];
  done: boolean;
};

export type ForgeInput =
  | { t: number; k: "prep"; loadout: ForgeLoadout }
  | { t: number; k: "move"; to: ForgePlace }
  | { t: number; k: "strike" }
  | { t: number; k: "knock" }
  | { t: number; k: "quench" }
  | { t: number; k: "finish" };

export type ForgeDetail = { completed: number; perfect: number; ruined: number; commissions: number; chain: number };

/** Words that float up where something happened. */
export type ForgeFx = { x: number; y: number; text: string; color: string; at: number; big?: boolean };

/** A spark, a flake of scale, a puff of steam or smoke (drawing only). */
export type ForgeParticle = {
  kind: "spark" | "flake" | "steam" | "smoke" | "ember";
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  size: number;
  color: string;
};

/** Where the tap landed: the prep screen's choices, or the smithy's parts. */
export type ForgeHit =
  | { k: "fuel" | "hammer" | "tongs"; i: number }
  | { k: "light" }
  | { k: "fire" }
  | { k: "anvil" }
  | { k: "strike" }
  | { k: "move" }
  | { k: "quench" }
  | { k: "finish" };

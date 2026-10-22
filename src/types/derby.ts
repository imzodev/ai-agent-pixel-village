// Fishing Derby, the arcade's pond game (src/lib/derby/). Types only.

/** The world's pond fish (src/lib/fishing.ts FISH_DEFS keys) that swim in the derby. */
export type DerbyFishKey = "silver_minnow" | "pond_perch" | "mud_carp" | "bluegill" | "catfish" | "golden_carp" | "storm_eel" | "ghost_koi";

export type DerbyTime = "day" | "dusk" | "night";
export type DerbyWeather = "clear" | "rain";

/** A fish as the derby plays it: how big it comes, how it swims and fights. */
export type DerbyFishDef = {
  key: DerbyFishKey;
  name: string;
  icon: string;
  /** Size range, grams. */
  minG: number;
  maxG: number;
  /** Swimming speed, units a second. */
  speed: number;
  /** How hard it pulls on a run (0–1+). */
  fight: number;
  /** How often it's in the pond, against the others. */
  freq: number;
  /** When it's about, as in the world (dusk also has the day's fish). */
  time: "any" | "day" | "dusk" | "night";
  /** Only when it rains (the storm eel). */
  rain?: true;
  /** The day's trophy fish, never one of the regulars. */
  trophy?: true;
  /** Its shadow's colour (the field and the cards). */
  color: string;
};

export type DerbyCircle = { x: number; y: number; r: number };

/** A fish in the day's pond: what it is, how big, where it starts, and when it shows (the trophy surfaces late). */
export type DerbyCourseFish = { key: DerbyFishKey; grams: number; x: number; y: number; appearAt: number };

export type DerbyCourse = {
  day: string;
  number: number;
  seed: number;
  time: DerbyTime;
  weather: DerbyWeather;
  /** The water: overlapping circles. */
  pond: DerbyCircle[];
  /** Lily pads (for show) and reed beds (a hooked fish pulls harder in them). */
  pads: DerbyCircle[];
  reeds: DerbyCircle[];
  /** The regulars, then the trophy (last). */
  fish: DerbyCourseFish[];
};

export type DerbyFishStatus = "hidden" | "swim" | "engaged" | "hooked" | "caught" | "lost" | "gone";

export type DerbyFish = {
  x: number;
  y: number;
  /** Heading, a unit pair. */
  c: number;
  s: number;
  /** Where it's swimming to. */
  tx: number;
  ty: number;
  status: DerbyFishStatus;
  /** It won't come near a bobber before this tick. */
  shyUntil: number;
  /** At the bobber: it bites at this tick (-1: not there yet). */
  biteAt: number;
};

/** The line: nothing out, the cast in the air, waiting, a bite, a fish on, or a moment to get ready again. */
export type DerbyLinePhase = "idle" | "flight" | "waiting" | "bite" | "reel" | "recover";

/** How the last cast ended (for the screen's words and sounds). */
export type DerbyEnd = "caught" | "snap" | "thrown" | "stolen" | "early" | "timeout";

export type DerbyState = {
  tick: number;
  /** mulberry32 state (src/lib/arcade/rng.ts). */
  rng: number;
  fish: DerbyFish[];
  phase: DerbyLinePhase;
  phaseAt: number;
  /** The bobber (in flight: where it's going). */
  bx: number;
  by: number;
  /** The fish at the bobber or on the line, or -1. */
  target: number;
  /** Is the player holding to reel? */
  reeling: boolean;
  /** 0 slack … 1 snaps. */
  tension: number;
  slackTicks: number;
  /** The hooked fish: pulling away (a run) or resting, until fightUntil. */
  running: boolean;
  fightUntil: number;
  /** Course fish indices, in the order landed. */
  caught: number[];
  lost: number;
  last: { k: DerbyEnd; at: number; fish: number } | null;
  done: boolean;
};

/** A cast at (x, y), a strike, or reeling held (1) / let go (0). */
export type DerbyInput =
  | { t: number; k: "cast"; x: number; y: number }
  | { t: number; k: "strike" }
  | { t: number; k: "reel"; v: 0 | 1 };

export type DerbyDetail = { caught: number; grams: number; lost: number; trophy: number };

/** Positions last tick, to draw in between ticks (src/components/derby/draw.ts). */
export type DerbyPose = { x: number; y: number };
/** A word shown where something happened ("snap!"), for a moment. */
export type DerbyFx = { x: number; y: number; text: string; color: string; at: number };

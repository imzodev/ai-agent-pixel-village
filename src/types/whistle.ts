// Whistle, the herding minigame (src/lib/whistle/): the daily course, the
// simulation's state, a player's taps, and what the API and pages show. Types only.

/** An axis-aligned box in field units (x, y = top left). */
export type WRect = { x: number; y: number; w: number; h: number };
export type WPoint = { x: number; y: number };

export type CourseTemplate = "meadow" | "river" | "lanes" | "pond";

/** One day's course: the same for everyone (courseFor(day)). */
export type Course = {
  day: string;
  /** "Whistle #N", counted from WHISTLE_EPOCH. */
  number: number;
  template: CourseTemplate;
  seed: number;
  /** Where the flock starts (its centre). */
  start: WPoint;
  /** The pen's inside: a sheep whose centre gets in is penned. */
  pen: WRect;
  /** Fences, hedges and the pen's walls: nothing walks through them. */
  walls: WRect[];
  /** Ponds and rivers: nothing walks through them either. */
  water: WRect[];
  /** Where each wolf lives (on the field's edge). */
  dens: WPoint[];
  sheep: number;
};

/** A tap: on tick `t`, at field point (x, y), in whole units. */
export type WhistleInput = { t: number; x: number; y: number };

export type SheepStatus = "free" | "penned" | "lost";
export type SheepState = { x: number; y: number; vx: number; vy: number; status: SheepStatus; panic: number };
export type WolfState = {
  x: number; y: number; vx: number; vy: number;
  home: WPoint;
  /** The sheep it's after (-1: none). */
  target: number;
  /** Ticks left running home (scared off, or carrying a sheep). */
  retreat: number;
};
/** A whistle's sound wave, from the tap point. */
export type Ring = { x: number; y: number; born: number };

export type RunState = {
  tick: number;
  sheep: SheepState[];
  wolves: WolfState[];
  rings: Ring[];
  /** Breath in ticks (a whistle costs BREATH_COST, up to BREATH_MAX). */
  breath: number;
  rng: number;
  penned: number;
  lost: number;
  done: boolean;
  /** How many taps took effect (the rest had no breath). */
  whistles: number;
  /** The tick of the last whistle (-MIN_GAP before the first). */
  lastWhistle: number;
};

export type RunResult = { score: number; penned: number; lost: number; ticks: number; perfect: boolean };

/** A leaderboard line. */
export type WhistleBoardRow = { rank: number; name: string; score: number; penned?: number; runId?: string; me?: boolean };

/** GET /api/whistle. */
export type WhistleView = {
  day: string;
  number: number;
  course: Course;
  /** ms until the next course. */
  nextInMs: number;
  today: WhistleBoardRow[];
  week: WhistleBoardRow[];
  /** Last week's top three (the plaza's trophy board). */
  champions: WhistleBoardRow[];
  me: { name: string; best: number | null; rank: number | null; weekRank: number | null } | null;
};

/** POST /api/whistle/start. */
export type WhistleStart = { day: string; course: Course; token: string };

/** POST /api/whistle/submit. */
export type WhistleSubmitResult = RunResult & { runId: string; rank: number; best: number; shareUrl: string };

/** A stored run, for its replay page. */
export type WhistleRunView = { id: string; day: string; number: number; course: Course; name: string; username: string | null; score: number; penned: number; lost: number; inputs: WhistleInput[] };

/** The images the field is drawn with (src/components/whistle/draw.ts). */
export type WhistleSprites = { sheep: HTMLImageElement; wolf: HTMLImageElement };
/** Positions before the last tick, to draw in between ticks. */
export type WhistlePrev = { sheep: WPoint[]; wolves: WPoint[] };
/** A puff where something happened (a sheep penned or taken), for a few frames. */
export type WhistleFx = { x: number; y: number; kind: "penned" | "lost" | "dry"; at: number };
/** What the HUD shows, refreshed a few times a second. */
export type WhistleHud = { seconds: number; penned: number; lost: number; breath: number; total: number };
/** What a finished run hands to its page. */
export type WhistleFinished = { inputs: WhistleInput[]; result: RunResult; day: string; token: string };

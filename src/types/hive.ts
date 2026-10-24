// Beehive Builder, the arcade's honeycomb puzzle (src/lib/hive/). Types only.

/** A cell on the comb, in axial coordinates (s = −q − r). */
export type HiveCell = readonly [q: number, r: number];

export type HiveShapeKey =
  | "one" | "duo_e" | "duo_se" | "duo_ne" | "tri_a" | "tri_b"
  | "line3_e" | "line3_se" | "line3_ne" | "bend_a" | "bend_b" | "diamond"
  | "line4_e" | "line4_se" | "line4_ne";

/** A piece: its cells as offsets from its anchor (0, 0), and how often it's dealt. */
export type HiveShapeDef = { key: HiveShapeKey; cells: readonly HiveCell[]; weight: number };

export type HiveCourse = {
  day: string;
  number: number;
  seed: number;
  /** Old comb: cells already filled at the start (they clear like any other). */
  comb: HiveCell[];
  /** Flower cells: a line through one counts double. */
  flowers: HiveCell[];
  /** Weekends: a royal-jelly cell (a line through it pays a bonus, once). */
  jelly: HiveCell | null;
  /** The pieces in the order they're dealt, three to a tray. */
  pieces: HiveShapeKey[];
};

/** What happened, for the screen: a piece set down, lines turned to honey, the end. */
export type HiveEvent =
  | { k: "place"; at: number; slot: number; cells: number[]; points: number }
  | { k: "clear"; at: number; cells: number[]; lines: number; points: number; flowers: number; jelly: boolean }
  | { k: "end"; at: number; why: HiveEnd };

/** Why a run ended: every piece placed, nothing fits, or the bees' patience ran out. */
export type HiveEnd = "done" | "full" | "time";

export type HiveState = {
  tick: number;
  /** Per board cell (src/lib/hive/board.ts order): filled? */
  filled: boolean[];
  /** The tray: the first piece of this tray (index into course.pieces), and which of its three are used. */
  trayAt: number;
  used: boolean[];
  points: number;
  /** Lines turned to honey, pieces placed, flower lines, and whether the royal jelly is gone. */
  lines: number;
  placed: number;
  flowers: number;
  jellyTaken: boolean;
  log: HiveEvent[];
  done: boolean;
  end: HiveEnd | null;
};

/** Put tray piece `slot` down with its anchor on cell (q, r). */
export type HiveInput = { t: number; k: "place"; slot: number; q: number; r: number };

export type HiveDetail = { honey: number; lines: number; placed: number; flowers: number };

/** A word shown where something happened ("+120 ×2!"), for a moment. */
export type HiveFx = { x: number; y: number; text: string; color: string; at: number };

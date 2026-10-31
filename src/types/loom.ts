// Della's Loom, the arcade's memory game (src/lib/loom/). Types only.

/** "plain": weave it as shown; "back": "and back again", the shown threads in reverse. */
export type LoomRowKind = "plain" | "back";

/** A row of the day's cloth. */
export type LoomRow = {
  kind: LoomRowKind;
  /** Spool indexes in the order Della shows them (0 cream, 1 madder, 2 woad, 3 weld, 4 gold). */
  threads: number[];
  /** Ticks each thread is lit while shown (quicker further up the cloth). */
  show: number;
};

export type LoomCourse = {
  day: string;
  number: number;
  seed: number;
  /** Spools on the loom: 4, or 5 at weekends (the gold thread). */
  colors: number;
  /** The day's figure (2–4 colours) the rows are built from. */
  figure: number[];
  rows: LoomRow[];
};

/** Della shows the row, then you weave it. */
export type LoomPhase = "show" | "weave";

export type LoomEventKind = "show" | "ready" | "thread" | "row" | "snag";

export type LoomEvent = {
  k: LoomEventKind;
  at: number;
  row: number;
  /** thread: which one (in weaving order); snag: where it went wrong. */
  i?: number;
  /** thread / snag: the spool tapped. */
  c?: number;
  /** row: what it paid, whether it was clean, the run of clean rows. */
  points?: number;
  clean?: boolean;
  chain?: number;
};

export type LoomState = {
  tick: number;
  /** The row on the loom (rows woven so far). */
  row: number;
  phase: LoomPhase;
  /** The show began on this tick. */
  showAt: number;
  /** The next thread to weave (weave order). */
  at: number;
  /** This row hasn't snagged yet (still clean). */
  clean: boolean;
  /** First show of this row (Ready then pays for what wasn't shown). */
  firstShow: boolean;
  /** Threads woven from memory on this row (unshown at Ready), paid if it's clean. */
  memory: number;
  points: number;
  snags: number;
  chain: number;
  bestChain: number;
  cleanRows: number;
  golds: number;
  /** Threads woven from memory on clean rows. */
  remembered: number;
  /** The tick the whole cloth was woven (-1 until then; the time bonus). */
  endAt: number;
  /** Snags in the cloth: row and thread (drawing and the card). */
  snagged: { row: number; i: number }[];
  log: LoomEvent[];
  done: boolean;
};

export type LoomInput = { t: number; k: "pick"; c: number } | { t: number; k: "ready" };

export type LoomDetail = { rows: number; clean: number; snags: number; chain: number; golds: number; memory: number };

/** Words that float up where something happened. */
export type LoomFx = { x: number; y: number; text: string; color: string; at: number; big?: boolean };

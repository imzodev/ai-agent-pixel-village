// Log Flume, the arcade's river game (src/lib/flume/). Types only.

export type FlumeLogKind = "pine" | "oak" | "birch";

/** A kind of log: its size (a capsule: half-length along the flow, radius across), how fast it steers, its worth. */
export type FlumeLogDef = { kind: FlumeLogKind; name: string; halfLen: number; radius: number; latSpeed: number; mass: number; points: number; color: string };

/** The river section at a height: its centreline and half-width (between points, in a straight line). */
export type FlumeRiverPoint = { y: number; cx: number; hw: number };
export type FlumeRock = { x: number; y: number; r: number };
/** The mill at the bottom: three gates side by side; which is the spillway, which saw the birch wants. */
export type FlumeMill = { spillway: number; birchSaw: number };

export type FlumeCourse = {
  day: string;
  number: number;
  seed: number;
  river: FlumeRiverPoint[];
  rocks: FlumeRock[];
  /** Bands (y from, y to) where the current runs faster. */
  rapids: { y0: number; y1: number }[];
  mill: FlumeMill;
  /** The logs in the order they come: kind, where they enter (x at the top) and when. */
  logs: { kind: FlumeLogKind; x: number; at: number }[];
};

export type FlumeLogStatus = "waiting" | "afloat" | "milled" | "split" | "beached" | "spilled" | "late";

export type FlumeLog = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  status: FlumeLogStatus;
  /** Ticks it's been barely moving against the bank. */
  stall: number;
  /** Which gate it went through (milled or spilled), or -1. */
  gate: number;
};

/** Something the screen tells (and plays a sound for). */
export type FlumeEvent = { k: "enter" | "milled" | "split" | "beached" | "spilled" | "bump"; at: number; log: number; points?: number };

export type FlumeState = {
  tick: number;
  logs: FlumeLog[];
  /** The log being steered, and the x it's being steered to; -1 when none. */
  held: number;
  holdX: number;
  points: number;
  log: FlumeEvent[];
  done: boolean;
};

/** Take hold of a log (steering it toward x), move the steering x, or let go. */
export type FlumeInput =
  | { t: number; k: "grab"; log: number; x: number }
  | { t: number; k: "move"; x: number }
  | { t: number; k: "drop" };

export type FlumeDetail = { milled: number; split: number; lost: number; birch: number };

/** Logs' places last tick, to draw in between ticks. */
export type FlumePose = { x: number; y: number };
/** A word shown where something happened ("milled +20"), for a moment. */
export type FlumeFx = { x: number; y: number; text: string; color: string; at: number };

// Jobs (src/lib/jobs.ts rules, src/lib/jobsServer.ts server): hired by an
// NPC, a shift a day, a wage, ranks. Types only.

export type JobKind = "courier" | "supplier" | "guard" | "escort";

/** What a day's work is. */
export type JobShift =
  /** Bring `qty` (× rank growth) of any of `items` to the employer. */
  | { kind: "supply"; items: readonly string[]; qty: number }
  /** Carry `count` letters to their recipients. */
  | { kind: "letters"; count: number }
  /** Defeat `kills` (× rank growth) wild beasts within `radius` tiles of (tx, ty). */
  | { kind: "guard"; kills: number; tx: number; ty: number; radius: number; place: string }
  /** Ride along with the caravan for one leg of its circuit. */
  | { kind: "escort" };

/** A job an NPC offers. */
export type JobDef = {
  key: string;
  kind: JobKind;
  employerKey: string;
  /** Apprentice, Hand, Foreman — in the job's own words. */
  titles: readonly [string, string, string];
  shift: JobShift;
  minLevel: number;
  /** What the employer says when offering it. */
  pitch: string;
};

/** A letter in a courier's bag today. */
export type JobLetter = { to: string; toName: string; pay: number; delivered: boolean };

/** Today's progress on a job (reset when the day changes). */
export type JobProgress = {
  /** The UTC day it's for, YYYY-MM-DD. */
  day: string;
  /** Items handed in, beasts defeated, letters delivered. */
  count: number;
  done: boolean;
  letters?: JobLetter[];
  /** Escort: the caravan leg ridden along, and how often you were near it. */
  leg?: number;
  near?: number;
  total?: number;
};

export type JobStatus = "active" | "quit" | "fired";

/** One of your jobs, as the panel and tracker show it. */
export type JobView = {
  key: string;
  kind: JobKind;
  employerKey: string;
  employerName: string;
  title: string;
  rank: number;
  status: JobStatus;
  shiftsDone: number;
  streak: number;
  /** Shifts until the next rank, or null at the top. */
  toNextRank: number | null;
  /** Today's shift: what to do, how far along, and whether it's done. */
  need: number;
  count: number;
  done: boolean;
  task: string;
  /** What a full shift pays at your rank (about). */
  pay: number;
  letters?: JobLetter[];
  /** Escort: signed on for today's leg (the wagon has set off with you). */
  riding?: boolean;
};

/** An employer's offer, as the Jobs panel shows it. */
export type JobOffer = {
  key: string;
  kind: JobKind;
  title: string;
  pitch: string;
  task: string;
  pay: number;
  minLevel: number;
  /** Why you can't take it now ("" when you can). */
  blocked: string;
  /** Yours already (the view), if so. */
  mine: JobView | null;
};

/** GET /api/jobs: your jobs, and an employer's offers when asked for. */
export type JobsResponse = { jobs: JobView[]; offers: JobOffer[]; employerName?: string };

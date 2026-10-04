// Arm wrestling: best of three pulls. A needle swings back and forth over
// a gauge; pull when it's on the sweet spot. Each pull scores 0–100 by how
// close you were; the higher score takes the round. Against the innkeeper,
// or another player at the inn for a stake. Pure; matches live in
// src/lib/saloonServer.ts.

import type { ArmRound } from "@/types/saloon";

export const ARM_ROUNDS = 3;
/** A pull counts if it lands within this long after the round opens. */
export const ARM_WINDOW_MS = 12_000;
/** How long an invitation stands. */
export const ARM_INVITE_MS = 60_000;

/** A fresh round: a random sweet spot and speed, opening at `startAt`. */
export function armRound(startAt: number, rand = Math.random): ArmRound {
  return { startAt, periodMs: 1100 + Math.floor(rand() * 700), phase: rand(), zone: 0.15 + rand() * 0.7 };
}

/** Where the needle is (0–1 across the gauge) at time `t`: a triangle wave. */
export function needleAt(r: ArmRound, t: number): number {
  const u = (((t - r.startAt) / r.periodMs + r.phase) % 1 + 1) % 1;
  return u < 0.5 ? u * 2 : 2 - u * 2;
}

/** A pull at time `t`: 100 dead on the spot, falling to 0 a third of the gauge away. */
export function pullScore(r: ArmRound, t: number): number {
  const d = Math.abs(needleAt(r, t) - r.zone);
  return Math.max(0, Math.round(100 * (1 - d / 0.33)));
}

/** The innkeeper's pull: steady, beatable with good timing. */
export const innkeeperPull = (rand = Math.random): number => Math.round(45 + rand() * 40);

/** Who's ahead after the rounds both sides have pulled: wins for a and b. */
export function tally(scores: { a: (number | null)[]; b: (number | null)[] }): { a: number; b: number } {
  let a = 0, b = 0;
  for (let i = 0; i < scores.a.length; i++) {
    const x = scores.a[i], y = scores.b[i];
    if (x == null || y == null) continue;
    if (x > y) a++; else if (y > x) b++;
  }
  return { a, b };
}

/** Best of three: decided once someone has two, or all rounds are pulled. */
export function decided(scores: { a: (number | null)[]; b: (number | null)[] }): "a" | "b" | "draw" | null {
  const t = tally(scores);
  if (t.a >= 2) return "a";
  if (t.b >= 2) return "b";
  const done = scores.a.every((x) => x != null) && scores.b.every((x) => x != null) && scores.a.length === ARM_ROUNDS;
  if (!done) return null;
  return t.a > t.b ? "a" : t.b > t.a ? "b" : "draw";
}

// The daily-quest streak: days in a row with at least one daily quest done.
// One missed day a month is forgiven (the grace day). Milestones pay out.

import type { StreakState } from "@/types/quest";

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

/** The streak after a quest completed `today` (UTC "YYYY-MM-DD"); unchanged if today already counted. */
export function nextStreak(prev: Pick<StreakState, "current" | "lastCompletedOn" | "graceUsedOn">, today: string): { current: number; graceUsedOn: string | null; changed: boolean } {
  const { lastCompletedOn: last, graceUsedOn } = prev;
  if (last === today) return { current: prev.current, graceUsedOn, changed: false };
  const gap = last ? daysBetween(last, today) : Infinity;
  if (gap === 1) return { current: prev.current + 1, graceUsedOn, changed: true };
  // Missed exactly one day: forgiven once a calendar month.
  const month = today.slice(0, 7);
  if (gap === 2 && graceUsedOn !== month) return { current: prev.current + 1, graceUsedOn: month, changed: true };
  return { current: 1, graceUsedOn, changed: true };
}

/** What reaching day `n` of a streak pays: day 3 coins, every 7th day gems. */
export function streakReward(n: number): { coins: number; gems: number } | null {
  if (n > 0 && n % 7 === 0) return { coins: 0, gems: 10 };
  if (n === 3) return { coins: 50, gems: 0 };
  return null;
}

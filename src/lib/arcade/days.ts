// The arcade's calendar: a course a UTC day, weeks from Monday (UTC), and
// each game's course number from its first day. Pure.

const DAY_MS = 86_400_000;

/** "2026-10-21" for a time. */
export const arcadeDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
/** ms until the next course starts. */
export const msToNextCourse = (ms: number): number => DAY_MS - (ms % DAY_MS);
/** The Monday (UTC) a day's week starts on. */
export function weekOf(day: string): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return arcadeDay(t - dow * DAY_MS);
}
/** A course's number: 1 on the game's first day. */
export const dayNumber = (epoch: string, day: string): number =>
  Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${epoch}T00:00:00Z`)) / DAY_MS) + 1;
/** The day `n` days after `day`. */
export const addDays = (day: string, n: number): string => arcadeDay(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS);

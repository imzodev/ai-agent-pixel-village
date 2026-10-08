// Cheering a lot: visit someone's lot and cheer it, once per owner per day.
// The owner's running total hangs on every one of their lot signs. Pure helpers;
// the action is cheerLot in src/lib/lots.ts.

/** The UTC day a cheer counts for (one cheer per cheerer per owner per day). */
export function cheerDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** The cheer count as shown on a sign: nothing for zero, "👏 12", "👏 1.2k". */
export function cheersText(count: number): string {
  if (!(count > 0)) return "";
  if (count < 1000) return `👏 ${Math.floor(count)}`;
  const k = Math.floor(count / 100) / 10;
  return `👏 ${k}k`;
}

// When a villager offers a mission again. A repeatable mission waits a while
// after you last finished it, so it can't be farmed for coins in a loop.

/** How long before a repeatable mission can be taken again. */
export const REPEAT_COOLDOWN_MS = 20 * 3600_000;

/** Can this player take the mission (never done, or repeatable and rested)? */
export function canTake(m: { repeatable: boolean }, lastCompletedAt: Date | null | undefined, now = Date.now()): boolean {
  if (!lastCompletedAt) return true;
  return m.repeatable && now - lastCompletedAt.getTime() >= REPEAT_COOLDOWN_MS;
}

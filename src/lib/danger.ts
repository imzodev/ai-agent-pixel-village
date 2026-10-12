// Danger levels (tiers 1–8, src/lib/continent.ts tierAt): the level a
// player should be to hold their own in each, and what to tell them when
// they walk into harder land.

/** Suggested player level by tier (index = tier). */
const SUGGESTED_LEVEL = [1, 1, 3, 8, 12, 16, 20, 25, 30] as const;

export const suggestedLevel = (tier: number): number => SUGGESTED_LEVEL[Math.max(1, Math.min(8, tier))];

/** The warning for walking from `prev` into `tier` (null when it isn't worth one). */
export function dangerNotice(tier: number, prev: number, level: number): { text: string; kind: "bad" | "info" } | null {
  if (tier <= prev || tier < 3) return null;
  const need = suggestedLevel(tier);
  return level < need
    ? { text: `⚠️ Danger ${tier}: the creatures here hit hard. Suggested level ${need}+ (you're ${level}).`, kind: "bad" }
    : { text: `⚔️ Danger ${tier}: tougher land, better rewards.`, kind: "info" };
}

// Qualities: courage, kindness, cunning and industry, grown by what a
// character does (never picked, never bought). Each is 0–100 on a log scale
// of the game's own records, so the first deeds count most and the top takes
// real dedication. Pure: server reads in src/lib/qualitiesServer.ts.

import type { Qualities, QualityDef, QualityKey, QualityTallies } from "@/types/qualities";

export type { Qualities, QualityDef, QualityKey, QualityTallies } from "@/types/qualities";

export const QUALITIES: readonly QualityDef[] = [
  { key: "courage", name: "Courage", icon: "🛡️", from: "foes beaten and bounties claimed", titles: ["the Bold", "the Fearless"], known: "their courage" },
  { key: "kindness", name: "Kindness", icon: "💛", from: "villagers befriended and favours done", titles: ["the Kind", "Friend to All"], known: "their kindness" },
  { key: "cunning", name: "Cunning", icon: "🦊", from: "trade and standing in the towns", titles: ["the Shrewd", "Silver-Tongued"], known: "their sharp dealing" },
  { key: "industry", name: "Industry", icon: "⚒️", from: "crops, catches and shifts worked", titles: ["the Diligent", "Tireless"], known: "how hard they work" },
];

/** Quality levels where a title unlocks (QualityDef.titles). */
export const TITLE_AT: readonly [number, number] = [50, 80];
/** A quality NPCs mention once it's at least this and the character's highest. */
export const KNOWN_AT = 30;

/** Each quality's points, weighted from the tallies. */
export function qualityPoints(t: QualityTallies): Record<QualityKey, number> {
  return {
    courage: t.foes + 10 * t.bounties,
    kindness: t.regard + 5 * t.missions,
    cunning: t.reputation,
    industry: t.crops + t.fish + 5 * t.shifts,
  };
}

/** Points to a 0–100 score: 10 → 25, 100 → 50, 1,000 → 75, 10,000 → 100. */
export const scoreOf = (points: number): number => Math.max(0, Math.min(100, Math.round(25 * Math.log10(1 + Math.max(0, points)))));

export function qualitiesOf(t: QualityTallies): Qualities {
  const p = qualityPoints(t);
  return { courage: scoreOf(p.courage), kindness: scoreOf(p.kindness), cunning: scoreOf(p.cunning), industry: scoreOf(p.industry) };
}

/** Titles the qualities have unlocked. */
export function qualityTitles(q: Qualities): string[] {
  return QUALITIES.flatMap((d) => d.titles.filter((_, i) => q[d.key] >= TITLE_AT[i]));
}

/** What the character is best known for, once it stands out (for NPCs), or null. */
export function knownFor(q: Qualities): QualityDef | null {
  const best = [...QUALITIES].sort((a, b) => q[b.key] - q[a.key])[0];
  return q[best.key] >= KNOWN_AT ? best : null;
}

// The reputation store (src/lib/reputation.ts): per character and town.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { characterReputation } from "@/db/schema";
import { TOWNS } from "./settlements";
import { nextTier, repTier, repTitle } from "./reputation";
import type { RepView } from "@/types/reputation";

/** Add points with a town; returns the new total and whether a tier was reached. */
export async function addReputation(characterId: number, town: string, points: number): Promise<{ points: number; reached: string | null }> {
  const [row] = await db.insert(characterReputation).values({ characterId, town, points })
    .onConflictDoUpdate({ target: [characterReputation.characterId, characterReputation.town], set: { points: sql`${characterReputation.points} + ${points}` } })
    .returning({ points: characterReputation.points });
  const before = repTier(row.points - points), after = repTier(row.points);
  return { points: row.points, reached: after.name !== before.name ? after.name : null };
}

export async function reputationWith(characterId: number, town: string): Promise<number> {
  const [row] = await db.select({ points: characterReputation.points }).from(characterReputation)
    .where(and(eq(characterReputation.characterId, characterId), eq(characterReputation.town, town)));
  return row?.points ?? 0;
}

/** Your standing with every continent town. */
export async function reputationView(characterId: number): Promise<RepView[]> {
  const rows = await db.select().from(characterReputation).where(eq(characterReputation.characterId, characterId));
  return TOWNS.map((t) => {
    const points = rows.find((r) => r.town === t.key)?.points ?? 0;
    const tier = repTier(points), next = nextTier(points);
    return { town: t.key, name: t.name, points, tier: tier.name, discount: tier.discount, next: next ? { name: next.name, min: next.min } : null };
  });
}

/** Titles earned by Revered standing. */
export async function reputationTitles(characterId: number): Promise<string[]> {
  return (await reputationView(characterId)).filter((r) => r.tier === "Revered").map((r) => repTitle(r.town));
}

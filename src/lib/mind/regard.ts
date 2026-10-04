// How an NPC with a mind feels about players (npc_regard): plain counters
// moved by what players do, not by Jev. Helping (buying, selling her what
// she needs, filling her requests) raises it; taking free bread batch after
// batch without ever helping slowly lowers it. Safe for tickd.

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { npcMinds, npcRegard } from "@/db/schema";
import { regardTier } from "./profile";
import type { RegardTier } from "@/types/mind";

/** Free loaves in a row (without helping) before regard starts to drop. */
export const FREEBIE_GRACE = 3;

/** Does this NPC have a mind (so regard matters)? */
export async function hasMind(npcId: number): Promise<boolean> {
  const [m] = await db.select({ id: npcMinds.npcId }).from(npcMinds).where(eq(npcMinds.npcId, npcId));
  return !!m;
}

/** The player helped: raise regard and forgive the free loaves. */
export async function regardHelped(npcId: number, characterId: number, points: number): Promise<void> {
  await db.insert(npcRegard).values({ npcId, characterId, score: points, freebies: 0 })
    .onConflictDoUpdate({ target: [npcRegard.npcId, npcRegard.characterId], set: { score: sql`${npcRegard.score} + ${points}`, freebies: 0 } });
}

/** The player took a free loaf: past the grace, each one costs a point. */
export async function regardFreebie(npcId: number, characterId: number): Promise<void> {
  await db.insert(npcRegard).values({ npcId, characterId, freebies: 1 })
    .onConflictDoUpdate({
      target: [npcRegard.npcId, npcRegard.characterId],
      set: {
        freebies: sql`${npcRegard.freebies} + 1`,
        score: sql`${npcRegard.score} - case when ${npcRegard.freebies} + 1 > ${FREEBIE_GRACE} then 1 else 0 end`,
      },
    });
}

/** Regard scores for some players (missing = 0). */
export async function regardScores(npcId: number, characterIds: readonly number[]): Promise<Map<number, { score: number; lastGiftAt: number | null }>> {
  if (!characterIds.length) return new Map();
  const rows = await db.select().from(npcRegard).where(and(eq(npcRegard.npcId, npcId), inArray(npcRegard.characterId, [...characterIds])));
  return new Map(rows.map((r) => [r.characterId, { score: r.score, lastGiftAt: r.lastGiftAt?.getTime() ?? null }]));
}

/** How she feels about one player. */
export async function tierFor(npcId: number, characterId: number): Promise<RegardTier> {
  return regardTier((await regardScores(npcId, [characterId])).get(characterId)?.score ?? 0);
}

export async function markGifted(npcId: number, characterId: number, at: Date): Promise<void> {
  await db.insert(npcRegard).values({ npcId, characterId, lastGiftAt: at })
    .onConflictDoUpdate({ target: [npcRegard.npcId, npcRegard.characterId], set: { lastGiftAt: at } });
}

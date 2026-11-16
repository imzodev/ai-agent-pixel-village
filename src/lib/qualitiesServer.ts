// Qualities, server side: the tallies from the game's own records (no new
// hooks: what's already counted), and the line NPCs hear about the player
// (origin, traits, and what they're known for). Rules: src/lib/qualities.ts.

import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { characterBounties, characterCollection, characterMissions, characterReputation, jobs, npcRegard } from "@/db/schema";
import { knownFor, qualitiesOf, qualityTitles } from "@/lib/qualities";
import { heroLine } from "@/lib/traits";
import { traitsOf } from "@/lib/traitsServer";
import type { Qualities, QualityTallies } from "@/types/qualities";

const sum = async (q: Promise<{ n: number | string | null }[]>) => Number((await q)[0]?.n ?? 0);

export async function qualityTallies(characterId: number): Promise<QualityTallies> {
  const coll = (kinds: string[]) => sum(db.select({ n: sql<number>`coalesce(sum(${characterCollection.count}), 0)` }).from(characterCollection)
    .where(and(eq(characterCollection.characterId, characterId), inArray(characterCollection.kind, kinds))));
  const [foes, bounties, regard, missions, reputation, shifts, crops, fish] = await Promise.all([
    coll(["enemy"]),
    sum(db.select({ n: sql<number>`count(*)` }).from(characterBounties).where(and(eq(characterBounties.characterId, characterId), eq(characterBounties.status, "done")))),
    sum(db.select({ n: sql<number>`coalesce(sum(${npcRegard.score}), 0)` }).from(npcRegard).where(and(eq(npcRegard.characterId, characterId), gt(npcRegard.score, 0)))),
    sum(db.select({ n: sql<number>`count(*)` }).from(characterMissions).where(and(eq(characterMissions.characterId, characterId), eq(characterMissions.status, "completed")))),
    sum(db.select({ n: sql<number>`coalesce(sum(${characterReputation.points}), 0)` }).from(characterReputation).where(eq(characterReputation.characterId, characterId))),
    sum(db.select({ n: sql<number>`coalesce(sum(${jobs.shiftsDone}), 0)` }).from(jobs).where(eq(jobs.characterId, characterId))),
    coll(["crop"]),
    coll(["fish"]),
  ]);
  return { foes, bounties, regard, missions, reputation, shifts, crops, fish };
}

export async function qualitiesFor(characterId: number): Promise<Qualities> {
  return qualitiesOf(await qualityTallies(characterId));
}

/** Titles from qualities (collectionServer's unlockedTitles). */
export async function qualityTitlesFor(characterId: number): Promise<string[]> {
  return qualityTitles(await qualitiesFor(characterId));
}

/** How the villagers see this player, for the talk prompt: origin, traits and what they're known for. Null if nothing yet. */
export async function heroNoteFor(characterId: number, name: string): Promise<string | null> {
  const [traits, q] = await Promise.all([traitsOf(characterId), qualitiesFor(characterId)]);
  const known = knownFor(q);
  const lines = [heroLine(name, traits), known ? `Around here ${name} is known for ${known.known}.` : null].filter(Boolean);
  return lines.length ? lines.join(" ") : null;
}

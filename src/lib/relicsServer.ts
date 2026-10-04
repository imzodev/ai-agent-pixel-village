// Picking up hidden relics (src/lib/relics.ts): once per player, into the
// collection book.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { characterCollection, characters } from "@/db/schema";
import { recordCollection } from "./collectionStore";
import { recalcLevel } from "./game";
import { RELICS, RELIC_REACH_PX, relicByKey, relicPoint, relicSet } from "./relics";
import type { Point } from "@/types/world";

/** The relics a character has found. */
export async function relicsFound(characterId: number): Promise<string[]> {
  const rows = await db.select({ key: characterCollection.key }).from(characterCollection)
    .where(and(eq(characterCollection.characterId, characterId), eq(characterCollection.kind, "relic")));
  return rows.map((r) => r.key);
}

export async function pickUpRelic(characterId: number, key: string, pos: Point): Promise<{ ok: true; message: string; notices: string[]; have: number; total: number } | { ok: false; error: string }> {
  const r = relicByKey(key);
  if (!r) return { ok: false, error: "Nothing here." };
  const at = relicPoint(r);
  if (Math.hypot(at.x - pos.x, at.y - pos.y) > RELIC_REACH_PX) return { ok: false, error: "Get a little closer." };
  if (!(await recordCollection(characterId, "relic", key))) return { ok: false, error: "You've already got this one in your book." };
  await db.update(characters).set({ xp: sql`${characters.xp} + 25`, coins: sql`${characters.coins} + 10` }).where(eq(characters.id, characterId));
  await recalcLevel(characterId);
  const set = relicSet(r.set);
  const mine = new Set(await relicsFound(characterId));
  const have = RELICS.filter((x) => x.set === r.set && mine.has(x.key)).length;
  const total = RELICS.filter((x) => x.set === r.set).length;
  const notices = have === total ? [`📖 You've found every one of the ${set.name}! Claim the reward in your book.`] : [];
  return { ok: true, message: `${set.icon} Found: ${r.name}! (${have}/${total} ${set.name}) +25 XP, +10 🪙`, notices, have, total };
}

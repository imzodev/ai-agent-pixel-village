// Recording collection-book entries. Kept apart from collectionServer.ts
// (which needs the NPC list from seed.ts) so tickd-side code can count
// finds without loading the seed.

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { characterCollection } from "@/db/schema";
import type { CollectionKind } from "@/types/collection";

/**
 * Count `qty` of an entry. Returns true the first time this character
 * finds it (for "📖 New: …" toasts).
 */
export async function recordCollection(characterId: number, kind: CollectionKind, key: string, qty = 1): Promise<boolean> {
  const [row] = await db
    .insert(characterCollection)
    .values({ characterId, kind, key, count: qty })
    .onConflictDoUpdate({
      target: [characterCollection.characterId, characterCollection.kind, characterCollection.key],
      set: { count: sql`${characterCollection.count} + ${qty}` },
    })
    .returning({ count: characterCollection.count });
  return (row?.count ?? 0) === qty;
}

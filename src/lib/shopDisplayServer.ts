// What each shop display shows right now (src/lib/shopDisplay.ts): pieces
// from the stock of the NPC with a mind who runs it; a full rack when that
// NPC has no mind (MIND_NPCS). Read by the snapshot.

import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { npcMinds, npcs } from "@/db/schema";
import { isMindNpc } from "@/lib/mind/config";
import { SHOP_DISPLAYS, fullCounts, piecesFor } from "@/lib/shopDisplay";
import type { ShopDisplaySnapshot } from "@/types/shopDisplay";

export async function shopDisplays(): Promise<ShopDisplaySnapshot[]> {
  const minded = SHOP_DISPLAYS.filter((d) => isMindNpc(d.npcKey)).map((d) => d.npcKey);
  const rows = minded.length
    ? await db.select({ key: npcs.key, stock: npcMinds.stock }).from(npcMinds).innerJoin(npcs, eq(npcs.id, npcMinds.npcId)).where(inArray(npcs.key, minded))
    : [];
  const stockOf = new Map(rows.map((r) => [r.key, r.stock]));
  return SHOP_DISPLAYS.map((d) => {
    const stock = stockOf.get(d.npcKey);
    return { key: d.key, counts: stock ? Object.fromEntries(d.slots.map((s) => [s.itemKey, piecesFor(s, stock[s.itemKey] ?? 0)])) : fullCounts(d) };
  });
}

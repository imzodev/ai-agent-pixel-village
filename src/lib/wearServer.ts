// Tool wear, the writes (rules: src/lib/wear.ts). One transaction per use:
// the copy in use gets the wear, split off first when copies are stacked, so
// one row's wear never covers several tools.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, inventory, items } from "@/db/schema";
import { WEAR_MAX, WEAR_PER_USE, mostWorn, repairCost, usedCopy, wearNotice, wearOf, wears } from "./wear";
import { withPlus, plusOf } from "./forge";
import type { WearUse } from "@/types/forge";

type InvRow = typeof inventory.$inferSelect;

/** The copy of `itemKey` in use (equipped copies first), or the most worn one to repair; locked for update. */
async function lockCopy(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], characterId: number, itemKey: string, pick: "used" | "worn"): Promise<InvRow | null> {
  const rows = await tx.select().from(inventory).where(and(eq(inventory.characterId, characterId), eq(inventory.itemKey, itemKey), sql`${inventory.qty} > 0`)).for("update");
  if (!rows.length) return null;
  return pick === "worn" ? mostWorn(rows) : usedCopy(rows.some((r) => r.equipped) ? rows.filter((r) => r.equipped) : rows);
}

/** Write `meta` onto one copy of `row`: in place, or on a copy split off a stack. */
async function setOneCopy(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], row: InvRow, meta: Record<string, unknown>): Promise<void> {
  if (row.qty > 1) {
    await tx.update(inventory).set({ qty: row.qty - 1, equipped: false }).where(eq(inventory.id, row.id));
    await tx.insert(inventory).values({ characterId: row.characterId, itemKey: row.itemKey, qty: 1, equipped: row.equipped, meta });
  } else {
    await tx.update(inventory).set({ meta }).where(eq(inventory.id, row.id));
  }
}

/** Wear the copy of `itemKey` in use by one `use`; a notice when it just got worn or dull. */
export async function wearTool(characterId: number, itemKey: string | null, use: WearUse): Promise<string | null> {
  if (!itemKey || !wears(itemKey)) return null;
  const r = await db.transaction(async (tx) => {
    const row = await lockCopy(tx, characterId, itemKey, "used");
    if (!row) return null;
    const before = wearOf(row.meta);
    if (before >= WEAR_MAX) return null;
    const after = Math.min(WEAR_MAX, before + WEAR_PER_USE[use]);
    await setOneCopy(tx, row, { ...(row.meta as Record<string, unknown>), wear: after });
    return { before, after, plus: plusOf(row.meta) };
  });
  if (!r) return null;
  const notice = wearNotice("", r.before, r.after);
  if (!notice) return null;
  const [d] = await db.select({ name: items.name }).from(items).where(eq(items.key, itemKey));
  return wearNotice(withPlus(d?.name ?? itemKey.replace(/_/g, " "), r.plus), r.before, r.after);
}

/** Bjorn repairs your most worn copy of `itemKey`: coins out, wear back to 0, in one transaction. */
export async function repairTool(characterId: number, itemKey: string): Promise<{ ok: true; cost: number } | { ok: false; error: string }> {
  if (!wears(itemKey)) return { ok: false, error: "That doesn't need a smith." };
  return db.transaction(async (tx) => {
    const row = await lockCopy(tx, characterId, itemKey, "worn");
    if (!row) return { ok: false as const, error: "You don't have one." };
    const cost = repairCost(itemKey, wearOf(row.meta));
    if (cost <= 0) return { ok: false as const, error: "It's in fine shape already." };
    const paid = await tx.update(characters).set({ coins: sql`${characters.coins} - ${cost}` })
      .where(and(eq(characters.id, characterId), sql`${characters.coins} >= ${cost}`)).returning({ id: characters.id });
    if (!paid.length) return { ok: false as const, error: `A repair costs ${cost} coins.` };
    const { wear: _old, ...meta } = row.meta as Record<string, unknown>;
    void _old;
    await setOneCopy(tx, row, meta);
    return { ok: true as const, cost };
  });
}

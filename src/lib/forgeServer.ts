// The forge's DB side: what you can upgrade, and the upgrade itself (coins
// + materials in, one level up), as one transaction so a double click
// can't pay twice or level past the cap.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, inventory, items } from "@/db/schema";
import { FORGE_ITEMS, plusOf, upgradeCost, withPlus } from "./forge";
import type { ForgeItemView, ForgeView } from "@/types/forge";

/** Your upgradable gear (one entry per row, best first), coins and materials. */
export async function forgeView(characterId: number): Promise<ForgeView> {
  const [rows, defs, [c]] = await Promise.all([
    db.select().from(inventory).where(and(eq(inventory.characterId, characterId), sql`${inventory.qty} > 0`)),
    db.select().from(items),
    db.select({ coins: characters.coins }).from(characters).where(eq(characters.id, characterId)),
  ]);
  const have: Record<string, number> = {};
  for (const r of rows) have[r.itemKey] = (have[r.itemKey] ?? 0) + r.qty;
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const list: ForgeItemView[] = [];
  const seen = new Set<string>();
  for (const r of [...rows].sort((a, b) => plusOf(b.meta) - plusOf(a.meta))) {
    const f = FORGE_ITEMS[r.itemKey];
    if (!f) continue;
    const plus = plusOf(r.meta);
    const id = `${r.itemKey}+${plus}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const d = byKey.get(r.itemKey);
    list.push({ itemKey: r.itemKey, name: withPlus(d?.name ?? r.itemKey, plus), icon: d?.icon ?? "📦", family: f.family, plus, next: upgradeCost(r.itemKey, plus) });
  }
  return { items: list, coins: c?.coins ?? 0, have };
}

/**
 * Upgrade your best copy of `itemKey` one level. A stacked copy is split
 * off first so only one item gets the level.
 */
export async function forgeUpgrade(characterId: number, itemKey: string): Promise<{ ok: true; plus: number; name: string } | { ok: false; error: string }> {
  if (!FORGE_ITEMS[itemKey]) return { ok: false, error: "Bjorn can't do much with that." };
  return db.transaction(async (tx) => {
    const [c] = await tx.select({ coins: characters.coins }).from(characters).where(eq(characters.id, characterId)).for("update");
    const rows = await tx.select().from(inventory).where(and(eq(inventory.characterId, characterId), eq(inventory.itemKey, itemKey), sql`${inventory.qty} > 0`)).for("update");
    // the equipped copy first, then the most upgraded one
    const row = [...rows].sort((a, b) => Number(b.equipped) - Number(a.equipped) || plusOf(b.meta) - plusOf(a.meta))[0];
    if (!row) return { ok: false as const, error: "You don't have one." };
    const plus = plusOf(row.meta);
    const cost = upgradeCost(itemKey, plus);
    if (!cost) return { ok: false as const, error: "That's as good as it gets. Even Bjorn says so." };
    if ((c?.coins ?? 0) < cost.coins) return { ok: false as const, error: `You need ${cost.coins} coins.` };
    for (const need of cost.items) {
      const mats = await tx.select().from(inventory).where(and(eq(inventory.characterId, characterId), eq(inventory.itemKey, need.itemKey))).orderBy(inventory.id).for("update");
      const total = mats.reduce((s, m) => s + m.qty, 0);
      if (total < need.qty) return { ok: false as const, error: `You need ${need.qty} ${need.itemKey.replace(/_/g, " ")} (you have ${total}).` };
      let left = need.qty;
      for (const m of mats) {
        if (left <= 0) break;
        if (m.qty <= left) { await tx.delete(inventory).where(eq(inventory.id, m.id)); left -= m.qty; }
        else { await tx.update(inventory).set({ qty: m.qty - left }).where(eq(inventory.id, m.id)); left = 0; }
      }
    }
    await tx.update(characters).set({ coins: sql`${characters.coins} - ${cost.coins}` }).where(eq(characters.id, characterId));
    const meta = { ...(row.meta as Record<string, unknown>), plus: plus + 1 };
    if (row.qty > 1) {
      await tx.update(inventory).set({ qty: row.qty - 1 }).where(eq(inventory.id, row.id));
      await tx.insert(inventory).values({ characterId, itemKey, qty: 1, equipped: row.equipped, meta });
      if (row.equipped) await tx.update(inventory).set({ equipped: false }).where(eq(inventory.id, row.id));
    } else {
      await tx.update(inventory).set({ meta }).where(eq(inventory.id, row.id));
    }
    const [d] = await tx.select({ name: items.name }).from(items).where(eq(items.key, itemKey));
    return { ok: true as const, plus: plus + 1, name: withPlus(d?.name ?? itemKey, plus + 1) };
  });
}

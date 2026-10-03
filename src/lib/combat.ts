// Server-side combat helpers: a character's perks and gear, and taking
// damage (with the knock-out when HP runs out). Used by the act route
// (hits back), the WS beat loop (aggressive enemies, the world boss) and
// the shops / garden (perk effects).

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { characterPerks, characters, inventory } from "@/db/schema";
import { isPerkKey, maxHpFor, type PerkKey } from "./progression";
import { plusOf } from "./forge";
import type { Gear } from "@/types/forge";
import { SPAWN } from "./worldmap";

/** Share of coins lost when knocked out. */
export const KNOCKOUT_COIN_LOSS = 0.1;

/** Perks a character has picked. */
export async function perksOf(characterId: number): Promise<Set<PerkKey>> {
  const rows = await db.select({ k: characterPerks.perkKey }).from(characterPerks).where(eq(characterPerks.characterId, characterId));
  return new Set(rows.map((r) => r.k).filter(isPerkKey));
}

/** Perks for many characters at once (e.g. garden owners in a tick). */
export async function perksOfMany(ids: number[]): Promise<Map<number, Set<PerkKey>>> {
  const out = new Map<number, Set<PerkKey>>();
  if (ids.length === 0) return out;
  const rows = await db.select().from(characterPerks).where(inArray(characterPerks.characterId, ids));
  for (const r of rows) {
    if (!isPerkKey(r.perkKey)) continue;
    const set = out.get(r.characterId) ?? new Set<PerkKey>();
    set.add(r.perkKey);
    out.set(r.characterId, set);
  }
  return out;
}

/** Item keys in the bag (qty > 0), and the equipped ones. */
export async function gearOf(characterId: number): Promise<Gear> {
  const rows = await db
    .select({ itemKey: inventory.itemKey, equipped: inventory.equipped, meta: inventory.meta })
    .from(inventory)
    .where(and(eq(inventory.characterId, characterId), sql`${inventory.qty} > 0`));
  // Forge levels (meta.plus), per item key: the equipped copy's when one
  // is equipped (that's the one you swing), else the best in the bag.
  const plus: Record<string, number> = {};
  for (const key of new Set(rows.map((r) => r.itemKey))) {
    const mine = rows.filter((r) => r.itemKey === key);
    const pool = mine.some((r) => r.equipped) ? mine.filter((r) => r.equipped) : mine;
    plus[key] = Math.max(...pool.map((r) => plusOf(r.meta)));
  }
  return { bag: rows.map((r) => r.itemKey), equipped: rows.filter((r) => r.equipped).map((r) => r.itemKey), plus };
}

/**
 * Take `amount` damage. At 0 HP the character is knocked out: they wake in
 * the village square at half HP and lose KNOCKOUT_COIN_LOSS of their coins.
 */
export async function damagePlayer(
  characterId: number,
  amount: number,
): Promise<{ hp: number; maxHp: number; knockedOut: boolean; coinsLost: number; x?: number; y?: number } | null> {
  const [hit] = await db
    .update(characters)
    .set({ hp: sql`greatest(0, ${characters.hp} - ${amount})` })
    .where(eq(characters.id, characterId))
    .returning({ hp: characters.hp, maxHp: characters.maxHp, coins: characters.coins });
  if (!hit) return null;
  if (hit.hp > 0) return { hp: hit.hp, maxHp: hit.maxHp, knockedOut: false, coinsLost: 0 };
  const coinsLost = Math.floor(hit.coins * KNOCKOUT_COIN_LOSS);
  const hp = Math.ceil(hit.maxHp / 2);
  const x = SPAWN.x, y = SPAWN.y;
  await db
    .update(characters)
    .set({ hp, coins: sql`greatest(0, ${characters.coins} - ${coinsLost})`, x, y })
    .where(eq(characters.id, characterId));
  return { hp, maxHp: hit.maxHp, knockedOut: true, coinsLost, x, y };
}

/** Max HP for a character's level and perks (Tough adds 20). */
export function maxHpOf(level: number, perks: Set<PerkKey>): number {
  return maxHpFor(level, perks.has("tough"));
}

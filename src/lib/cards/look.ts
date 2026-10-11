// A character's look for a card: appearance, cosmetics and the weapon in hand.
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { characterEquipped, characters, inventory } from "@/db/schema";
import { weaponOf } from "@/lib/lpcLayers";
import type { CosmeticSlot, EquippedCosmetics } from "@/types/cosmetic";
import type { CardLook } from "@/types/moments";

export async function lookOf(characterId: number): Promise<CardLook | null> {
  const [c] = await db.select({ name: characters.name, level: characters.level, title: characters.title, appearance: characters.appearance }).from(characters).where(eq(characters.id, characterId));
  if (!c) return null;
  const worn = await db.select({ slot: characterEquipped.slot, itemKey: characterEquipped.itemKey }).from(characterEquipped).where(eq(characterEquipped.characterId, characterId));
  const held = await db.select({ itemKey: inventory.itemKey }).from(inventory).where(and(eq(inventory.characterId, characterId), eq(inventory.equipped, true)));
  const cosmetics: EquippedCosmetics = {};
  for (const w of worn) cosmetics[w.slot as CosmeticSlot] = w.itemKey;
  return { name: c.name, level: c.level, title: c.title, appearance: c.appearance, cosmetics, weapon: weaponOf(held.map((h) => h.itemKey)) };
}

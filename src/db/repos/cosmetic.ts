// Drizzle adapter for the cosmetic repos. The CosmeticRepository interface is
// the union of operations on cosmetic_items, cosmetic_ownerships, and
// character_equipped — split into separate interfaces per the Interface
// Segregation Principle would be overkill here, so we keep one.

import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { CosmeticItem, CosmeticOwnership } from "@/types/cosmetic";
import { cosmeticItems, cosmeticOwnerships, characterEquipped } from "@/db/schema";

export class DrizzleCosmeticRepo {
  constructor(private db: NodePgDatabase) {}

  // --- catalog ---
  async listCatalog(): Promise<CosmeticItem[]> {
    return (await this.db.select().from(cosmeticItems)) as unknown as CosmeticItem[];
  }

  async findCatalogItem(key: string): Promise<CosmeticItem | null> {
    const [row] = await this.db.select().from(cosmeticItems).where(eq(cosmeticItems.key, key)).limit(1);
    return (row as unknown as CosmeticItem | undefined) ?? null;
  }

  async upsertCatalogItem(item: CosmeticItem): Promise<void> {
    await this.db
      .insert(cosmeticItems)
      .values({
        key: item.key,
        name: item.name,
        slot: item.slot,
        assetRef: item.assetRef,
        tintColor: item.tintColor,
        rarity: item.rarity,
        coinPrice: item.coinPrice,
        gemPrice: item.gemPrice,
        sponsorGrantedOnly: item.sponsorGrantedOnly,
        sponsorId: item.sponsorId,
        availableFrom: item.availableFrom ? new Date(item.availableFrom) : null,
        availableUntil: item.availableUntil ? new Date(item.availableUntil) : null,
      })
      .onConflictDoUpdate({
        target: cosmeticItems.key,
        set: {
          name: item.name,
          slot: item.slot,
          assetRef: item.assetRef,
          tintColor: item.tintColor,
          rarity: item.rarity,
          coinPrice: item.coinPrice,
          gemPrice: item.gemPrice,
          sponsorGrantedOnly: item.sponsorGrantedOnly,
          sponsorId: item.sponsorId,
          availableFrom: item.availableFrom ? new Date(item.availableFrom) : null,
          availableUntil: item.availableUntil ? new Date(item.availableUntil) : null,
        },
      });
  }

  // --- ownership ---
  async listOwned(characterId: number): Promise<CosmeticOwnership[]> {
    return (await this.db
      .select()
      .from(cosmeticOwnerships)
      .where(eq(cosmeticOwnerships.characterId, characterId))) as CosmeticOwnership[];
  }

  async owns(characterId: number, itemKey: string): Promise<boolean> {
    const [row] = await this.db
      .select()
      .from(cosmeticOwnerships)
      .where(and(eq(cosmeticOwnerships.characterId, characterId), eq(cosmeticOwnerships.itemKey, itemKey)))
      .limit(1);
    return !!row;
  }

  async grantOwnership(characterId: number, itemKey: string, source: CosmeticOwnership["source"]): Promise<void> {
    await this.db.insert(cosmeticOwnerships).values({ characterId, itemKey, source });
  }

  // --- equipped ---
  async listEquipped(characterId: number): Promise<Array<{ slot: string; itemKey: string }>> {
    return await this.db
      .select({ slot: characterEquipped.slot, itemKey: characterEquipped.itemKey })
      .from(characterEquipped)
      .where(eq(characterEquipped.characterId, characterId));
  }

  async equip(characterId: number, slot: string, itemKey: string): Promise<void> {
    await this.db
      .insert(characterEquipped)
      .values({ characterId, slot, itemKey })
      .onConflictDoNothing();
    // also clear any other equipped item in that slot
    await this.db
      .update(characterEquipped)
      .set({ itemKey })
      .where(and(eq(characterEquipped.characterId, characterId), eq(characterEquipped.slot, slot)));
  }

  async unequip(characterId: number, slot: string): Promise<void> {
    await this.db
      .delete(characterEquipped)
      .where(and(eq(characterEquipped.characterId, characterId), eq(characterEquipped.slot, slot)));
  }
}

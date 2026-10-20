// Cosmetic service. Catalog lookup, ownership grants (auto-grant on sponsor
// NPC visit, manual grant on purchase), and equip/unequip.

import { and, eq, gte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { CharacterRepository } from "@/types/ports";
import type { AnalyticsPort } from "@/types/ports";
import type { DrizzleCosmeticRepo } from "@/db/repos/cosmetic";
import type { CosmeticItem, CosmeticSlot } from "@/types/cosmetic";
import { characters, cosmeticItems, cosmeticOwnerships, gemTransactions } from "@/db/schema";

export type ShopView = {
  item: CosmeticItem;
  owned: boolean;
  equipped: boolean;
  canAffordCoins: boolean;
  canAffordGems: boolean;
};

export class CosmeticService {
  constructor(
    private repo: DrizzleCosmeticRepo,
    private characterRepo: CharacterRepository,
    private analytics: AnalyticsPort,
    private db?: NodePgDatabase,
  ) {}

  async getShopView(characterId: number): Promise<ShopView[]> {
    const [catalog, owned, equipped, coinsRow] = await Promise.all([
      this.repo.listCatalog(),
      this.repo.listOwned(characterId),
      this.repo.listEquipped(characterId),
      this.db ? this.db.select({ coins: characters.coins, gems: characters.gems }).from(characters).where(eq(characters.id, characterId)).limit(1) : Promise.resolve([{ coins: 0, gems: 0 }]),
    ]);
    const ownedKeys = new Set(owned.map((o) => o.itemKey));
    const equippedKeys = new Set(equipped.map((e) => e.itemKey));
    const coins = coinsRow[0]?.coins ?? 0;
    const gems = coinsRow[0]?.gems ?? 0;
    return catalog.map((item) => ({
      item,
      owned: ownedKeys.has(item.key),
      equipped: equippedKeys.has(item.key),
      canAffordCoins: item.coinPrice > 0 && item.coinPrice <= coins,
      canAffordGems: item.gemPrice > 0 && item.gemPrice <= gems,
    }));
  }

  async buyWithCoins(characterId: number, itemKey: string, userId?: number): Promise<{ newBalance: number }> {
    const item = await this.repo.findCatalogItem(itemKey);
    if (!item) throw new Error("unknown item");
    if (item.coinPrice <= 0) throw new Error("not purchasable with coins");
    if (await this.repo.owns(characterId, itemKey)) throw new Error("already owned");
    if (!this.db) throw new Error("CosmeticService requires a Drizzle db handle");
    return await this.db.transaction(async (tx) => {
      const [ch] = await tx
        .update(characters)
        .set({ coins: sql`${characters.coins} - ${item.coinPrice}` })
        .where(and(eq(characters.id, characterId), gte(characters.coins, item.coinPrice)))
        .returning({ coins: characters.coins });
      if (!ch) throw new Error("insufficient coins");
      await tx.insert(cosmeticOwnerships).values({ characterId, itemKey, source: "coin" });
      this.analytics.track("cosmetic_bought_coins", { itemKey, price: item.coinPrice }, userId);
      return { newBalance: ch.coins };
    });
  }

  async buyWithGems(characterId: number, itemKey: string, userId?: number): Promise<{ newBalance: number }> {
    const item = await this.repo.findCatalogItem(itemKey);
    if (!item) throw new Error("unknown item");
    if (item.gemPrice <= 0) throw new Error("not purchasable with gems");
    if (await this.repo.owns(characterId, itemKey)) throw new Error("already owned");
    if (!this.db) throw new Error("CosmeticService requires a Drizzle db handle");
    return await this.db.transaction(async (tx) => {
      // One guarded UPDATE: two buys at once can't both spend the same gems.
      const [ch] = await tx
        .update(characters)
        .set({ gems: sql`${characters.gems} - ${item.gemPrice}` })
        .where(and(eq(characters.id, characterId), gte(characters.gems, item.gemPrice)))
        .returning({ gems: characters.gems });
      if (!ch) throw new Error("insufficient gems");
      await tx.insert(cosmeticOwnerships).values({ characterId, itemKey, source: "gem" });
      await tx.insert(gemTransactions).values({ characterId, delta: -item.gemPrice, source: "spend", packKey: null, stripeSessionId: null });
      this.analytics.track("cosmetic_bought_gems", { itemKey, price: item.gemPrice }, userId);
      return { newBalance: ch.gems };
    });
  }

  async grantSponsorHat(characterId: number, sponsorId: number, hatItemKey: string, userId?: number): Promise<{ granted: boolean }> {
    if (await this.repo.owns(characterId, hatItemKey)) return { granted: false };
    await this.repo.grantOwnership(characterId, hatItemKey, "sponsor");
    this.analytics.track("sponsor_hat_granted", { sponsorId, hatItemKey }, userId);
    return { granted: true };
  }

  async equip(characterId: number, slot: CosmeticSlot, itemKey: string, userId?: number): Promise<void> {
    if (!(await this.repo.owns(characterId, itemKey))) throw new Error("not owned");
    await this.repo.equip(characterId, slot, itemKey);
    this.analytics.track("cosmetic_equipped", { slot, itemKey }, userId);
  }

  async unequip(characterId: number, slot: CosmeticSlot, userId?: number): Promise<void> {
    await this.repo.unequip(characterId, slot);
    this.analytics.track("cosmetic_unequipped", { slot }, userId);
  }

  async listEquipped(characterId: number): Promise<Array<{ slot: string; itemKey: string }>> {
    return this.repo.listEquipped(characterId);
  }

  async findItem(itemKey: string): Promise<CosmeticItem | null> {
    return this.repo.findCatalogItem(itemKey);
  }
}

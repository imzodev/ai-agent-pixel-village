// Drizzle adapter for the InventoryRepository port.

import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { InventoryRow } from "@/types/domain";
import type { InventoryRepository } from "@/types/ports";
import { inventory } from "@/db/schema";

export class DrizzleInventoryRepo implements InventoryRepository {
  constructor(private db: NodePgDatabase) {}

  async listForCharacter(characterId: number): Promise<InventoryRow[]> {
    return (await this.db.select().from(inventory).where(eq(inventory.characterId, characterId))) as InventoryRow[];
  }

  async add(characterId: number, itemKey: string, qty: number, meta: Record<string, unknown> = {}): Promise<void> {
    await this.db.insert(inventory).values({ characterId, itemKey, qty, meta });
  }

  async removeOne(characterId: number, itemKey: string): Promise<void> {
    const [row] = await this.db
      .select()
      .from(inventory)
      .where(and(eq(inventory.characterId, characterId), eq(inventory.itemKey, itemKey)))
      .limit(1);
    if (!row) return;
    await this.db.delete(inventory).where(eq(inventory.id, row.id));
  }

  async setEquipped(inventoryId: number, equipped: boolean): Promise<void> {
    await this.db.update(inventory).set({ equipped }).where(eq(inventory.id, inventoryId));
  }
}

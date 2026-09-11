// Drizzle adapter for the GroundItemRepository port.

import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { GroundItem } from "@/types/domain";
import type { GroundItemRepository } from "@/types/ports";
import { groundItems } from "@/db/schema";

export class DrizzleGroundItemRepo implements GroundItemRepository {
  constructor(private db: NodePgDatabase) {}

  async list(): Promise<GroundItem[]> {
    return (await this.db.select().from(groundItems)) as GroundItem[];
  }

  async create(input: Omit<GroundItem, "id" | "createdAt">): Promise<GroundItem> {
    const [row] = await this.db.insert(groundItems).values(input).returning();
    return row as GroundItem;
  }

  async deleteById(id: number): Promise<void> {
    await this.db.delete(groundItems).where(eq(groundItems.id, id));
  }
}

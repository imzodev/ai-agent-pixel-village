// Drizzle adapter for the ItemRepository port.

import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Item } from "@/types/domain";
import type { ItemRepository } from "@/types/ports";
import { items } from "@/db/schema";

export class DrizzleItemRepo implements ItemRepository {
  constructor(private db: NodePgDatabase) {}

  async findByKey(key: string): Promise<Item | null> {
    const [row] = await this.db.select().from(items).where(eq(items.key, key)).limit(1);
    return (row as Item | undefined) ?? null;
  }

  async list(): Promise<Item[]> {
    return (await this.db.select().from(items)) as Item[];
  }
}

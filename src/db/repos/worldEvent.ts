// Drizzle adapter for the WorldEventRepository port.

import { desc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { WorldEvent } from "@/types/domain";
import type { WorldEventRepository } from "@/types/ports";
import { worldEvents } from "@/db/schema";

export class DrizzleWorldEventRepo implements WorldEventRepository {
  constructor(private db: NodePgDatabase) {}

  async listRecent(limit: number): Promise<WorldEvent[]> {
    return (await this.db.select().from(worldEvents).orderBy(desc(worldEvents.createdAt)).limit(limit)) as WorldEvent[];
  }

  async create(input: Omit<WorldEvent, "id" | "createdAt">): Promise<WorldEvent> {
    const [row] = await this.db.insert(worldEvents).values(input).returning();
    return row as WorldEvent;
  }
}

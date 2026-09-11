// Drizzle adapter for the WorldStateRepository port.

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { WorldState } from "@/types/domain";
import type { WorldStateRepository } from "@/types/ports";
import { worldState } from "@/db/schema";
import { eq } from "drizzle-orm";

export class DrizzleWorldStateRepo implements WorldStateRepository {
  constructor(private db: NodePgDatabase) {}

  async get(): Promise<WorldState> {
    const [row] = await this.db.select().from(worldState).where(eq(worldState.id, 1)).limit(1);
    return row as WorldState;
  }

  async updateTick(at: Date): Promise<void> {
    await this.db.update(worldState).set({ lastTickAt: at }).where(eq(worldState.id, 1));
  }
}

// Drizzle adapter for the NpcRepository port.

import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Npc } from "@/types/domain";
import type { NpcRepository } from "@/types/ports";
import { npcs } from "@/db/schema";

export class DrizzleNpcRepo implements NpcRepository {
  constructor(private db: NodePgDatabase) {}

  async list(): Promise<Npc[]> {
    return (await this.db.select().from(npcs).where(eq(npcs.active, true))) as Npc[];
  }

  async findById(id: number): Promise<Npc | null> {
    const [row] = await this.db.select().from(npcs).where(eq(npcs.id, id)).limit(1);
    return (row as Npc | undefined) ?? null;
  }
}

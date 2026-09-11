// Drizzle adapter for the MissionRepository port.

import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Mission } from "@/types/domain";
import type { MissionRepository } from "@/types/ports";
import { missions } from "@/db/schema";

export class DrizzleMissionRepo implements MissionRepository {
  constructor(private db: NodePgDatabase) {}

  async list(): Promise<Mission[]> {
    return (await this.db.select().from(missions).where(eq(missions.active, true))) as Mission[];
  }

  async findById(id: number): Promise<Mission | null> {
    const [row] = await this.db.select().from(missions).where(eq(missions.id, id)).limit(1);
    return (row as Mission | undefined) ?? null;
  }

  async listForNpc(npcId: number): Promise<Mission[]> {
    return (await this.db.select().from(missions).where(eq(missions.npcId, npcId))) as Mission[];
  }
}

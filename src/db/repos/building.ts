// Drizzle adapter for the BuildingRepository port.

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Building } from "@/types/domain";
import type { BuildingRepository } from "@/types/ports";
import { buildings } from "@/db/schema";
import { eq } from "drizzle-orm";

export class DrizzleBuildingRepo implements BuildingRepository {
  constructor(private db: NodePgDatabase) {}

  async list(): Promise<Building[]> {
    return (await this.db.select().from(buildings)) as Building[];
  }

  async findByKey(key: string): Promise<Building | null> {
    const [row] = await this.db.select().from(buildings).where(eq(buildings.key, key)).limit(1);
    return (row as Building | undefined) ?? null;
  }
}

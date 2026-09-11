// Drizzle adapter for the EnemyRepository port.

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Enemy } from "@/types/domain";
import type { EnemyRepository } from "@/types/ports";
import { enemies } from "@/db/schema";

export class DrizzleEnemyRepo implements EnemyRepository {
  constructor(private db: NodePgDatabase) {}

  async list(): Promise<Enemy[]> {
    return (await this.db.select().from(enemies)) as Enemy[];
  }
}

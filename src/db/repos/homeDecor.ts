// Drizzle adapter for the HomeDecorRepository port.

import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { HomeDecor } from "@/types/domain";
import type { HomeDecorRepository } from "@/types/ports";
import { homeDecor } from "@/db/schema";

export class DrizzleHomeDecorRepo implements HomeDecorRepository {
  constructor(private db: NodePgDatabase) {}

  async listForCharacter(characterId: number): Promise<HomeDecor[]> {
    return (await this.db.select().from(homeDecor).where(eq(homeDecor.characterId, characterId))) as HomeDecor[];
  }
}

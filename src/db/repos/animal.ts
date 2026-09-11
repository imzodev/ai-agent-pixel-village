// Drizzle adapter for the AnimalRepository port.

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Animal } from "@/types/domain";
import type { AnimalRepository } from "@/types/ports";
import { animals } from "@/db/schema";

export class DrizzleAnimalRepo implements AnimalRepository {
  constructor(private db: NodePgDatabase) {}

  async list(): Promise<Animal[]> {
    return (await this.db.select().from(animals)) as Animal[];
  }
}

// Drizzle adapter for the ResourceNodeRepository port.

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { ResourceNode } from "@/types/domain";
import type { ResourceNodeRepository } from "@/types/ports";
import { resourceNodes } from "@/db/schema";

export class DrizzleResourceNodeRepo implements ResourceNodeRepository {
  constructor(private db: NodePgDatabase) {}

  async list(): Promise<ResourceNode[]> {
    return (await this.db.select().from(resourceNodes)) as ResourceNode[];
  }
}

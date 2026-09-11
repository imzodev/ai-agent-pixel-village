// Drizzle adapter for the WorldChatRepository port.

import { desc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { WorldChat } from "@/types/domain";
import type { WorldChatRepository } from "@/types/ports";
import { worldChat } from "@/db/schema";

export class DrizzleWorldChatRepo implements WorldChatRepository {
  constructor(private db: NodePgDatabase) {}

  async listRecent(limit: number): Promise<WorldChat[]> {
    return (await this.db.select().from(worldChat).orderBy(desc(worldChat.createdAt)).limit(limit)) as WorldChat[];
  }

  async create(input: Omit<WorldChat, "id" | "createdAt">): Promise<WorldChat> {
    const [row] = await this.db.insert(worldChat).values(input).returning();
    return row as WorldChat;
  }
}

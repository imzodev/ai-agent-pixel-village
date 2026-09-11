// Drizzle adapter for the ConversationRepository port.

import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Conversation } from "@/types/domain";
import type { ConversationRepository } from "@/types/ports";
import { conversations } from "@/db/schema";

export class DrizzleConversationRepo implements ConversationRepository {
  constructor(private db: NodePgDatabase) {}

  async listFor(characterId: number, npcId: number, limit: number): Promise<Conversation[]> {
    return (await this.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.characterId, characterId), eq(conversations.npcId, npcId)))
      .orderBy(desc(conversations.createdAt))
      .limit(limit)) as Conversation[];
  }

  async append(characterId: number, npcId: number, role: "player" | "npc", text: string): Promise<void> {
    await this.db.insert(conversations).values({ characterId, npcId, role, text });
  }
}

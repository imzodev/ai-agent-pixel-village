// Drizzle adapter for the CharacterRepository port.

import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Character } from "@/types/domain";
import type { CharacterRepository } from "@/types/ports";
import { characters } from "@/db/schema";

export class DrizzleCharacterRepo implements CharacterRepository {
  constructor(private db: NodePgDatabase) {}

  async findById(id: number): Promise<Character | null> {
    const [row] = await this.db.select().from(characters).where(eq(characters.id, id)).limit(1);
    return (row as Character | undefined) ?? null;
  }

  async findByUserId(userId: number): Promise<Character | null> {
    const [row] = await this.db.select().from(characters).where(eq(characters.userId, userId)).limit(1);
    return (row as Character | undefined) ?? null;
  }

  async updatePosition(id: number, x: number, y: number, facing: string): Promise<void> {
    await this.db
      .update(characters)
      .set({ x, y, facing, lastSeenAt: new Date() })
      .where(eq(characters.id, id));
  }

  async touchLastSeen(id: number): Promise<void> {
    await this.db.update(characters).set({ lastSeenAt: new Date() }).where(eq(characters.id, id));
  }
}

// Drizzle adapter for the gem economy. Reads/writes the `gems` column on
// characters and the gem_transactions audit log.

import { desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { GemTransaction, GemPackKey } from "@/types/cosmetic";
import { characters, gemTransactions } from "@/db/schema";

export class DrizzleGemRepo {
  constructor(private db: NodePgDatabase) {}

  async getBalance(characterId: number): Promise<number> {
    const [row] = await this.db.select({ gems: characters.gems }).from(characters).where(eq(characters.id, characterId)).limit(1);
    return row?.gems ?? 0;
  }

  /** Atomic: increments gems and writes an audit row in the same transaction. */
  async credit(
    characterId: number,
    delta: number,
    source: GemTransaction["source"],
    packKey: GemPackKey | null,
    stripeSessionId: string | null,
  ): Promise<{ balance: number }> {
    return await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(characters)
        .set({ gems: (await this.getBalance(characterId)) + delta })
        .where(eq(characters.id, characterId))
        .returning({ gems: characters.gems });
      await tx.insert(gemTransactions).values({ characterId, delta, source, packKey, stripeSessionId });
      return { balance: updated?.gems ?? 0 };
    });
  }

  /** Atomic: decrements gems (must not go negative); returns the new balance. */
  async debit(
    characterId: number,
    delta: number,
    source: GemTransaction["source"],
  ): Promise<{ balance: number; ok: true } | { balance: number; ok: false }> {
    return await this.db.transaction(async (tx) => {
      const current = await this.getBalance(characterId);
      if (current < delta) return { balance: current, ok: false };
      const [updated] = await tx
        .update(characters)
        .set({ gems: current - delta })
        .where(eq(characters.id, characterId))
        .returning({ gems: characters.gems });
      await tx.insert(gemTransactions).values({ characterId, delta: -delta, source, packKey: null, stripeSessionId: null });
      return { balance: updated?.gems ?? current - delta, ok: true };
    });
  }

  async listTransactions(characterId: number, limit: number): Promise<GemTransaction[]> {
    return (await this.db
      .select()
      .from(gemTransactions)
      .where(eq(gemTransactions.characterId, characterId))
      .orderBy(desc(gemTransactions.createdAt))
      .limit(limit)) as GemTransaction[];
  }
}

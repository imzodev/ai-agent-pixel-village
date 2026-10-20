// Drizzle adapter for the gem economy. Reads/writes the `gems` column on
// characters and the gem_transactions audit log.

import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { GemTransaction, GemPackKey } from "@/types/cosmetic";
import { characters, gemTransactions } from "@/db/schema";

export class DrizzleGemRepo {
  constructor(private db: NodePgDatabase) {}

  async getBalance(characterId: number): Promise<number> {
    const [row] = await this.db.select({ gems: characters.gems }).from(characters).where(eq(characters.id, characterId)).limit(1);
    return row?.gems ?? 0;
  }

  /**
   * Atomic: increments gems and writes an audit row in the same transaction.
   * Idempotent on stripeSessionId (unique index): a redelivered webhook finds
   * its audit row already there and credits nothing.
   */
  async credit(
    characterId: number,
    delta: number,
    source: GemTransaction["source"],
    packKey: GemPackKey | null,
    stripeSessionId: string | null,
  ): Promise<{ balance: number; duplicate: boolean }> {
    return await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(gemTransactions)
        .values({ characterId, delta, source, packKey, stripeSessionId })
        .onConflictDoNothing({ target: gemTransactions.stripeSessionId })
        .returning({ id: gemTransactions.id });
      if (!inserted.length) {
        const [row] = await tx.select({ gems: characters.gems }).from(characters).where(eq(characters.id, characterId)).limit(1);
        return { balance: row?.gems ?? 0, duplicate: true };
      }
      const [updated] = await tx
        .update(characters)
        .set({ gems: sql`${characters.gems} + ${delta}` })
        .where(eq(characters.id, characterId))
        .returning({ gems: characters.gems });
      return { balance: updated?.gems ?? 0, duplicate: false };
    });
  }

  /** Atomic: decrements gems (never below zero) and writes an audit row; returns the new balance. */
  async debit(
    characterId: number,
    delta: number,
    source: GemTransaction["source"],
  ): Promise<{ balance: number; ok: true } | { balance: number; ok: false }> {
    return await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(characters)
        .set({ gems: sql`${characters.gems} - ${delta}` })
        .where(and(eq(characters.id, characterId), gte(characters.gems, delta)))
        .returning({ gems: characters.gems });
      if (!updated) {
        const [row] = await tx.select({ gems: characters.gems }).from(characters).where(eq(characters.id, characterId)).limit(1);
        return { balance: row?.gems ?? 0, ok: false };
      }
      await tx.insert(gemTransactions).values({ characterId, delta: -delta, source, packKey: null, stripeSessionId: null });
      return { balance: updated.gems, ok: true };
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

// Drizzle adapter for the daily quest + streak tables.

import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { DailyQuest, StreakState } from "@/types/quest";
import { dailyQuests, streakStates } from "@/db/schema";

export class DrizzleQuestRepo {
  constructor(private db: NodePgDatabase) {}

  // --- daily quests ---
  async listForDate(characterId: number, forDate: string): Promise<DailyQuest[]> {
    return (await this.db
      .select()
      .from(dailyQuests)
      .where(and(eq(dailyQuests.characterId, characterId), eq(dailyQuests.forDate, forDate)))) as DailyQuest[];
  }

  async insertQuests(rows: Array<Omit<DailyQuest, "id" | "createdAt" | "completedAt">>): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insert(dailyQuests).values(rows);
  }

  async setProgress(questId: number, progress: number): Promise<void> {
    await this.db.update(dailyQuests).set({ progress }).where(eq(dailyQuests.id, questId));
  }

  async markCompleted(questId: number): Promise<void> {
    await this.db.update(dailyQuests).set({ status: "completed", completedAt: new Date() }).where(eq(dailyQuests.id, questId));
  }

  // --- streaks ---
  async getStreak(characterId: number): Promise<StreakState | null> {
    const [row] = await this.db.select().from(streakStates).where(eq(streakStates.characterId, characterId)).limit(1);
    return (row as StreakState | undefined) ?? null;
  }

  async upsertStreak(s: StreakState): Promise<void> {
    await this.db
      .insert(streakStates)
      .values(s)
      .onConflictDoUpdate({
        target: streakStates.characterId,
        set: {
          current: s.current,
          longest: s.longest,
          lastCompletedOn: s.lastCompletedOn,
          graceUsedOn: s.graceUsedOn,
        },
      });
  }

  /** Reads character gems/coins for reward application. */
  async applyCharacterDelta(characterId: number, gems: number, coins: number, xp: number): Promise<void> {
    // Single SQL update with sql`` expressions — atomic and one round trip.
    await this.db.execute(sql`
      UPDATE characters
      SET gems = gems + ${gems},
          coins = coins + ${coins},
          xp = xp + ${xp}
      WHERE id = ${characterId}
    `);
  }
}

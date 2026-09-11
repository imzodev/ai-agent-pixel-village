// Drizzle adapter for activities + participants.

import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Activity, ActivityParticipant } from "@/types/activity";
import { activities, activityParticipants } from "@/db/schema";

export class DrizzleActivityRepo {
  constructor(private db: NodePgDatabase) {}

  async listLive(): Promise<Activity[]> {
    return (await this.db.select().from(activities).where(eq(activities.status, "live"))) as Activity[];
  }

  async findById(id: number): Promise<Activity | null> {
    const [row] = await this.db.select().from(activities).where(eq(activities.id, id)).limit(1);
    if (!row) return null;
    const participants = (await this.db
      .select()
      .from(activityParticipants)
      .where(eq(activityParticipants.activityId, id))) as ActivityParticipant[];
    return { ...(row as Activity), participants };
  }

  async join(activityId: number, characterId: number): Promise<void> {
    await this.db.insert(activityParticipants).values({ activityId, characterId });
  }

  async leave(activityId: number, characterId: number): Promise<void> {
    await this.db
      .delete(activityParticipants)
      .where(and(eq(activityParticipants.activityId, activityId), eq(activityParticipants.characterId, characterId)));
  }

  async updateParticipantState(
    activityId: number,
    characterId: number,
    state: Record<string, unknown>,
    score: number | null,
  ): Promise<void> {
    await this.db
      .update(activityParticipants)
      .set({ state, score })
      .where(and(eq(activityParticipants.activityId, activityId), eq(activityParticipants.characterId, characterId)));
  }

  async setStatus(activityId: number, status: Activity["status"]): Promise<void> {
    await this.db.update(activities).set({ status }).where(eq(activities.id, activityId));
  }

  /** Returns the activity's participant count. Used by capacity checks. */
  async countParticipants(activityId: number): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(activityParticipants)
      .where(eq(activityParticipants.activityId, activityId));
    return row?.n ?? 0;
  }
}

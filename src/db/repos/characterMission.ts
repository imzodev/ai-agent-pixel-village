// Drizzle adapter for the CharacterMissionRepository port.

import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { CharacterMission } from "@/types/domain";
import type { CharacterMissionRepository } from "@/types/ports";
import { characterMissions } from "@/db/schema";

export class DrizzleCharacterMissionRepo implements CharacterMissionRepository {
  constructor(private db: NodePgDatabase) {}

  async listForCharacter(characterId: number): Promise<CharacterMission[]> {
    return (await this.db
      .select()
      .from(characterMissions)
      .where(eq(characterMissions.characterId, characterId))) as CharacterMission[];
  }

  async find(characterId: number, missionId: number): Promise<CharacterMission | null> {
    const [row] = await this.db
      .select()
      .from(characterMissions)
      .where(and(eq(characterMissions.characterId, characterId), eq(characterMissions.missionId, missionId)))
      .limit(1);
    return (row as CharacterMission | undefined) ?? null;
  }

  async accept(characterId: number, missionId: number): Promise<CharacterMission> {
    const [row] = await this.db
      .insert(characterMissions)
      .values({ characterId, missionId, status: "active" })
      .returning();
    return row as CharacterMission;
  }

  async complete(characterId: number, missionId: number): Promise<void> {
    await this.db
      .update(characterMissions)
      .set({ status: "completed", completedAt: new Date() })
      .where(and(eq(characterMissions.characterId, characterId), eq(characterMissions.missionId, missionId)));
  }

  async increment(characterId: number, missionId: number, by: number): Promise<CharacterMission> {
    const existing = await this.find(characterId, missionId);
    if (!existing) throw new Error(`mission ${missionId} not accepted by character ${characterId}`);
    const [updated] = await this.db
      .update(characterMissions)
      .set({ progress: existing.progress + by })
      .where(eq(characterMissions.id, existing.id))
      .returning();
    return updated as CharacterMission;
  }
}

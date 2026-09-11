// Daily quest service. Picks templates for the day, persists them, tracks
// progress from gameplay events, and handles completion + streak math.

import type { CharacterRepository } from "@/types/ports";
import type { AnalyticsPort } from "@/types/ports";
import type { DrizzleQuestRepo } from "@/db/repos/quest";
import type { DailyQuest, QuestRequirement, QuestTemplate, StreakState } from "@/types/quest";
import { QUEST_TEMPLATES } from "./QuestTemplates";
import type { DrizzleGemRepo } from "@/db/repos/gem";

const utcDate = (d: Date = new Date()) => d.toISOString().slice(0, 10);

export class QuestService {
  constructor(
    private repo: DrizzleQuestRepo,
    private characters: CharacterRepository,
    private analytics: AnalyticsPort,
    private gems: DrizzleGemRepo,
  ) {}

  /** Idempotent: returns today's 3 quests, generating them on first call. */
  async getOrCreateTodaysQuests(characterId: number): Promise<DailyQuest[]> {
    const today = utcDate();
    const existing = await this.repo.listForDate(characterId, today);
    if (existing.length > 0) return existing;
    const picked = pickThreeQuests();
    await this.repo.insertQuests(
      picked.map((tpl) => ({
        characterId,
        forDate: today,
        templateKey: tpl.key,
        title: tpl.title,
        description: tpl.description,
        requirement: tpl.requirement,
        reward: tpl.reward,
        progress: 0,
        status: "active",
      })),
    );
    return this.repo.listForDate(characterId, today);
  }

  /** Apply progress from a gameplay event. Called from /api/world, /api/act, etc. */
  async recordEvent(characterId: number, evt: { kind: "collect" | "pet" | "talk" | "visit" | "spend_coins"; payload: Record<string, number | string> }): Promise<DailyQuest[]> {
    const quests = await this.repo.listForDate(characterId, utcDate());
    const updated: DailyQuest[] = [];
    for (const q of quests) {
      if (q.status !== "active") continue;
      const matches = questEventMatches(q.requirement, evt);
      if (!matches) continue;
      await this.repo.setProgress(q.id, q.progress + 1);
      const target = targetOf(q.requirement);
      if (target !== null && q.progress + 1 >= target) await this.completeQuest(characterId, q.id);
      updated.push({ ...q, progress: q.progress + 1 });
    }
    return updated;
  }

  async completeQuest(characterId: number, questId: number): Promise<DailyQuest | null> {
    await this.repo.markCompleted(questId);
    await this.applyReward(characterId, questId);
    await this.bumpStreak(characterId);
    this.analytics.track("daily_quest_completed", { questId });
    return (await this.repo.listForDate(characterId, utcDate())).find((q) => q.id === questId) ?? null;
  }

  private async applyReward(characterId: number, questId: number) {
    const quest = (await this.repo.listForDate(characterId, utcDate())).find((q) => q.id === questId);
    if (!quest) return;
    const r = quest.reward;
    if (r.coins || r.xp || r.gems) {
      await this.repo.applyCharacterDelta(characterId, r.gems ?? 0, r.coins ?? 0, r.xp ?? 0);
    }
    // Cosmetic rewards are handled by the CosmeticService.grant path; here we
    // just grant ownership directly to keep quest completion independent.
    for (const itemKey of r.itemKeys ?? []) {
      // import lazily to avoid a cycle through the composition root
      const { cosmeticOwnerships } = await import("@/db/schema");
      await import("@/db").then(async ({ db }) => {
        await db.insert(cosmeticOwnerships).values({ characterId, itemKey, source: "seasonal" });
      });
    }
  }

  private async bumpStreak(characterId: number): Promise<void> {
    const today = utcDate();
    const existing = (await this.repo.getStreak(characterId)) ?? {
      characterId,
      current: 0,
      longest: 0,
      lastCompletedOn: null,
      graceUsedOn: null,
    } satisfies StreakState;
    let current = existing.current;
    let graceUsedOn = existing.graceUsedOn;
    if (existing.lastCompletedOn === today) {
      // already counted today — no-op
      return;
    }
    if (existing.lastCompletedOn && isYesterday(existing.lastCompletedOn, today)) {
      current += 1;
    } else if (existing.lastCompletedOn && !isYesterday(existing.lastCompletedOn, today)) {
      // streak broken; allow one grace per month
      const month = today.slice(0, 7);
      if (existing.graceUsedOn !== month) {
        current = 1;
        graceUsedOn = month;
      } else {
        current = 1;
      }
    } else {
      current = 1;
    }
    await this.repo.upsertStreak({
      characterId,
      current,
      longest: Math.max(existing.longest, current),
      lastCompletedOn: today,
      graceUsedOn,
    });
  }

  async getStreak(characterId: number): Promise<StreakState | null> {
    return this.repo.getStreak(characterId);
  }
}

function pickThreeQuests(): QuestTemplate[] {
  const pool = [...QUEST_TEMPLATES];
  const picked: QuestTemplate[] = [];
  while (picked.length < 3 && pool.length > 0) {
    const totalWeight = pool.reduce((s, q) => s + q.weight, 0);
    let r = Math.random() * totalWeight;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight;
      if (r <= 0) {
        picked.push(pool[i]);
        pool.splice(i, 1);
        break;
      }
    }
  }
  return picked;
}

function targetOf(req: QuestRequirement): number | null {
  switch (req.type) {
    case "collect": return req.qty;
    case "pet": return req.qty;
    case "spend_coins": return req.amount;
    case "talk":
    case "visit":
      return 1;
  }
}

function questEventMatches(req: QuestRequirement, evt: { kind: string; payload: Record<string, number | string> }): boolean {
  if (req.type !== evt.kind) return false;
  switch (req.type) {
    case "collect": return evt.payload.itemKey === req.itemKey;
    case "pet": return evt.payload.species === req.species;
    case "talk": return evt.payload.npcKey === req.npcKey;
    case "visit": return evt.payload.buildingKey === req.buildingKey;
    case "spend_coins": return true;
  }
}

function isYesterday(prev: string, today: string): boolean {
  const a = new Date(prev + "T00:00:00Z").getTime();
  const b = new Date(today + "T00:00:00Z").getTime();
  return b - a === 86400_000;
}

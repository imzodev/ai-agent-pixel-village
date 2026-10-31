// "First steps" is a starter-only daily quest: only characters who never had
// daily quests before today may draw it (QuestService.getOrCreateTodaysQuests).
import { describe, expect, it } from "vitest";
import { QuestService, pickThreeQuests } from "@/services/QuestService";
import type { DrizzleQuestRepo } from "@/db/repos/quest";
import type { DailyQuest } from "@/types/quest";

const STARTER = "starter_first_steps";

function fakeRepo(earlier: boolean) {
  const rows: DailyQuest[] = [];
  return {
    rows,
    repo: {
      listForDate: async (characterId: number, forDate: string) => rows.filter((q) => q.characterId === characterId && q.forDate === forDate),
      hasQuestsBefore: async () => earlier,
      insertQuests: async (add: Omit<DailyQuest, "id" | "createdAt" | "completedAt">[]) => {
        for (const q of add) rows.push({ ...q, id: rows.length + 1, createdAt: new Date(), completedAt: null } as DailyQuest);
      },
    } as unknown as DrizzleQuestRepo,
  };
}

const service = (repo: DrizzleQuestRepo) => new QuestService(repo, {} as never, {} as never, {} as never);

describe("starter quest", () => {
  it("is never picked for a returning character", () => {
    for (let i = 0; i < 500; i++) expect(pickThreeQuests(false).map((q) => q.key)).not.toContain(STARTER);
  });

  it("can be picked for a newcomer", () => {
    let seen = false;
    for (let i = 0; i < 500 && !seen; i++) seen = pickThreeQuests(true).some((q) => q.key === STARTER);
    expect(seen).toBe(true);
  });

  it("a veteran's new day has no starter quest", async () => {
    for (let i = 0; i < 100; i++) {
      const { repo } = fakeRepo(true);
      const quests = await service(repo).getOrCreateTodaysQuests(7);
      expect(quests).toHaveLength(3);
      expect(quests.map((q) => q.templateKey)).not.toContain(STARTER);
    }
  });

  it("today's quests are made once", async () => {
    const { repo, rows } = fakeRepo(false);
    const s = service(repo);
    const first = await s.getOrCreateTodaysQuests(7);
    const again = await s.getOrCreateTodaysQuests(7);
    expect(again.map((q) => q.id)).toEqual(first.map((q) => q.id));
    expect(rows).toHaveLength(3);
  });
});

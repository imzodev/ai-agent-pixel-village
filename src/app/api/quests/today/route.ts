// GET /api/quests/today — returns the current character's 3 daily quests +
// streak state. Generates on first call.

import { NextResponse } from "next/server";
import { getContainer } from "@/lib/container";
import { requireCharacter, handleApiError } from "@/lib/auth";

export async function GET() {
  try {
    const ch = await requireCharacter();
    const c = getContainer();
    const [quests, streak] = await Promise.all([
      c.services.quest.getOrCreateTodaysQuests(ch.id),
      c.services.quest.getStreak(ch.id),
    ]);
    return NextResponse.json({
      quests: quests.map((q) => ({
        id: q.id,
        title: q.title,
        description: q.description,
        requirement: q.requirement,
        reward: q.reward,
        progress: q.progress,
        status: q.status,
        forDate: q.forDate,
      })),
      streak,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

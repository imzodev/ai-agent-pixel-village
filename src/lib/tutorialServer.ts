// Server side of the guided first session: advance a character's step when
// a matching event happens (called from the routes that already handle
// talking, planting, gathering, fighting and selling) and pay out rewards.

import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { characters } from "@/db/schema";
import { addCoins, addItem } from "./game";
import { TUTORIAL_DONE, TUTORIAL_SKIPPED, TUTORIAL_STEPS, stepMatches, type TutorialEventKind } from "./tutorial";

/**
 * Count an event toward the current tutorial step. Returns a short message
 * when a step completes (with its rewards), otherwise null. Cheap for the
 * many players who are done: one indexed read.
 */
export async function tutorialEvent(
  characterId: number,
  kind: TutorialEventKind,
  detail: { npcKey?: string; itemKey?: string; enemyKind?: string } = {},
  qty = 1,
): Promise<string | null> {
  const [c] = await db
    .select({ step: characters.tutorialStep, progress: characters.tutorialProgress, title: characters.title })
    .from(characters)
    .where(and(eq(characters.id, characterId), lt(characters.tutorialStep, TUTORIAL_STEPS.length)));
  if (!c) return null;
  const step = TUTORIAL_STEPS[c.step];
  if (!step || !stepMatches(step, kind, detail)) return null;
  const progress = c.progress + qty;
  if (progress < step.qty) {
    await db.update(characters).set({ tutorialProgress: progress }).where(and(eq(characters.id, characterId), eq(characters.tutorialStep, c.step)));
    return null;
  }
  // Complete the step (guarded on the step so a double event pays once).
  const next = c.step + 1 >= TUTORIAL_STEPS.length ? TUTORIAL_DONE : c.step + 1;
  const done = await db
    .update(characters)
    .set({ tutorialStep: next, tutorialProgress: 0, ...(step.reward.title && !c.title ? { title: step.reward.title } : {}) })
    .where(and(eq(characters.id, characterId), eq(characters.tutorialStep, c.step)))
    .returning({ id: characters.id });
  if (done.length === 0) return null;
  if (step.reward.coins) await addCoins(characterId, step.reward.coins);
  for (const it of step.reward.items ?? []) await addItem(characterId, it.itemKey, it.qty);
  const parts = [
    ...(step.reward.coins ? [`${step.reward.coins} coins`] : []),
    ...(step.reward.items ?? []).map((i) => `${i.qty > 1 ? `${i.qty}× ` : ""}${i.itemKey.replace(/_/g, " ")}`),
    ...(step.reward.title ? [`the title “${step.reward.title}”`] : []),
  ];
  return `✅ ${step.title}! You got ${parts.join(", ")}.`;
}

/** Skip the tutorial (only while it's still running). */
export async function skipTutorial(characterId: number): Promise<void> {
  await db
    .update(characters)
    .set({ tutorialStep: TUTORIAL_SKIPPED, tutorialProgress: 0 })
    .where(and(eq(characters.id, characterId), lt(characters.tutorialStep, TUTORIAL_STEPS.length)));
}


// The journey, server side: measure the current goal from the player's own
// state, pay it out and move on when it's met (checked on every /api/me, so
// it notices whatever the player just did, wherever they did it).

import { and, count, eq, gte, inArray, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { animals, characterBounties, characterCollection, characterMissions, characterWaystones, characters, homesteadParcels, inventory, lots, npcRegard } from "@/db/schema";
import { JOURNEY } from "@/lib/journey";
import { LAIR_BOSSES } from "@/lib/lairs";
import { TUTORIAL_STEPS } from "@/lib/tutorial";
import { addCoins, recalcLevel } from "@/lib/game";
import { track } from "@/lib/track";
import type { JourneyCheck, JourneyView } from "@/types/journey";

const one = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);

/** How much of a goal's check the player has, and how much it needs. */
async function measure(characterId: number, check: JourneyCheck, level: number): Promise<{ have: number; need: number }> {
  const coll = (kind: string) => and(eq(characterCollection.characterId, characterId), eq(characterCollection.kind, kind));
  switch (check.kind) {
    case "level": return { have: level, need: check.n };
    case "fishCaught": return { have: await one(db.select({ n: count() }).from(characterCollection).where(coll("fish"))), need: check.n };
    case "missionsDone": return { have: await one(db.select({ n: count() }).from(characterMissions).where(and(eq(characterMissions.characterId, characterId), eq(characterMissions.status, "completed")))), need: check.n };
    case "animalsOwned": return { have: await one(db.select({ n: count() }).from(animals).where(eq(animals.ownerId, characterId))), need: check.n };
    case "waystone": return { have: await one(db.select({ n: count() }).from(characterWaystones).where(and(eq(characterWaystones.characterId, characterId), eq(characterWaystones.key, check.key)))), need: 1 };
    case "ownsAnyItem": return { have: Math.min(1, await one(db.select({ n: count() }).from(inventory).where(and(eq(inventory.characterId, characterId), inArray(inventory.itemKey, check.itemKeys))))), need: 1 };
    case "bountiesDone": return { have: await one(db.select({ n: count() }).from(characterBounties).where(and(eq(characterBounties.characterId, characterId), eq(characterBounties.status, "done")))), need: check.n };
    case "pagesClaimed": return { have: await one(db.select({ n: count() }).from(characterCollection).where(coll("page"))), need: check.n };
    case "parcelsOwned": return { have: await one(db.select({ n: count() }).from(homesteadParcels).innerJoin(lots, eq(lots.id, homesteadParcels.lotId)).where(eq(lots.ownerId, characterId))), need: check.n };
    case "townsVisited": return { have: await one(db.select({ n: count() }).from(characterCollection).where(and(coll("region"), like(characterCollection.key, "town_%")))), need: check.n };
    case "dearFriends": return { have: await one(db.select({ n: count() }).from(npcRegard).where(and(eq(npcRegard.characterId, characterId), gte(npcRegard.score, 10)))), need: check.n };
    case "lairBosses": return { have: await one(db.select({ n: count() }).from(characterCollection).where(and(coll("enemy"), inArray(characterCollection.key, LAIR_BOSSES.map((b) => b.kind))))), need: check.n };
  }
}

/**
 * The player's current journey goal, after paying out any they've just met
 * (several at once if they were already ahead). Null while the tutorial is
 * still running, or once the journey is complete. `done` lists the goals
 * just completed, for a toast.
 */
export async function journeyFor(characterId: number): Promise<{ view: JourneyView | null; done: string[] }> {
  const [c] = await db.select({ step: characters.journeyStep, tutorial: characters.tutorialStep, level: characters.level }).from(characters).where(eq(characters.id, characterId));
  if (!c || c.tutorial < TUTORIAL_STEPS.length) return { view: null, done: [] };
  const done: string[] = [];
  let step = c.step, level = c.level;
  for (let guard = 0; step < JOURNEY.length && guard < JOURNEY.length; guard++) {
    const goal = JOURNEY[step];
    const m = await measure(characterId, goal.check, level);
    if (m.have < m.need) return { view: { step, total: JOURNEY.length, key: goal.key, title: goal.title, hint: goal.hint, have: m.have, need: m.need, reward: goal.reward, target: goal.target }, done };
    // Met: move on (guarded on the step, so two requests can't both pay).
    const won = await db.update(characters).set({ journeyStep: step + 1, xp: sql`${characters.xp} + ${goal.reward.xp}` })
      .where(and(eq(characters.id, characterId), eq(characters.journeyStep, step))).returning({ level: characters.level });
    if (!won.length) break;
    await addCoins(characterId, goal.reward.coins);
    await recalcLevel(characterId);
    track("journey_step", characterId, { goal: goal.key, step: step + 1 });
    done.push(`🧭 ${goal.title}! +${goal.reward.coins} 🪙 · +${goal.reward.xp} XP`);
    step++;
    const [now] = await db.select({ level: characters.level }).from(characters).where(eq(characters.id, characterId));
    level = now?.level ?? level;
  }
  return { view: null, done };
}

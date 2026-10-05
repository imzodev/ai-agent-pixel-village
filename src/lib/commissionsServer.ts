// Furniture commissions, the server part (rules: src/lib/commissions.ts):
// tickd posts and expires them; a turn-in closes it for everyone, pays from
// the NPC's purse when it has a mind, and grows the player's workshop.
// Safe for tickd: imports no seed code.

import { and, eq, inArray, like, ne } from "drizzle-orm";
import { db } from "@/db";
import { characterMissions, lots, missions, npcs } from "@/db/schema";
import { logEvent } from "@/lib/game";
import { adjustStock, remember } from "@/lib/mind/mindServer";
import { isMindNpc } from "@/lib/mind/config";
import { addFarmXp } from "@/lib/ranchServer";
import { COMMISSIONERS, COMMISSION_EVERY_MS, COMMISSION_TTL_MS, COMMISSION_XP, commissionFor, commissionKey, commissionPay, isCommissionKey, postedAt } from "@/lib/commissions";

let lastRun = 0;

/** Take closed commissions off the mission lists of players who accepted but didn't deliver. */
async function dropForOthers(missionIds: number[], winner: number | null): Promise<void> {
  if (!missionIds.length) return;
  await db.delete(characterMissions).where(and(
    inArray(characterMissions.missionId, missionIds), eq(characterMissions.status, "active"),
    ...(winner != null ? [ne(characterMissions.characterId, winner)] : []),
  ));
}

/** Every half hour: expire old commissions, and let NPCs without one post one. */
export async function tickCommissions(now = Date.now()): Promise<number> {
  if (now - lastRun < COMMISSION_EVERY_MS) return 0;
  lastRun = now;
  const open = await db.select({ id: missions.id, key: missions.key, npcId: missions.npcId }).from(missions)
    .where(and(eq(missions.active, true), like(missions.key, "com_%")));
  const stale = open.filter((m) => now - postedAt(m.key) > COMMISSION_TTL_MS);
  if (stale.length) {
    await db.update(missions).set({ active: false }).where(inArray(missions.id, stale.map((m) => m.id)));
    await dropForOthers(stale.map((m) => m.id), null); // nobody can deliver an expired order
  }
  const busy = new Set(open.filter((m) => !stale.includes(m)).map((m) => m.npcId));
  const people = await db.select({ id: npcs.id, key: npcs.key, name: npcs.name, active: npcs.active }).from(npcs).where(inArray(npcs.key, COMMISSIONERS.map((c) => c.npcKey)));
  const slot = Math.floor(now / COMMISSION_EVERY_MS);
  let posted = 0;
  for (const c of COMMISSIONERS) {
    const npc = people.find((p) => p.key === c.npcKey);
    if (!npc?.active || busy.has(npc.id)) continue;
    const wish = commissionFor(c, slot);
    if (!wish) continue;
    const pay = commissionPay(wish);
    const what = `${wish.qty} ${wish.item.replace(/_/g, " ")}${wish.qty > 1 && !wish.item.endsWith("s") ? "s" : ""}`;
    await db.insert(missions).values({
      key: commissionKey(c.npcKey, now), npcId: npc.id, title: `Commission: ${what} for ${npc.name}`,
      description: `${npc.name} has ordered ${what} from a carpenter. Make them in a workshop and deliver them within a day.`,
      offerLine: `I'm after ${what}, made properly. ${pay} coins if you can bring them within the day.`,
      completeLine: `Beautiful work! Just what I wanted. Here's your ${pay} coins.`,
      requirement: { type: "collect", itemKey: wish.item, qty: wish.qty }, reward: { coins: pay, xp: 20 }, repeatable: false, active: true,
    }).onConflictDoNothing();
    await logEvent("commission", `${npc.name} is looking for a carpenter: ${what}.`, "npc", npc.id);
    posted++;
  }
  return posted;
}

/**
 * A commission was delivered (the turn-in already claimed it, so it's
 * closed): clear it from everyone else who took it, pay, grow the workshop.
 */
export async function onCommissionDone(npc: typeof npcs.$inferSelect, mission: typeof missions.$inferSelect, characterId: number, playerName: string): Promise<void> {
  if (!isCommissionKey(mission.key)) return;
  await dropForOthers([mission.id], characterId);
  if (isMindNpc(npc.key)) {
    await adjustStock(npc.id, {}, -(mission.reward.coins ?? 0), true);
    await remember(npc.id, `${playerName} delivered the furniture they'd ordered.`);
  }
  const [shop] = await db.select({ key: lots.key }).from(lots).where(and(eq(lots.ownerId, characterId), eq(lots.kind, "workshop")));
  if (shop) await addFarmXp(shop.key, COMMISSION_XP);
}

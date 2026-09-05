import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  characterMissions,
  characters,
  inventory,
  leads,
  missions,
  sponsors,
  worldEvents,
  type MissionRequirement,
  type MissionReward,
} from "@/db/schema";

export async function addItem(characterId: number, itemKey: string, qty = 1, meta: Record<string, unknown> = {}) {
  const stackable = Object.keys(meta).length === 0;
  if (stackable) {
    const [existing] = await db
      .select()
      .from(inventory)
      .where(and(eq(inventory.characterId, characterId), eq(inventory.itemKey, itemKey), sql`${inventory.meta} = '{}'::jsonb`))
      .limit(1);
    if (existing) {
      await db.update(inventory).set({ qty: existing.qty + qty }).where(eq(inventory.id, existing.id));
      return existing.id;
    }
  }
  const [row] = await db.insert(inventory).values({ characterId, itemKey, qty, meta }).returning();
  return row.id;
}

export async function countItem(characterId: number, itemKey: string) {
  const [r] = await db
    .select({ n: sql<number>`coalesce(sum(${inventory.qty}), 0)::int` })
    .from(inventory)
    .where(and(eq(inventory.characterId, characterId), eq(inventory.itemKey, itemKey)));
  return r?.n ?? 0;
}

export async function removeItem(characterId: number, itemKey: string, qty: number) {
  let remaining = qty;
  const rows = await db
    .select()
    .from(inventory)
    .where(and(eq(inventory.characterId, characterId), eq(inventory.itemKey, itemKey)))
    .orderBy(inventory.id);
  for (const r of rows) {
    if (remaining <= 0) break;
    if (r.qty <= remaining) {
      await db.delete(inventory).where(eq(inventory.id, r.id));
      remaining -= r.qty;
    } else {
      await db.update(inventory).set({ qty: r.qty - remaining }).where(eq(inventory.id, r.id));
      remaining = 0;
    }
  }
  return remaining === 0;
}

export async function grantReward(characterId: number, reward: MissionReward) {
  for (const it of reward.items ?? []) await addItem(characterId, it.itemKey, it.qty);
  if (reward.coins || reward.xp) {
    await db
      .update(characters)
      .set({
        coins: sql`${characters.coins} + ${reward.coins ?? 0}`,
        xp: sql`${characters.xp} + ${reward.xp ?? 0}`,
      })
      .where(eq(characters.id, characterId));
    await recalcLevel(characterId);
  }
}

export async function recalcLevel(characterId: number) {
  const [c] = await db.select().from(characters).where(eq(characters.id, characterId));
  if (!c) return;
  const level = 1 + Math.floor(Math.sqrt(c.xp / 25));
  if (level !== c.level) {
    await db
      .update(characters)
      .set({ level, maxHp: 20 + (level - 1) * 5, hp: 20 + (level - 1) * 5 })
      .where(eq(characters.id, characterId));
    await logEvent("level", `${c.name} reached level ${level}!`, "character", characterId, c.x, c.y);
  }
}

/** Advance any active missions whose requirement matches the given event. */
export async function progressMissions(
  characterId: number,
  match: (req: MissionRequirement) => boolean,
  amount = 1,
) {
  const rows = await db
    .select({ cm: characterMissions, m: missions })
    .from(characterMissions)
    .innerJoin(missions, eq(missions.id, characterMissions.missionId))
    .where(and(eq(characterMissions.characterId, characterId), eq(characterMissions.status, "active")));
  const touched: string[] = [];
  for (const { cm, m } of rows) {
    if (!match(m.requirement)) continue;
    const target = requirementTarget(m.requirement);
    const progress = Math.min(target, cm.progress + amount);
    if (progress !== cm.progress) {
      await db.update(characterMissions).set({ progress }).where(eq(characterMissions.id, cm.id));
      touched.push(m.title);
    }
  }
  return touched;
}

export function requirementTarget(req: MissionRequirement) {
  return "qty" in req ? req.qty : 1;
}

/** Collect missions count what is in the inventory right now. */
export async function missionProgressFor(characterId: number, req: MissionRequirement, stored: number) {
  if (req.type === "collect") return Math.min(req.qty, await countItem(characterId, req.itemKey));
  return stored;
}

export async function emitLead(opts: {
  sponsorId: number;
  characterId: number;
  npcId?: number;
  kind: "discount_claimed" | "mission_completed" | "conversation";
  code?: string;
  note?: string;
}) {
  const [sp] = await db.select().from(sponsors).where(eq(sponsors.id, opts.sponsorId));
  if (!sp || sp.status !== "active") return null;
  const billable = opts.kind === "discount_claimed";
  const [lead] = await db
    .insert(leads)
    .values({
      sponsorId: opts.sponsorId,
      characterId: opts.characterId,
      npcId: opts.npcId,
      kind: opts.kind,
      code: opts.code,
      feeCents: billable ? sp.leadFeeCents : 0,
      note: opts.note ?? "",
    })
    .returning();
  return lead;
}

export async function logEvent(
  kind: string,
  text: string,
  subjectType?: string,
  subjectId?: number,
  x?: number,
  y?: number,
) {
  await db.insert(worldEvents).values({ kind, text, subjectType, subjectId, x, y });
}

export async function recentEvents(limit = 12, subjectType?: string, subjectId?: number) {
  const q = db.select().from(worldEvents).orderBy(desc(worldEvents.createdAt)).limit(limit);
  if (subjectType && subjectId) {
    return q.where(and(eq(worldEvents.subjectType, subjectType), eq(worldEvents.subjectId, subjectId)));
  }
  return q;
}

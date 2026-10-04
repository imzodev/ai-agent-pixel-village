// Server side of the fresh batches (src/lib/bakery.ts): tickd bakes, the
// snapshot shows what's left, and /api/bakery hands out one loaf per
// player per batch. A batch is a row; taking a loaf is a claim row plus a
// guarded `taken + 1`, so two players can never take the last loaf twice.
// Safe for tickd: imports no seed code.

import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { breadBatches, breadClaims, npcs, worldChat } from "@/db/schema";
import { addItem, logEvent } from "@/lib/game";
import { rowPositionAt } from "@/lib/motion";
import { BAKER_HOME_PX, BATCH_LOAVES, BREAD_ITEM, BREAD_REACH_PX, BREAD_TABLES, batchDue, loavesLeft, tableByKey, tablePoint } from "@/lib/bakery";
import type { BreadState, BreadTableSnapshot, BreadTakeResult } from "@/types/bakery";
import type { Point } from "@/types/world";

const BAKED_LINES = [
  "Fresh bread on the table, loves! One each, mind.",
  "Out of the oven! Help yourselves to a loaf.",
  "Still warm! Take one before it's gone.",
];

/** The latest batch of every table. */
async function latestBatches() {
  const rows = await db.execute<{ id: number; table_key: string; baked_at: Date; qty: number; taken: number }>(sql`
    select distinct on (table_key) id, table_key, baked_at, qty, taken
    from bread_batches order by table_key, baked_at desc`);
  return new Map(rows.rows.map((r) => [r.table_key, { id: r.id, bakedAt: new Date(r.baked_at).getTime(), qty: r.qty, taken: r.taken }]));
}

/**
 * tickd, every beat: a table whose last batch is BAKE_INTERVAL_MS old gets a
 * new one, if its baker is home. Away (on a trip), nothing is baked; the
 * batch comes out on the first beat after they're back.
 */
export async function bakeBatches(now: number): Promise<number> {
  const latest = await latestBatches();
  const due = BREAD_TABLES.filter((t) => batchDue(latest.get(t.key)?.bakedAt ?? null, now));
  if (!due.length) return 0;
  const bakers = await db.select().from(npcs).where(inArray(npcs.key, due.map((t) => t.bakerKey)));
  let baked = 0;
  for (const t of due) {
    const baker = bakers.find((n) => n.key === t.bakerKey && n.active);
    if (!baker) continue;
    const at = tablePoint(t), pos = rowPositionAt(baker, now);
    if (Math.hypot(pos.x - at.x, pos.y - at.y) > BAKER_HOME_PX) continue;
    await db.insert(breadBatches).values({ tableKey: t.key, bakedAt: new Date(now), qty: BATCH_LOAVES });
    // Old batches' claims are no longer needed once a newer batch exists.
    const stale = await db.select({ id: breadBatches.id }).from(breadBatches)
      .where(and(eq(breadBatches.tableKey, t.key), lt(breadBatches.bakedAt, new Date(now - 24 * 3600_000))));
    if (stale.length) {
      await db.delete(breadClaims).where(inArray(breadClaims.batchId, stale.map((s) => s.id)));
      await db.delete(breadBatches).where(inArray(breadBatches.id, stale.map((s) => s.id)));
    }
    await db.insert(worldChat).values({ speakerType: "npc", speakerId: baker.id, text: BAKED_LINES[Math.floor(now / 1000) % BAKED_LINES.length] });
    await logEvent("bake", `${baker.name} set out a fresh batch of bread.`, "npc", baker.id, at.x, at.y);
    baked++;
  }
  return baked;
}

/** Every table with what's left of its current batch (for the snapshot). */
export async function breadTables(): Promise<BreadTableSnapshot[]> {
  const latest = await latestBatches();
  return BREAD_TABLES.map((t) => {
    const b = latest.get(t.key);
    return { key: t.key, ...tablePoint(t), left: loavesLeft(b), batchId: b?.id ?? null };
  });
}

/** The current batches this character has already taken from. */
export async function breadState(characterId: number): Promise<BreadState> {
  const latest = [...(await latestBatches()).values()].map((b) => b.id);
  if (!latest.length) return { taken: [] };
  const rows = await db.select({ batchId: breadClaims.batchId }).from(breadClaims)
    .where(and(eq(breadClaims.characterId, characterId), inArray(breadClaims.batchId, latest)));
  return { taken: rows.map((r) => r.batchId) };
}

/** Take one loaf from a table's current batch. */
export async function takeBread(characterId: number, tableKey: string, pos: Point): Promise<BreadTakeResult> {
  const t = tableByKey(tableKey);
  if (!t) return { ok: false, error: "There's no bread here." };
  const at = tablePoint(t);
  if (Math.hypot(at.x - pos.x, at.y - pos.y) > BREAD_REACH_PX) return { ok: false, error: "Step up to the table first." };
  const result = await db.transaction(async (tx): Promise<BreadTakeResult> => {
    const [batch] = await tx.select().from(breadBatches).where(eq(breadBatches.tableKey, t.key)).orderBy(desc(breadBatches.bakedAt)).limit(1);
    if (!batch || loavesLeft(batch) <= 0) return { ok: false, error: "The table's empty. Fresh bread comes out soon." };
    const claimed = await tx.insert(breadClaims).values({ batchId: batch.id, characterId }).onConflictDoNothing().returning({ batchId: breadClaims.batchId });
    if (!claimed.length) return { ok: false, error: "You've had your loaf from this batch. Come back for the next one!" };
    const [took] = await tx.update(breadBatches).set({ taken: sql`${breadBatches.taken} + 1` })
      .where(and(eq(breadBatches.id, batch.id), lt(breadBatches.taken, breadBatches.qty))).returning({ taken: breadBatches.taken, qty: breadBatches.qty });
    if (!took) { tx.rollback(); return { ok: false, error: "Someone just took the last one!" }; }
    return { ok: true, message: "🍞 You take a warm loaf from the table.", batchId: batch.id, left: took.qty - took.taken, gained: [{ itemKey: BREAD_ITEM, qty: 1 }] };
  }).catch((e: unknown) => {
    if (e instanceof Error && /rollback/i.test(e.message)) return { ok: false as const, error: "Someone just took the last one!" };
    throw e;
  });
  if (result.ok) await addItem(characterId, BREAD_ITEM, 1);
  return result;
}

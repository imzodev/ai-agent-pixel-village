// Random event registry + manager. Sim.ts calls `runRandomEvents(ctx)` once
// per world tick; the manager picks one eligible event by weight, respects
// cooldowns, and runs it. Adding a new event = pushing one entry into
// `simEvents` below — no edits anywhere else.
import { and, eq, sql } from "drizzle-orm";
import { groundItems } from "@/db/schema";
import type { RandomEvent, SimCtx } from "./types";

const lastFired = new Map<string, number>();
export const simEvents: RandomEvent[] = [];

/** Roll one weighted event from the eligible pool and run it. Idempotent
 *  for the tick: at most one event per call. */
export async function runRandomEvents(ctx: SimCtx): Promise<void> {
  const eligible: RandomEvent[] = [];
  for (const e of simEvents) {
    const last = lastFired.get(e.key) ?? 0;
    if (ctx.now.getTime() - last < e.cooldownMs) continue;
    if (e.when && !(await e.when(ctx))) continue;
    eligible.push(e);
  }
  if (eligible.length === 0) return;
  const total = eligible.reduce((s, e) => s + e.weight, 0);
  let pick = Math.random() * total;
  for (const e of eligible) {
    pick -= e.weight;
    if (pick <= 0) {
      lastFired.set(e.key, ctx.now.getTime());
      try { await e.fire(ctx); } catch (err) {
        console.error(`[events] ${e.key} threw`, err);
      }
      return;
    }
  }
}

// ─── Event definitions ──────────────────────────────────────────────────────
//
// Adding a new event? Drop a `simEvents.push({...})` here. That's the only
// change required — the manager picks it up automatically.

simEvents.push({
  key: "fox_raid",
  weight: 5,
  cooldownMs: 30 * 60 * 1000,           // at most once every ~30 sim minutes
  when: async (ctx) => {
    // Only raid if there's something to raid — at least one egg on the
    // ground near a chicken-zone. The chicken zone is the south meadow
    // (tile y > 24 → world y > 384); the simpler check: any eggs exist.
    const rows = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(groundItems)
      .where(eq(groundItems.itemKey, "egg"));
    const n = (rows[0]?.n ?? 0) as number;
    return n >= 1;
  },
  fire: async (ctx) => {
    // 1. Pick a random ground egg (the fox's target).
    const rows = await ctx.db
      .select({ id: groundItems.id, x: groundItems.x, y: groundItems.y })
      .from(groundItems)
      .where(eq(groundItems.itemKey, "egg"))
      .orderBy(sql`random()`)
      .limit(1);
    const target = rows[0];
    if (!target) return;

    // 2. Snatch the egg (fox got there first).
    await ctx.db.delete(groundItems).where(eq(groundItems.id, target.id));
    const { logEvent } = await import("./game");
    await logEvent("event", "A fox darted through the chicken yard and snatched an egg!", undefined, undefined, target.x, target.y);

    // 3. Spawn a fox enemy entity — it walks in from off-target and lingers
    //    ~20 sim seconds before despawning. tickEnemies handles the cleanup.
    await ctx.db.execute(sql`
      INSERT INTO enemies (kind, x, y, target_x, target_y, hp, max_hp, spawned_at)
      VALUES (
        'fox',
        ${target.x + 120}, ${target.y - 80},
        ${target.x}, ${target.y},
        9, 9, NOW()
      )
    `);
  },
});

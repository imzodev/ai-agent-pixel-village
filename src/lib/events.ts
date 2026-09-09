// Random event registry + manager. Sim.ts calls `runRandomEvents(ctx)` once
// per world tick; the manager picks one eligible event by weight, respects
// cooldowns, and runs it. Adding a new event = pushing one entry into
// `simEvents` below — no edits anywhere else.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { animals, groundItems } from "@/db/schema";
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

// The fox (Ember) lives in the north woods as a permanent animal resident.
// When the raid fires, it walks south to the coop, steals an egg on arrival
// (handled by tickAnimals' "raid" state), and trots back home. No temp
// entities, no despawn — the fox simply goes about its business.
simEvents.push({
  key: "fox_raid",
  weight: 5,
  cooldownMs: 2 * 60 * 1000,
  when: async (ctx) => {
    const [fox] = await ctx.db.select().from(animals).where(eq(animals.species, "fox"));
    if (!fox) return false;
    // Don't re-trigger while a raid is already underway.
    if (fox.state === "raid" || fox.state === "return") return false;
    const rows = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(groundItems)
      .where(eq(groundItems.itemKey, "egg"));
    return ((rows[0]?.n ?? 0) as number) >= 1;
  },
  fire: async (ctx) => {
    const [fox] = await ctx.db.select().from(animals).where(eq(animals.species, "fox"));
    if (!fox) return;
    const target = await ctx.db
      .select({ id: groundItems.id, x: groundItems.x, y: groundItems.y })
      .from(groundItems)
      .where(eq(groundItems.itemKey, "egg"))
      .orderBy(sql`(ground_items.x - ${fox.x}) * (ground_items.x - ${fox.x}) + (ground_items.y - ${fox.y}) * (ground_items.y - ${fox.y})`)
      .limit(1);
    const egg = target[0];
    if (!egg) return;
    await ctx.db.update(animals)
      .set({ state: "raid", targetX: egg.x, targetY: egg.y, stateUntil: new Date(ctx.now.getTime() + 180_000) })
      .where(eq(animals.id, fox.id));
    const { logEvent } = await import("./game");
    await logEvent("event", "A fox left the north woods — it's eyeing the chicken yard!", undefined, undefined, fox.x, fox.y);
  },
});

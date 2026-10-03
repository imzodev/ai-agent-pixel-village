// The inns. GET ?key=<inn key> → the panel (rumours, patrons, prices);
// POST { key, action: "rest" | "stew" | "cheers" }. You must be at the door.

import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { buildings, characters, lots, npcs, worldChat, worldEvents, worldState } from "@/db/schema";
import { handleApiError, requireCharacter } from "@/lib/auth";
import { getBuildingDoor } from "@/lib/buildingsServer";
import { getLivePlayerPosition, livePlayersNear, markWorldDirty } from "@/lib/world-stream";
import { addItem } from "@/lib/game";
import { gameHour } from "@/lib/worldmap";
import { nextBossWindow } from "@/lib/progression";
import { INNS, INN_PATRON_PX, INN_REACH_PX, REST_COST, REST_FREE_BELOW, STEW_COST, rumours } from "@/lib/inn";
import type { InnView } from "@/types/inn";

export const dynamic = "force-dynamic";

async function innView(key: string, me: { id: number; hp: number; maxHp: number }): Promise<InnView | null> {
  const [b] = await db.select({ name: buildings.name }).from(buildings).where(eq(buildings.key, key));
  const door = await getBuildingDoor(key);
  if (!b || !door) return null;
  const now = Date.now();
  const [[ws], keeper, free, [catchEv]] = await Promise.all([
    db.select().from(worldState).where(eq(worldState.id, 1)),
    db.select({ name: npcs.name }).from(npcs).where(eq(npcs.key, INNS[key])),
    db.select({ kind: lots.kind, n: sql<number>`count(*)::int` }).from(lots).where(isNull(lots.ownerId)).groupBy(lots.kind),
    db.select({ text: worldEvents.text }).from(worldEvents)
      .where(and(eq(worldEvents.kind, "catch"), gt(worldEvents.createdAt, new Date(now - 6 * 3_600_000))))
      .orderBy(desc(worldEvents.id)).limit(1),
  ]);
  const ids = livePlayersNear(door.x, door.y, INN_PATRON_PX);
  const patrons = ids.length
    ? await db.select({ id: characters.id, name: characters.name, level: characters.level, title: characters.title }).from(characters).where(inArray(characters.id, ids))
    : [];
  const count = (k: string) => free.find((f) => f.kind === k)?.n ?? 0;
  return {
    key,
    name: b.name,
    innkeeper: keeper[0]?.name ?? "The innkeeper",
    restCost: REST_COST,
    restFree: me.hp < me.maxHp * REST_FREE_BELOW,
    stewCost: STEW_COST,
    rumours: rumours({
      now,
      hour: gameHour(ws.epochStart.getTime(), ws.dayLengthMinutes),
      weather: ws.weather,
      boss: nextBossWindow(now, process.env.BOSS_SCHEDULE ?? "6@18", process.env.BOSS_FORCE === "1"),
      freeFields: count("land"),
      freeRanches: count("ranch"),
      lastCatch: catchEv?.text ?? null,
    }),
    patrons,
  };
}

export async function GET(req: Request) {
  try {
    const me = await requireCharacter();
    const key = new URL(req.url).searchParams.get("key") ?? "";
    if (!(key in INNS)) return Response.json({ error: "No such inn." }, { status: 404 });
    const view = await innView(key, me);
    if (!view) return Response.json({ error: "No such inn." }, { status: 404 });
    return Response.json(view);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const key = String(body.key ?? "");
    if (!(key in INNS)) return Response.json({ error: "No such inn." }, { status: 404 });
    const door = await getBuildingDoor(key);
    const p = getLivePlayerPosition(me.id) ?? me;
    if (!door || Math.hypot(door.x - p.x, door.y - p.y) > INN_REACH_PX) return Response.json({ error: "Step inside first." }, { status: 400 });

    if (body.action === "rest") {
      if (me.hp >= me.maxHp) return Response.json({ error: "You're already fighting fit." }, { status: 400 });
      const cost = me.hp < me.maxHp * REST_FREE_BELOW ? 0 : REST_COST;
      const [r] = await db.update(characters)
        .set({ hp: characters.maxHp, coins: sql`${characters.coins} - ${cost}` })
        .where(and(eq(characters.id, me.id), sql`${characters.coins} >= ${cost}`))
        .returning({ hp: characters.hp });
      if (!r) return Response.json({ error: `A room by the fire is ${cost} coins.` }, { status: 400 });
      markWorldDirty(p.x, p.y); // fresh HP in the next snapshot
      return Response.json({ ok: true, hp: r.hp, message: cost ? `You doze by the hearth. Fully rested! (−${cost} 🪙)` : "You look done in — the innkeeper lets you rest on the house. Fully rested!" });
    }
    if (body.action === "stew") {
      const [r] = await db.update(characters)
        .set({ coins: sql`${characters.coins} - ${STEW_COST}` })
        .where(and(eq(characters.id, me.id), sql`${characters.coins} >= ${STEW_COST}`))
        .returning({ id: characters.id });
      if (!r) return Response.json({ error: `Stew is ${STEW_COST} coins.` }, { status: 400 });
      await addItem(me.id, "hot_stew", 1);
      return Response.json({ ok: true, message: "🍲 A bowl of hot stew, wrapped for the road.", gained: [{ itemKey: "hot_stew", qty: 1 }] });
    }
    if (body.action === "cheers") {
      const [b] = await db.select({ name: buildings.name }).from(buildings).where(eq(buildings.key, key));
      await db.insert(worldChat).values({ speakerType: "player", speakerId: me.id, text: `🍺 Cheers, everyone at ${b?.name ?? "the inn"}!` });
      markWorldDirty(p.x, p.y);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return handleApiError(e);
  }
}

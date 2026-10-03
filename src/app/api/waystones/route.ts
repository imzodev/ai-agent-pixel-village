// Waystones. POST { action: "attune", key } when you're beside one (the
// client sends it as you walk past); POST { action: "travel", key } to
// fast-travel to an attuned one: free from beside a waystone, TRAVEL_COST
// coins from anywhere else, never with an aggressive enemy close by.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, characterWaystones, enemies } from "@/db/schema";
import { handleApiError, requireCharacter } from "@/lib/auth";
import { getLivePlayerPosition, markWorldDirty } from "@/lib/world-stream";
import { isWalkableServer } from "@/lib/chunkCollisionServer";
import { rowPositionAt } from "@/lib/motion";
import { isAggressive } from "@/lib/progression";
import { waystoneList } from "@/lib/worldAtlasServer";
import { TRAVEL_DANGER_PX, WAYSTONE_ATTUNE_PX, WAYSTONE_NEAR_PX, travelCost } from "@/lib/worldAtlas";
import { logEvent } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const stones = await waystoneList();
    const stone = stones.find((w) => w.key === String(body.key ?? ""));
    if (!stone) return Response.json({ error: "No such waystone." }, { status: 404 });
    const p = getLivePlayerPosition(me.id) ?? me;
    const dist = (w: { x: number; y: number }) => Math.hypot(w.x - p.x, w.y - p.y);

    if (body.action === "attune") {
      if (dist(stone) > WAYSTONE_ATTUNE_PX * 2) return Response.json({ error: "Walk up to the stone first." }, { status: 400 });
      const added = await db.insert(characterWaystones).values({ characterId: me.id, key: stone.key }).onConflictDoNothing().returning({ key: characterWaystones.key });
      return Response.json({ ok: true, new: added.length > 0, message: added.length ? `✨ Waystone attuned: ${stone.name}. Travel here from your map (M).` : undefined });
    }

    if (body.action === "travel") {
      const [att] = await db.select().from(characterWaystones).where(and(eq(characterWaystones.characterId, me.id), eq(characterWaystones.key, stone.key)));
      if (!att) return Response.json({ error: "You haven't attuned that waystone yet." }, { status: 400 });
      const now = Date.now();
      const foes = (await db.select().from(enemies)).filter((e) => isAggressive(e.kind));
      if (foes.some((e) => { const q = rowPositionAt(e, now); return Math.hypot(q.x - p.x, q.y - p.y) <= TRAVEL_DANGER_PX; })) {
        return Response.json({ error: "You can't travel mid-fight." }, { status: 400 });
      }
      if (dist(stone) <= WAYSTONE_NEAR_PX) return Response.json({ error: "You're already here." }, { status: 400 });
      const cost = travelCost(stones.some((w) => dist(w) <= WAYSTONE_NEAR_PX));
      // Arrive on the flagstones just below the stone.
      let to = { x: stone.x, y: stone.y + 26 };
      if (!(await isWalkableServer(to.x, to.y))) to = { x: stone.x, y: stone.y + 40 };
      const [moved] = await db.update(characters)
        .set({ x: to.x, y: to.y, coins: sql`${characters.coins} - ${cost}` })
        .where(and(eq(characters.id, me.id), sql`${characters.coins} >= ${cost}`))
        .returning({ id: characters.id });
      if (!moved) return Response.json({ error: `Travel from here costs ${cost} coins.` }, { status: 400 });
      markWorldDirty(to.x, to.y);
      void logEvent("visit", `${me.name} stepped out of the ${stone.name}.`, "character", me.id, to.x, to.y).catch(() => {});
      return Response.json({ ok: true, teleport: to, message: cost ? `🌀 You touch the rune… (−${cost} 🪙)` : "🌀 The stones carry you." });
    }
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return handleApiError(e);
  }
}

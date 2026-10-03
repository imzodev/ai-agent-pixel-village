// Fishing: { action: "cast", facing } → the server checks the rod and the
// water in front of you, rolls the fish and when it bites; the client plays
// the bite + reel minigame; { action: "reel", castId, ok } lands it (or
// not). Casts are kept in memory for a few seconds — a restart just drops
// the ones in flight.

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, worldState } from "@/db/schema";
import { handleApiError, requireCharacter } from "@/lib/auth";
import { addItem, logEvent, progressMissions, recalcLevel } from "@/lib/game";
import { gearOf } from "@/lib/combat";
import { BITE_MAX_MS, BITE_MIN_MS, CAST_TTL_MS, CATCH_ZONE, FISHING_ROD, fishDef, rollFish, waterInFront } from "@/lib/fishing";
import type { FishCast } from "@/lib/fishing";
import { gameHour } from "@/lib/worldmap";
import { getLivePlayerPosition } from "@/lib/world-stream";
import { recordCollection } from "@/lib/collectionServer";
import { getContainer } from "@/lib/container";
import { ROD_ZONE_PER_PLUS } from "@/lib/forge";

export const dynamic = "force-dynamic";

const casts = new Map<number, FishCast>(); // one cast per character
/** Reeling a little before the bite is tolerated (network jitter). */
const EARLY_SLACK_MS = 200;

export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const now = Date.now();
    for (const [id, c] of casts) if (now - c.createdAt > CAST_TTL_MS) casts.delete(id);

    if (body.action === "cast") {
      const { bag, plus } = await gearOf(me.id);
      if (!bag.includes(FISHING_ROD)) return Response.json({ error: "You need a fishing rod. Pip and Marina sell them." }, { status: 400 });
      const p = getLivePlayerPosition(me.id) ?? me;
      const facing = String(body.facing ?? "down");
      const spot = waterInFront(p.x, p.y, facing) ?? ["up", "down", "left", "right"].map((f) => waterInFront(p.x, p.y, f)).find(Boolean) ?? null;
      if (!spot) return Response.json({ error: "Face some deep water to fish." }, { status: 400 });
      const [ws] = await db.select().from(worldState).where(eq(worldState.id, 1));
      const hour = gameHour(ws.epochStart.getTime(), ws.dayLengthMinutes);
      const fish = rollFish(spot.water, hour, ws.weather);
      const cast: FishCast = {
        id: `${me.id}-${now}`,
        characterId: me.id,
        fishKey: fish.key,
        biteAt: now + BITE_MIN_MS + Math.random() * (BITE_MAX_MS - BITE_MIN_MS),
        createdAt: now,
      };
      casts.set(me.id, cast);
      return Response.json({
        ok: true, castId: cast.id, biteInMs: Math.round(cast.biteAt - now),
        zone: Math.min(0.6, CATCH_ZONE[fish.rarity] + (plus[FISHING_ROD] ?? 0) * ROD_ZONE_PER_PLUS), water: spot.water,
        bobber: { x: spot.tx * 16 + 8, y: spot.ty * 16 + 8 },
      });
    }

    if (body.action === "reel") {
      const cast = casts.get(me.id);
      if (!cast || cast.id !== String(body.castId)) return Response.json({ error: "Your line is slack — cast again." }, { status: 400 });
      casts.delete(me.id);
      if (now < cast.biteAt - EARLY_SLACK_MS) return Response.json({ ok: true, caught: false, message: "Too soon — the fish wasn't biting yet." });
      if (!body.ok) return Response.json({ ok: true, caught: false, message: "It got away…" });
      const fish = fishDef(cast.fishKey)!;
      await addItem(me.id, fish.key, 1);
      await db.update(characters).set({ xp: sql`${characters.xp} + ${fish.xp}` }).where(eq(characters.id, me.id));
      await recalcLevel(me.id);
      await progressMissions(me.id, (r) => r.type === "collect" && r.itemKey === fish.key);
      void getContainer().services.quest.recordEvent(me.id, { kind: "fish", payload: { itemKey: fish.key } }).catch(() => {});
      const isNew = await recordCollection(me.id, "fish", fish.key);
      const rare = fish.rarity === "legendary" ? "🌟 LEGENDARY! " : fish.rarity === "rare" ? "✨ Rare! " : "";
      // Big catches make the rounds at the inns (rumour board).
      if (rare) await logEvent("catch", `${me.name} landed a ${fish.name}!`, "character", me.id, me.x, me.y);
      return Response.json({
        ok: true, caught: true,
        message: `${rare}You caught a ${fish.name}! +${fish.xp} XP${isNew ? " · 📖 New in your book!" : ""}`,
        gained: [{ itemKey: fish.key, qty: 1 }],
      });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return handleApiError(e);
  }
}

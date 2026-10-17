import { handleApiError, requireCharacter } from "@/lib/auth";
import { getBuildingDoor } from "@/lib/buildingsServer";
import { logEvent } from "@/lib/game";
import { acquireLot, cheerLot, releaseLot, setLotBanner, signPointsOfOwner } from "@/lib/lots";
import { getLivePlayerPosition, markWorldDirty } from "@/lib/world-stream";

export const dynamic = "force-dynamic";

/** How close to the door you must be to move in. */
const DOOR_RANGE_PX = 160;

/** Lot actions: acquire (move into a home) | release | banner | cheer. Body: { action, key } (banner also { color, emblem }). Homesteads: /api/homestead. */
export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const key = String(body.key ?? "");
    const door = await getBuildingDoor(key);

    if (action === "acquire") {
      const p = getLivePlayerPosition(me.id) ?? me;
      if (door && Math.hypot(door.x - p.x, door.y - p.y) > DOOR_RANGE_PX) {
        return Response.json({ error: "Walk up to the door first." }, { status: 400 });
      }
      const r = await acquireLot(me.id, key);
      if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
      await logEvent("home", `${me.name} moved in!`, "character", me.id, door?.x, door?.y);
      if (door) markWorldDirty(door.x, door.y);
      return Response.json(r);
    }
    if (action === "release") {
      const r = await releaseLot(me.id, key);
      if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
      if (door) markWorldDirty(door.x, door.y);
      return Response.json(r);
    }
    if (action === "cheer") {
      const r = await cheerLot(me.id, key, getLivePlayerPosition(me.id) ?? me);
      if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
      await logEvent("home", `${me.name} cheered ${r.ownerName}'s place!`, "character", me.id, door?.x, door?.y);
      // The owner's total is on every one of their signs, so refresh them all.
      for (const p of await signPointsOfOwner(r.ownerId!)) markWorldDirty(p.x, p.y);
      return Response.json({ ok: true, message: r.message });
    }
    if (action === "banner") {
      const r = await setLotBanner(me.id, key, Number(body.color), Number(body.emblem));
      if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
      // The banner is on all their lots, so refresh each one for whoever is looking.
      for (const p of await signPointsOfOwner(me.id)) markWorldDirty(p.x, p.y);
      return Response.json(r);
    }
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return handleApiError(e);
  }
}

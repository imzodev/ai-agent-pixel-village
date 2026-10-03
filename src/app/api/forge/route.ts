// The Hollowmere forge: GET your upgradable gear; POST { itemKey } to have
// Bjorn upgrade it (you must be standing at the forge).

import { handleApiError, requireCharacter } from "@/lib/auth";
import { getBuildingDoor } from "@/lib/buildingsServer";
import { getLivePlayerPosition } from "@/lib/world-stream";
import { FORGE_KEY, FORGE_REACH_PX } from "@/lib/forge";
import { forgeUpgrade, forgeView } from "@/lib/forgeServer";
import { logEvent } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await requireCharacter();
    return Response.json(await forgeView(me.id));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const door = await getBuildingDoor(FORGE_KEY);
    const p = getLivePlayerPosition(me.id) ?? me;
    if (!door || Math.hypot(door.x - p.x, door.y - p.y) > FORGE_REACH_PX) return Response.json({ error: "Walk up to the forge first." }, { status: 400 });
    const r = await forgeUpgrade(me.id, String(body.itemKey ?? ""));
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
    if (r.plus === 3) await logEvent("craft", `${me.name}'s ${r.name} rang out from Bjorn's anvil!`, "character", me.id, me.x, me.y);
    return Response.json({ ok: true, plus: r.plus, message: `🔨 Clang! Your ${r.name} is ready.`, view: await forgeView(me.id) });
  } catch (e) {
    return handleApiError(e);
  }
}

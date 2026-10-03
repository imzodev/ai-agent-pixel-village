// Treasure maps (src/lib/treasure.ts). GET → your undug maps;
// POST { action: "dig", mapId } → dig where you stand.

import { handleApiError, requireCharacter } from "@/lib/auth";
import { getLivePlayerPosition } from "@/lib/world-stream";
import { digTreasure, myTreasureMaps } from "@/lib/treasureServer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await requireCharacter();
    return Response.json({ maps: await myTreasureMaps(me.id) });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    if (body.action !== "dig") return Response.json({ error: "Unknown action." }, { status: 400 });
    const r = await digTreasure(me.id, Number(body.mapId), getLivePlayerPosition(me.id) ?? me);
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
    return Response.json(r);
  } catch (e) {
    return handleApiError(e);
  }
}

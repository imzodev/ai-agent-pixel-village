// Hidden relics (src/lib/relics.ts). GET → the keys you've found;
// POST { key } → pick one up (you must be standing at it).

import { handleApiError, requireCharacter } from "@/lib/auth";
import { getLivePlayerPosition } from "@/lib/world-stream";
import { pickUpRelic, relicsFound } from "@/lib/relicsServer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await requireCharacter();
    return Response.json({ found: await relicsFound(me.id) });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const r = await pickUpRelic(me.id, String(body.key ?? ""), getLivePlayerPosition(me.id) ?? me);
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
    return Response.json(r);
  } catch (e) {
    return handleApiError(e);
  }
}

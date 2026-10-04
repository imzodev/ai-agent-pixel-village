// Fresh bread on the bakery tables (src/lib/bakery.ts). GET → the current
// batches you've already taken from; POST { table } → take your free loaf
// (you must be standing at the table).

import { handleApiError, requireCharacter } from "@/lib/auth";
import { getLivePlayerPosition, markWorldDirty } from "@/lib/world-stream";
import { breadState, takeBread } from "@/lib/bakeryServer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await requireCharacter();
    return Response.json(await breadState(me.id));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const pos = getLivePlayerPosition(me.id) ?? me;
    const r = await takeBread(me.id, String(body.table ?? ""), pos);
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
    markWorldDirty(pos.x, pos.y); // everyone nearby sees one loaf fewer
    return Response.json(r);
  } catch (e) {
    return handleApiError(e);
  }
}

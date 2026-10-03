// Random encounters. GET → the ones near you (active, or just resolved —
// `rewardedMe` says you were paid); POST { action: "help", id } hands the
// stranger what they need.

import { handleApiError, requireCharacter } from "@/lib/auth";
import { getLivePlayerPosition, markWorldDirty } from "@/lib/world-stream";
import { encountersNear, helpEncounter } from "@/lib/encountersServer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await requireCharacter();
    return Response.json({ encounters: await encountersNear(me.id, getLivePlayerPosition(me.id) ?? me) });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    if (body.action !== "help") return Response.json({ error: "Unknown action." }, { status: 400 });
    const pos = getLivePlayerPosition(me.id) ?? me;
    const r = await helpEncounter(me.id, Math.trunc(Number(body.id)), pos);
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
    markWorldDirty(pos.x, pos.y);
    return Response.json(r);
  } catch (e) {
    return handleApiError(e);
  }
}

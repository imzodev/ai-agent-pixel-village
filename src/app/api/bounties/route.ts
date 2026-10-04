// Bounty boards. GET ?town=<key> → that board; GET ?mine=1 → your active
// bounties. POST { action, id }: accept | abandon | arrive (an explore
// spot / a delivery's board) | turnin — all checked against where you are.

import { handleApiError, requireCharacter } from "@/lib/auth";
import { getLivePlayerPosition, markWorldDirty } from "@/lib/world-stream";
import { abandonBounty, acceptBounty, arriveAt, boardView, myBounties, turnIn } from "@/lib/bountiesServer";
import { TOWNS } from "@/lib/settlements";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const me = await requireCharacter();
    const q = new URL(req.url).searchParams;
    if (q.get("mine")) return Response.json({ bounties: await myBounties(me.id) });
    const town = q.get("town") ?? "";
    if (!TOWNS.some((t) => t.key === town)) return Response.json({ error: "No such town." }, { status: 404 });
    return Response.json({ bounties: await boardView(me.id, town) });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const id = Math.trunc(Number(body.id));
    if (!Number.isFinite(id)) return Response.json({ error: "Which bounty?" }, { status: 400 });
    const pos = getLivePlayerPosition(me.id) ?? me;
    const r =
      body.action === "accept" ? await acceptBounty(me.id, id, pos)
      : body.action === "abandon" ? await abandonBounty(me.id, id)
      : body.action === "arrive" ? await arriveAt(me.id, id, pos)
      : body.action === "turnin" ? await turnIn(me.id, id, pos)
      : { ok: false as const, error: "Unknown action." };
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
    if (body.action === "turnin") markWorldDirty(pos.x, pos.y);
    return Response.json(r);
  } catch (e) {
    return handleApiError(e);
  }
}

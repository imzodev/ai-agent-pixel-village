// Saloon games in the inns (src/lib/saloonServer.ts). You must be at the inn.
// GET ?inn=<key> → everything the Games tab shows;
// POST { inn, game: "blackjack" | "dice" | "arm", action, … } → a move.

import { handleApiError, requireCharacter } from "@/lib/auth";
import { getLivePlayerPosition } from "@/lib/world-stream";
import { arm, atInn, blackjack, dice, saloonView } from "@/lib/saloonServer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const me = await requireCharacter();
    const inn = new URL(req.url).searchParams.get("inn") ?? "";
    if (!(await atInn(inn, getLivePlayerPosition(me.id) ?? me))) return Response.json({ error: "Step inside first." }, { status: 400 });
    return Response.json(await saloonView(me.id, inn));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const inn = String(body.inn ?? "");
    if (!(await atInn(inn, getLivePlayerPosition(me.id) ?? me))) return Response.json({ error: "Step inside first." }, { status: 400 });
    const action = String(body.action ?? "");
    const r =
      body.game === "blackjack" ? await blackjack(me.id, action, Number(body.bet)) :
      body.game === "dice" ? await dice(me.id, inn, action, body) :
      body.game === "arm" ? await arm(me.id, inn, action, body) :
      { ok: false as const, error: "Unknown game." };
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
    return Response.json({ ok: true, message: r.message, view: await saloonView(me.id, inn) });
  } catch (e) {
    return handleApiError(e);
  }
}

import { handleApiError, requireCharacter } from "@/lib/auth";
import { bookView, claimPage, recordCollection } from "@/lib/collectionServer";
import { placeByKey, regionAt } from "@/lib/regions";
import { getLivePlayerPosition } from "@/lib/world-stream";

export const dynamic = "force-dynamic";

/** The collection book for the signed-in character. */
export async function GET() {
  try {
    const me = await requireCharacter();
    return Response.json(await bookView(me.id));
  } catch (e) {
    return handleApiError(e);
  }
}

/** { action: "visit", region } (on entering a region) | { action: "claim", page }. */
export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    if (body.action === "visit") {
      const key = String(body.region ?? "");
      const p = getLivePlayerPosition(me.id) ?? me;
      // Only where you actually are.
      if (regionAt(p.x, p.y)?.key !== key) return Response.json({ ok: true, new: false });
      const isNew = await recordCollection(me.id, "region", key);
      const name = placeByKey(key)?.name.replace(/^the /, "") ?? key;
      return Response.json({ ok: true, new: isNew, message: isNew ? `📖 New place: ${name}!` : undefined });
    }
    if (body.action === "claim") {
      const r = await claimPage(me.id, String(body.page ?? ""));
      if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
      return Response.json(r);
    }
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return handleApiError(e);
  }
}

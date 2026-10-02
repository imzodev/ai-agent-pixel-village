import { handleApiError, requireCharacter } from "@/lib/auth";
import { setTitle } from "@/lib/collectionServer";
import { markWorldDirty } from "@/lib/world-stream";

export const dynamic = "force-dynamic";

/** Wear a title: { title } (null to clear). Must be unlocked. */
export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const title = body.title == null ? null : String(body.title).slice(0, 40);
    const r = await setTitle(me.id, title);
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
    markWorldDirty(me.x, me.y);
    return Response.json({ ok: true, message: title ? `You are now known as “${title}”.` : "Title removed." });
  } catch (e) {
    return handleApiError(e);
  }
}

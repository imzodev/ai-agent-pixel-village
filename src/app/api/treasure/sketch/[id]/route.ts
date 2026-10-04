// A treasure map's sketch (PNG), drawn on the server so it never gives
// away coordinates. Only the map's owner can see it.

import { handleApiError, requireCharacter } from "@/lib/auth";
import { treasureSketch } from "@/lib/treasureServer";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireCharacter();
    const png = await treasureSketch(me.id, Number((await ctx.params).id));
    if (!png) return Response.json({ error: "No such map." }, { status: 404 });
    return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "private, max-age=3600" } });
  } catch (e) {
    return handleApiError(e);
  }
}

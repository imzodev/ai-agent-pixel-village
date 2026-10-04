// Fog of war. GET ?cx0&cx1&cy0&cy1 → the seen-chunk masks in that box;
// POST { chunks: [[cx, cy], …] } → mark chunks seen (near where you are).

import { handleApiError, requireCharacter } from "@/lib/auth";
import { getLivePlayerPosition } from "@/lib/world-stream";
import { markSeen, seenIn } from "@/lib/worldAtlasServer";
import { chunkOfTile } from "@/lib/worldAtlas";

export const dynamic = "force-dynamic";

/** Seen chunks must be within this many chunks of where you are (a batch spans ~10 s of walking). */
const NEAR_CHUNKS = 12;

export async function GET(req: Request) {
  try {
    const me = await requireCharacter();
    const q = new URL(req.url).searchParams;
    const n = (k: string) => Math.trunc(Number(q.get(k)));
    const box = { cx0: n("cx0"), cx1: n("cx1"), cy0: n("cy0"), cy1: n("cy1") };
    if (Object.values(box).some((v) => !Number.isFinite(v)) || box.cx1 - box.cx0 > 4096 || box.cy1 - box.cy0 > 4096) return Response.json({ error: "Bad box." }, { status: 400 });
    return Response.json({ blocks: await seenIn(me.id, box) });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const p = getLivePlayerPosition(me.id) ?? me;
    const here = chunkOfTile(Math.floor(p.x / 16), Math.floor(p.y / 16));
    const chunks = (Array.isArray(body.chunks) ? body.chunks : []).slice(0, 400)
      .map((c: unknown) => (Array.isArray(c) ? { cx: Math.trunc(Number(c[0])), cy: Math.trunc(Number(c[1])) } : null))
      .filter((c: { cx: number; cy: number } | null): c is { cx: number; cy: number } =>
        !!c && Number.isFinite(c.cx) && Number.isFinite(c.cy) && Math.abs(c.cx - here.cx) <= NEAR_CHUNKS && Math.abs(c.cy - here.cy) <= NEAR_CHUNKS);
    if (chunks.length) await markSeen(me.id, chunks);
    return Response.json({ ok: true, marked: chunks.length });
  } catch (e) {
    return handleApiError(e);
  }
}

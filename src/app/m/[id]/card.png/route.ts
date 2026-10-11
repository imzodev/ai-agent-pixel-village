// A moment's share card (1200×630 PNG), the preview X shows for /m/<id>.
// Moments never change, so it's drawn once and cached for good.
import { momentById } from "@/lib/momentsServer";
import { lookOf } from "@/lib/cards/look";
import { momentCardPng } from "@/lib/cards/momentCard";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const m = await momentById(id);
  const look = m ? await lookOf(m.characterId) : null;
  if (!m || !look) return new Response("Not found", { status: 404 });
  const png = await momentCardPng(m, look);
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" } });
}

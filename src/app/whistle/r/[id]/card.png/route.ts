// A Whistle run's share card (1200×630 PNG), the preview X shows for
// /whistle/r/<id>. A run never changes, so it's drawn once and cached for good.
import { whistleRunPng } from "@/lib/cards/whistleCard";
import { runById } from "@/lib/whistleServer";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const run = await runById(id);
  if (!run) return new Response("Not found", { status: 404 });
  const png = await whistleRunPng(run);
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" } });
}

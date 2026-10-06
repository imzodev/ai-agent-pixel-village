// A world map tile (PNG), rendered on first request and cached
// (src/lib/worldAtlasServer.ts). `?v=` (the map version) only busts caches.

import { mapTilePng } from "@/lib/worldAtlasServer";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ z: string; x: string; y: string }> }) {
  const p = await ctx.params;
  const [z, x, y] = [p.z, p.x, p.y.replace(/\.png$/, "")].map((v) => (/^-?\d+$/.test(v) ? Number(v) : NaN));
  try {
    const png = await mapTilePng(z, x, y);
    // The world overview is still being built: no image yet, and nothing cached.
    if (!png) return new Response(null, { status: 503, headers: { "retry-after": "5", "cache-control": "no-store" } });
    return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

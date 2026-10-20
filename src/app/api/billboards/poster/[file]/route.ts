// A billboard poster. Live posters are public (and cached for good: the name
// is the content's hash); one waiting for review only for its owner (?token=)
// or an admin.
import { isAdmin } from "@/lib/adminAuth";
import { readPoster } from "@/lib/billboardPoster";
import { posterVisible } from "@/lib/billboardServer";
import { POSTER_FILE } from "@/lib/billboards";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!POSTER_FILE.test(file)) return notFound();
  const seen = await posterVisible(file, { token: new URL(req.url).searchParams.get("token"), admin: isAdmin(req) });
  if (!seen.ok) return notFound();
  const png = await readPoster(file);
  if (!png) return notFound();
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Cache-Control": seen.live ? "public, max-age=31536000, immutable" : "private, no-store",
    },
  });
}

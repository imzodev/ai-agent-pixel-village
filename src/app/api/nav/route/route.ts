// Admin only (x-admin-token, src/lib/adminAuth.ts): plan a route. GET ?from=tx,ty&to=tx,ty → legs, tile count, cost, time taken.
import { worldRouter } from "@/lib/nav/walkGrid";
import { isAdmin, notFound } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAdmin(req)) return notFound();
  const q = new URL(req.url).searchParams;
  const pt = (s: string | null) => { const [tx, ty] = (s ?? "").split(",").map(Number); return Number.isFinite(tx) && Number.isFinite(ty) ? { tx, ty } : null; };
  const from = pt(q.get("from")), to = pt(q.get("to"));
  if (!from || !to) return Response.json({ error: "Use ?from=tx,ty&to=tx,ty (tiles)." }, { status: 400 });
  const t = performance.now();
  const r = await worldRouter.plan(from, to);
  const ms = Math.round(performance.now() - t);
  return Response.json(r ? { tiles: r.tiles.length, legs: r.legs, cost: r.cost, ms } : { error: "No route.", ms });
}

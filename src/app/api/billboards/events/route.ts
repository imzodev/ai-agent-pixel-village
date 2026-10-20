// The game reports which billboards a player has seen (src/game/billboardImpressions.ts):
// { views: rentalId[] }, by fetch or sendBeacon. Only live posters count, at
// most 20 a report and a few reports a minute per visitor.
import { countImpressions, liveBillboards } from "@/lib/billboardServer";
import { SlidingWindowLimiter, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const limiter = new SlidingWindowLimiter({ max: 6, windowMs: 60_000 });
const MAX_VIEWS = 20;

export async function POST(req: Request) {
  const body = (await req.text().then((t) => JSON.parse(t.slice(0, 2000))).catch(() => null)) as { views?: unknown } | null;
  const ids = Array.isArray(body?.views) ? [...new Set(body.views.filter((v): v is number => Number.isInteger(v) && v > 0))].slice(0, MAX_VIEWS) : [];
  if (!ids.length || !limiter.allow(clientIp(req) ?? "anon")) return new Response(null, { status: 204 });
  const liveIds = new Set([...(await liveBillboards()).values()].map((b) => b.rentalId));
  await countImpressions(ids.filter((id) => liveIds.has(id)));
  return new Response(null, { status: 204 });
}

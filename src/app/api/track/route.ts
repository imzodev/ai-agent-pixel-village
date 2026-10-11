// Share clicks from the browser (src/lib/shareTracking.ts). Public, but it
// accepts only share clicks, short known values, and a few per minute per IP.
import { getCurrentCharacter } from "@/lib/auth";
import { track } from "@/lib/track";
import { SlidingWindowLimiter, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const limiter = new SlidingWindowLimiter({ max: 20, windowMs: 60_000 });
const VIA = new Set(["x", "native", "copy"]);
const PAGE = new Set(["moment", "profile"]);

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body.kind !== "share_click" || !VIA.has(body.via) || !PAGE.has(body.page)) return new Response(null, { status: 204 });
  if (!limiter.allow(clientIp(req) ?? "anon")) return new Response(null, { status: 204 });
  const me = await getCurrentCharacter().catch(() => null);
  track("share_click", me?.id ?? null, { via: body.via, page: body.page });
  return new Response(null, { status: 204 });
}

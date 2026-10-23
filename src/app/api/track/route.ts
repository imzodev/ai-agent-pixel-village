// From the browser: share clicks (src/lib/shareTracking.ts) and first visits
// with where they came from (src/components/SourceMark.tsx). Public, but it
// accepts only those, short clean values, and a few per minute per IP.
import { getCurrentCharacter } from "@/lib/auth";
import { track } from "@/lib/track";
import { SlidingWindowLimiter, clientIp } from "@/lib/rateLimit";
import { cleanTag } from "@/lib/acquisition";

export const dynamic = "force-dynamic";

const limiter = new SlidingWindowLimiter({ max: 20, windowMs: 60_000 });
const VIA = new Set(["x", "native", "copy"]);
const PAGE = new Set(["moment", "profile", "whistle", "haul", "derby", "oven"]);

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body.kind === "landing") {
    const src = cleanTag(body.src), campaign = cleanTag(body.campaign);
    if (src && limiter.allow(clientIp(req) ?? "anon")) track("landing", null, campaign ? { src, campaign } : { src });
    return new Response(null, { status: 204 });
  }
  if (body.kind !== "share_click" || !VIA.has(body.via) || !PAGE.has(body.page)) return new Response(null, { status: 204 });
  if (!limiter.allow(clientIp(req) ?? "anon")) return new Response(null, { status: 204 });
  const me = await getCurrentCharacter().catch(() => null);
  track("share_click", me?.id ?? null, { via: body.via, page: body.page });
  return new Response(null, { status: 204 });
}

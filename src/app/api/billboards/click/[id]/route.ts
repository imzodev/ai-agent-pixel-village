// A player clicked a billboard: off to the advertiser's own (stored, checked)
// link, so this can't be used to send people anywhere else. One click per
// visitor per poster every 10 minutes counts.
import { clickThrough } from "@/lib/billboardServer";
import { SlidingWindowLimiter, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const clickLimiter = new SlidingWindowLimiter({ max: 1, windowMs: 600_000 });

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  const home = new URL("/", req.url);
  if (!Number.isInteger(id) || id <= 0) return Response.redirect(home, 302);
  const ip = clientIp(req) ?? "anon";
  const url = await clickThrough(id, clickLimiter.allow(`${ip}:${id}`));
  return Response.redirect(url ?? home, 302);
}

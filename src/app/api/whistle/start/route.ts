// Start a Whistle run: today's day and a signed token for the taps to come
// back with (src/lib/whistleServer.ts). No sign-in needed to play.
import { getCurrentCharacter, handleApiError } from "@/lib/auth";
import { clientIp, whistleStartLimiter } from "@/lib/rateLimit";
import { startRun } from "@/lib/whistleServer";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!whistleStartLimiter.allow(clientIp(req) ?? "anon")) return Response.json({ error: "Lots of runs from here. Take a breather." }, { status: 429 });
    const me = await getCurrentCharacter();
    return Response.json(startRun(me?.id ?? null));
  } catch (e) {
    return handleApiError(e);
  }
}

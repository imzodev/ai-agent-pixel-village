// Send in a finished Whistle run { token, inputs }: the server replays the
// taps and keeps its own score (src/lib/whistleServer.ts). Needs a character
// (the page makes a "Play now" one from a name first).
import { handleApiError, requireCharacter } from "@/lib/auth";
import { whistleSubmitLimiter } from "@/lib/rateLimit";
import { WhistleError, submitRun } from "@/lib/whistleServer";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    if (!whistleSubmitLimiter.allow(String(me.id))) return Response.json({ error: "That's a lot of runs. Try again in a while." }, { status: 429 });
    const body = (await req.json().catch(() => ({}))) as { token?: unknown; inputs?: unknown };
    return Response.json(await submitRun(me.id, String(body.token ?? ""), body.inputs));
  } catch (e) {
    if (e instanceof WhistleError) return Response.json({ error: e.message }, { status: e.status });
    return handleApiError(e);
  }
}

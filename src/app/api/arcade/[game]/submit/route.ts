// Send in a finished arcade run { token, inputs }: the server replays the
// inputs and keeps its own score (src/lib/arcadeServer.ts). Needs a character
// (the page makes a "Play now" one from a name first).
import { handleApiError, requireCharacter } from "@/lib/auth";
import { arcadeSubmitLimiter } from "@/lib/rateLimit";
import { ArcadeError, submitRun } from "@/lib/arcadeServer";
import { isArcadeGame } from "@/lib/arcade/games";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ game: string }> }) {
  try {
    const { game } = await ctx.params;
    if (!isArcadeGame(game)) return Response.json({ error: "No such game." }, { status: 404 });
    const me = await requireCharacter();
    if (!arcadeSubmitLimiter.allow(String(me.id))) return Response.json({ error: "That's a lot of runs. Try again in a while." }, { status: 429 });
    const body = (await req.json().catch(() => ({}))) as { token?: unknown; inputs?: unknown };
    return Response.json(await submitRun(game, me.id, String(body.token ?? ""), body.inputs));
  } catch (e) {
    if (e instanceof ArcadeError) return Response.json({ error: e.message }, { status: e.status });
    return handleApiError(e);
  }
}

// Start an arcade run: today's course and a signed token for the inputs to
// come back with (src/lib/arcadeServer.ts). No sign-in needed to play.
import { getCurrentCharacter, handleApiError } from "@/lib/auth";
import { arcadeStartLimiter, clientIp } from "@/lib/rateLimit";
import { startRun } from "@/lib/arcadeServer";
import { isArcadeGame } from "@/lib/arcade/games";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ game: string }> }) {
  try {
    const { game } = await ctx.params;
    if (!isArcadeGame(game)) return Response.json({ error: "No such game." }, { status: 404 });
    if (!arcadeStartLimiter.allow(clientIp(req) ?? "anon")) return Response.json({ error: "Lots of runs from here. Take a breather." }, { status: 429 });
    const me = await getCurrentCharacter();
    return Response.json(startRun(game, me?.id ?? null));
  } catch (e) {
    return handleApiError(e);
  }
}

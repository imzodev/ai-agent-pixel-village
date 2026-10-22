// An arcade game's page data (src/lib/arcadeServer.ts): today's course and
// number, today's and this week's boards, last week's champions and, signed
// in, how I'm doing.
import { getCurrentCharacter, handleApiError } from "@/lib/auth";
import { arcadeView } from "@/lib/arcadeServer";
import { isArcadeGame } from "@/lib/arcade/games";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ game: string }> }) {
  try {
    const { game } = await ctx.params;
    if (!isArcadeGame(game)) return Response.json({ error: "No such game." }, { status: 404 });
    const me = await getCurrentCharacter();
    return Response.json(await arcadeView(game, me ? { id: me.id, name: me.name } : null));
  } catch (e) {
    return handleApiError(e);
  }
}

// The player closed a moment's share card: don't show it again.
import { handleApiError, requireCharacter } from "@/lib/auth";
import { markSeen } from "@/lib/momentsServer";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireCharacter();
    const { id } = await ctx.params;
    await markSeen(id, me.id);
    return Response.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

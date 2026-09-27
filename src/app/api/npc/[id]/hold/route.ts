import { eq } from "drizzle-orm";
import { db } from "@/db";
import { npcs } from "@/db/schema";
import { handleApiError, requireCharacter } from "@/lib/auth";
import { NPC_TALK_HOLD_MS } from "@/lib/constants";
import { rowPositionAt } from "@/lib/motion";
import { holdNpc } from "@/lib/moveStore";
import { getLivePlayerPosition, markWorldDirty } from "@/lib/world-stream";

export const dynamic = "force-dynamic";

/**
 * Keepalive while a talk dialog is open: renews the NPC's hold so it
 * keeps standing still. Cheap (no LLM). The hold lapses on its own once
 * the dialog stops calling this.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const character = await requireCharacter();
    const { id } = await ctx.params;
    const [npc] = await db.select().from(npcs).where(eq(npcs.id, Number(id)));
    if (!npc || !npc.active) return Response.json({ error: "Nobody there." }, { status: 404 });
    const npcPos = rowPositionAt(npc, Date.now());
    const me = getLivePlayerPosition(character.id) ?? character;
    if (Math.hypot(npcPos.x - me.x, npcPos.y - me.y) > 160) {
      return Response.json({ error: "Walk a little closer first." }, { status: 400 });
    }
    const hold = await holdNpc(npc.id, Date.now(), NPC_TALK_HOLD_MS);
    if (hold?.stopped) markWorldDirty(hold.x, hold.y);
    return Response.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

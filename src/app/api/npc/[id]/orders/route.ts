// An NPC's standing orders, for the Orders menu: what they take, and how
// your week is going. Taking and delivering go through /api/npc/[id]/accept
// (offer ids `order:<item>` and `deliver:<item>`).

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { npcs } from "@/db/schema";
import { handleApiError, requireCharacter } from "@/lib/auth";
import { ordersView } from "@/lib/ordersServer";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const character = await requireCharacter();
    const { id } = await ctx.params;
    const [npc] = await db.select().from(npcs).where(eq(npcs.id, Number(id)));
    if (!npc) return Response.json({ error: "Nobody there." }, { status: 404 });
    return Response.json(await ordersView(npc, character.id));
  } catch (e) {
    return handleApiError(e);
  }
}

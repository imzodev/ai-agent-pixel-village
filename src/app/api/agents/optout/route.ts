import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentOptouts } from "@/db/schema";
import { handleApiError, requireCharacter } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Players choose whether business agents may pitch them. sponsorId 0 means
 * every business agent. GET reads it, POST { optOut: boolean } sets it.
 */
const ALL = 0;

export async function GET() {
  try {
    const ch = await requireCharacter();
    const [row] = await db.select().from(agentOptouts).where(and(eq(agentOptouts.characterId, ch.id), eq(agentOptouts.sponsorId, ALL)));
    return Response.json({ optOut: !!row });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const ch = await requireCharacter();
    const b = await req.json().catch(() => ({}));
    const current = and(eq(agentOptouts.characterId, ch.id), eq(agentOptouts.sponsorId, ALL));
    if (b.optOut === true) {
      const [row] = await db.select().from(agentOptouts).where(current);
      if (!row) await db.insert(agentOptouts).values({ characterId: ch.id, sponsorId: ALL });
    } else {
      await db.delete(agentOptouts).where(current);
    }
    return Response.json({ ok: true, optOut: b.optOut === true });
  } catch (e) {
    return handleApiError(e);
  }
}

// Your wild-patch picks still cooling down (src/lib/forage.ts), so the
// client can hide those patches for you until they're back.
// GET → { claims: [{ patch, readyAt }] }

import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { forageClaims } from "@/db/schema";
import { handleApiError, requireCharacter } from "@/lib/auth";
import { FORAGE_COOLDOWN_MS } from "@/lib/forage";

export const dynamic = "force-dynamic";

const LONGEST = Math.max(...Object.values(FORAGE_COOLDOWN_MS));

export async function GET() {
  try {
    const me = await requireCharacter();
    const now = Date.now();
    const rows = await db.select().from(forageClaims).where(and(eq(forageClaims.characterId, me.id), gt(forageClaims.at, new Date(now - LONGEST))));
    const claims = rows
      .map((r) => ({ patch: r.patch, readyAt: r.at.getTime() + (FORAGE_COOLDOWN_MS[r.patch.split("@")[0]] ?? 0) }))
      .filter((c) => c.readyAt > now);
    return Response.json({ claims });
  } catch (e) {
    return handleApiError(e);
  }
}

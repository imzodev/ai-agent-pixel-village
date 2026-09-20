import { eq } from "drizzle-orm";
import { db } from "@/db";
import { characters } from "@/db/schema";
import { getCurrentCharacter, handleApiError } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { tickWorld } from "@/lib/sim";
import { isWalkableServer } from "@/lib/chunkCollisionServer";
import { getSnapshot } from "@/lib/snapshot";
import { refreshLastSeen } from "@/lib/presence";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeeded();
    await tickWorld();
    const me = await getCurrentCharacter();
    // GET is a heartbeat too: without this, a character whose lastSeenAt
    // expired while the client had no player never re-enters the 45s players
    // window — me comes back without id/x/y, the client can't spawn, and it
    // never starts POSTing positions again. Throttled to one Postgres write
    // per LAST_SEEN_TTL_SECONDS per player.
    if (me) await refreshLastSeen(me.id);
    const snap = await getSnapshot(me?.id ?? null, me?.x ?? 1024, me?.y ?? 760);
    return Response.json(snap);
  } catch (e) {
    return handleApiError(e);
  }
}

/** Heartbeat: update my position, then return the snapshot. */
export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const me = await getCurrentCharacter();
    let px = me?.x ?? 1024;
    let py = me?.y ?? 760;
    if (me) {
      const body = await req.json().catch(() => ({}));
      const x = Number(body.x), y = Number(body.y);
      const facing = ["up", "down", "left", "right"].includes(body.facing) ? body.facing : me.facing;
      if (Number.isFinite(x) && Number.isFinite(y) && (await isWalkableServer(x, y)) && Math.hypot(x - me.x, y - me.y) < 600) {
        px = x; py = y;
        await refreshLastSeen(me.id, { x, y, facing });
      } else {
        await refreshLastSeen(me.id, { facing });
      }
    }
    await tickWorld();
    const snap = await getSnapshot(me?.id ?? null, px, py);
    return Response.json(snap);
  } catch (e) {
    return handleApiError(e);
  }
}

// Jobs (src/lib/jobs.ts): GET your jobs (and, with ?npcKey=, what that NPC
// offers); POST { action: "hire" | "quit" | "work", jobKey } or
// { action: "deliver", npcKey } (hand a letter over).

import { handleApiError, requireCharacter } from "@/lib/auth";
import { getLivePlayerPosition } from "@/lib/world-stream";
import { deliverLetter, hire, jobsFor, offersAt, quit, workShift } from "@/lib/jobsServer";
import { npcDef } from "@/lib/npcDefs";
import type { JobsResponse } from "@/types/jobs";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const me = await requireCharacter();
    const npcKey = new URL(req.url).searchParams.get("npcKey") ?? "";
    const body: JobsResponse = { jobs: await jobsFor(me.id), offers: npcKey ? await offersAt(me, npcKey) : [], ...(npcKey ? { employerName: npcDef(npcKey)?.name } : {}) };
    return Response.json(body);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const at = getLivePlayerPosition(me.id) ?? me;
    const who = { ...me, x: at.x, y: at.y };
    const jobKey = String(body.jobKey ?? "");
    const r = body.action === "hire" ? await hire(who, jobKey)
      : body.action === "quit" ? await quit(me.id, jobKey)
      : body.action === "work" ? await workShift(who, jobKey)
      : body.action === "deliver" ? await deliverLetter(who, String(body.npcKey ?? ""))
      : ({ ok: false, error: "Unknown action." } as const);
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
    return Response.json({ ok: true, message: r.message, notices: r.notices, gained: r.gained ?? [], jobs: await jobsFor(me.id) });
  } catch (e) {
    return handleApiError(e);
  }
}

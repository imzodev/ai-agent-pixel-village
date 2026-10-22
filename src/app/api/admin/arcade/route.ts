// Admin only (x-admin-token, src/lib/adminAuth.ts): the arcade's runs and prizes.
//   POST { runId, hide }           hide: true (default) takes a run off the boards, false puts it back
//   POST { game, award: week }     award a game's finished week now (idempotent)
import { isAdmin, notFound } from "@/lib/adminAuth";
import { awardWeek, hideRun } from "@/lib/arcadeServer";
import { isArcadeGame } from "@/lib/arcade/games";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAdmin(req)) return notFound();
  const b = (await req.json().catch(() => ({}))) as { runId?: unknown; hide?: unknown; game?: unknown; award?: unknown };
  if (typeof b.award === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.award)) {
    if (!isArcadeGame(b.game)) return Response.json({ error: "game required" }, { status: 400 });
    return Response.json({ awarded: await awardWeek(b.game, b.award) });
  }
  if (typeof b.runId !== "string") return Response.json({ error: "runId required" }, { status: 400 });
  const ok = await hideRun(b.runId, b.hide !== false);
  return ok ? Response.json({ ok: true }) : Response.json({ error: "No such run." }, { status: 404 });
}

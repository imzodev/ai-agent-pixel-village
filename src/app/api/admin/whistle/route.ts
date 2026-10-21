// Admin only (x-admin-token, src/lib/adminAuth.ts): take a Whistle run off the boards.
//   POST { runId, hide }    hide: true (default) takes it off, false puts it back
//   POST { award: week }    award a finished week's prizes now (idempotent)
import { isAdmin, notFound } from "@/lib/adminAuth";
import { awardWeek, hideRun } from "@/lib/whistleServer";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAdmin(req)) return notFound();
  const b = (await req.json().catch(() => ({}))) as { runId?: unknown; hide?: unknown; award?: unknown };
  if (typeof b.award === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.award)) return Response.json({ awarded: await awardWeek(b.award) });
  if (typeof b.runId !== "string") return Response.json({ error: "runId required" }, { status: 400 });
  const ok = await hideRun(b.runId, b.hide !== false);
  return ok ? Response.json({ ok: true }) : Response.json({ error: "No such run." }, { status: 404 });
}

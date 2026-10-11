// Report another player (offensive chat or name, spam, cheating…). The
// report keeps their latest chat lines; admins read them at /api/admin/reports.
import { handleApiError, requireCharacter } from "@/lib/auth";
import { fileReport } from "@/lib/moderationServer";
import { REPORT_REASONS } from "@/lib/moderation";
import { reportLimiter } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const reason = REPORT_REASONS.includes(body.reason) ? String(body.reason) : "Other";
    if (!reportLimiter.allow(String(me.id))) return Response.json({ error: "You've sent a lot of reports. Thanks; we'll look at them." }, { status: 429 });
    const err = await fileReport(me.id, Number(body.characterId), reason);
    return err ? Response.json({ error: err }, { status: 400 }) : Response.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

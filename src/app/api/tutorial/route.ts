import { handleApiError, requireCharacter } from "@/lib/auth";
import { skipTutorial } from "@/lib/tutorialServer";

export const dynamic = "force-dynamic";

/** Tutorial actions: { action: "skip" }. Progress itself comes from play. */
export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    if (body.action !== "skip") return Response.json({ error: "Unknown action." }, { status: 400 });
    await skipTutorial(me.id);
    return Response.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

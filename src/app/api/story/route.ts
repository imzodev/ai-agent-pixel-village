import { handleApiError, requireCharacter } from "@/lib/auth";
import { abandonStory, startTemplate, storyState, writeStory } from "@/lib/story/storyServer";

export const dynamic = "force-dynamic";
// Writing a story can take the AI a while.
export const maxDuration = 90;

/** The story window: the current story, the hand-written ones to pick, today's starts left. */
export async function GET() {
  try {
    const me = await requireCharacter();
    return Response.json(await storyState(me.id));
  } catch (e) {
    return handleApiError(e);
  }
}

/** { action: "template", key } | { action: "write", about } | { action: "sequel", of } | { action: "abandon" }. */
export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const r =
      body.action === "template" ? await startTemplate(me.id, String(body.key ?? ""))
      : body.action === "write" ? await writeStory(me.id, String(body.about ?? ""))
      : body.action === "sequel" ? await writeStory(me.id, String(body.about ?? ""), Number(body.of))
      : body.action === "abandon" ? await abandonStory(me.id)
      : ({ ok: false, error: "Unknown action." } as const);
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
    return Response.json(r);
  } catch (e) {
    return handleApiError(e);
  }
}

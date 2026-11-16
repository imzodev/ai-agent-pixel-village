import { handleApiError, requireCharacter } from "@/lib/auth";
import { chooseTraits, traitsState } from "@/lib/traitsServer";
import { qualitiesFor } from "@/lib/qualitiesServer";

export const dynamic = "force-dynamic";

/** Who the character is: origin, traits, whether they can still choose, and their qualities. */
export async function GET() {
  try {
    const me = await requireCharacter();
    const [state, qualities] = await Promise.all([traitsState(me.id), qualitiesFor(me.id)]);
    return Response.json({ ...state, qualities });
  } catch (e) {
    return handleApiError(e);
  }
}

/** { origin, traits: [a, b] }: choose (or, on the first day, change) them. */
export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const r = await chooseTraits(me.id, body.origin, body.traits);
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
    return Response.json(r);
  } catch (e) {
    return handleApiError(e);
  }
}

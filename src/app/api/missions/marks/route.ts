// Mission markers for the world (src/lib/offers.ts missionMarks): which
// villagers have a mission for you ("!") or one to turn in ("?").
import { handleApiError, requireCharacter } from "@/lib/auth";
import { missionMarks } from "@/lib/offers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await requireCharacter();
    return Response.json({ marks: await missionMarks(me.id) });
  } catch (e) {
    return handleApiError(e);
  }
}

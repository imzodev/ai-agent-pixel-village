// Your standing with each continent town (src/lib/reputation.ts).

import { handleApiError, requireCharacter } from "@/lib/auth";
import { reputationView } from "@/lib/reputationServer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await requireCharacter();
    return Response.json({ towns: await reputationView(me.id) });
  } catch (e) {
    return handleApiError(e);
  }
}

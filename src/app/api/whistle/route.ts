// Whistle's boards (src/lib/whistleServer.ts): today's course number, today's
// and this week's boards, last week's champions and, signed in, how I'm doing.
import { getCurrentCharacter, handleApiError } from "@/lib/auth";
import { whistleView } from "@/lib/whistleServer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await getCurrentCharacter();
    return Response.json(await whistleView(me ? { id: me.id, name: me.name } : null));
  } catch (e) {
    return handleApiError(e);
  }
}

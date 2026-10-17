// Admin only (x-admin-token, src/lib/adminAuth.ts): NPCs talking to each
// other (src/lib/npcTalkServer.ts).
//   GET ?limit=20 → the latest conversations (line by line), live rumours
//       (how many NPCs have heard each) and how pairs of NPCs get on.

import { isAdmin, notFound } from "@/lib/adminAuth";
import { talkReport } from "@/lib/npcTalkServer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAdmin(req)) return notFound();
  const limit = Math.max(1, Math.min(100, Number(new URL(req.url).searchParams.get("limit")) || 20));
  return Response.json(await talkReport(limit));
}

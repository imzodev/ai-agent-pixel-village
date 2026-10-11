// Admin only (x-admin-token, src/lib/adminAuth.ts): how the game is doing.
import { isAdmin, notFound } from "@/lib/adminAuth";
import { statsView } from "@/lib/statsServer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAdmin(req)) return notFound();
  return Response.json(await statsView());
}

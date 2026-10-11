// Admin only (x-admin-token, src/lib/adminAuth.ts): open player reports.
import { isAdmin, notFound } from "@/lib/adminAuth";
import { openReports } from "@/lib/moderationServer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAdmin(req)) return notFound();
  return Response.json({ reports: await openReports() });
}

// Admin only (x-admin-token, src/lib/adminAuth.ts): review billboards.
//   GET                                  paid billboards and changes waiting
//   POST { id, action, reason? }         approve | reject (refunds a new one) | takedown
import { isAdmin, notFound } from "@/lib/adminAuth";
import { BillboardError, adminAction, adminList } from "@/lib/billboardServer";
import type { AdminBillboardAction } from "@/types/billboard";

export const dynamic = "force-dynamic";

const ACTIONS: readonly AdminBillboardAction[] = ["approve", "reject", "takedown"];

export async function GET(req: Request) {
  if (!isAdmin(req)) return notFound();
  return Response.json({ billboards: await adminList() });
}

export async function POST(req: Request) {
  if (!isAdmin(req)) return notFound();
  const b = (await req.json().catch(() => ({}))) as { id?: unknown; action?: unknown; reason?: unknown };
  const action = ACTIONS.find((a) => a === b.action);
  if (!action || !Number.isInteger(b.id)) return Response.json({ error: "id and action required" }, { status: 400 });
  try {
    await adminAction(b.id as number, action, String(b.reason ?? "").slice(0, 200));
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof BillboardError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

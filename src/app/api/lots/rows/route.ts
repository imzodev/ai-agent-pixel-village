// Admin only (x-admin-token, src/lib/adminAuth.ts): homestead lot rows.
// GET: which rows are open. POST { kind }: open that kind's next row now,
// without waiting for its lots to fill (src/lib/lotRowsServer.ts).
import { isAdmin, notFound } from "@/lib/adminAuth";
import { forceOpenNextRow, refreshOpenRows } from "@/lib/lotRowsServer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAdmin(req)) return notFound();
  return Response.json({ open: [...(await refreshOpenRows())].sort() });
}

export async function POST(req: Request) {
  if (!isAdmin(req)) return notFound();
  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind ?? "");
  if (!["land", "ranch", "vineyard", "workshop"].includes(kind)) return Response.json({ error: "kind: land, ranch, vineyard or workshop" }, { status: 400 });
  const row = await forceOpenNextRow(kind);
  return row ? Response.json({ ok: true, opened: row }) : Response.json({ error: `No closed ${kind} row left.` }, { status: 400 });
}

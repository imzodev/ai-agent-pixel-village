// Admin only (x-admin-token, src/lib/adminAuth.ts): look inside an NPC's mind.
//   GET  ?npcKey=village_marigold → stock, purse, intent, the last decision
//        (Jev's probabilities and confidence, or why the script decided),
//        memories and open requests.
//   POST { npcKey, stock?, purse?, think? } → set stock / purse for testing,
//        and/or make it think right now.

import { isAdmin, notFound } from "@/lib/adminAuth";
import { adminMind, mindReport } from "@/lib/mind/mindServer";
import type { NpcStock } from "@/types/mind";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAdmin(req)) return notFound();
  const key = new URL(req.url).searchParams.get("npcKey") ?? "";
  const r = await mindReport(key);
  return r ? Response.json(r) : Response.json({ error: "No mind there." }, { status: 404 });
}

export async function POST(req: Request) {
  if (!isAdmin(req)) return notFound();
  const body = await req.json().catch(() => ({}));
  const stock = body.stock && typeof body.stock === "object"
    ? Object.fromEntries(Object.entries(body.stock as Record<string, unknown>).filter(([, v]) => Number.isFinite(Number(v))).map(([k, v]) => [k, Math.max(0, Math.floor(Number(v)))])) as NpcStock
    : undefined;
  const r = await adminMind(String(body.npcKey ?? ""), { stock, purse: body.purse != null ? Number(body.purse) : undefined, think: !!body.think });
  return r ? Response.json(r) : Response.json({ error: "No mind there." }, { status: 404 });
}

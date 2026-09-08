// Thin transport shell for the trade action. The db-touching logic lives
// here (not in src/lib/trade.ts, which must stay client-safe to avoid
// pulling the pg driver into the browser bundle).
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, npcs } from "@/db/schema";
import { handleApiError, requireCharacter } from "@/lib/auth";
import { TRADES, findBuyer } from "@/lib/trade";
import { addCoins, logEvent, removeItem } from "@/lib/game";

export const dynamic = "force-dynamic";

type SellResult =
  | { ok: true; soldTo: string; itemKey: string; qty: number; gained: number; coins: number }
  | { ok: false; error: string };

async function performSell(opts: {
  characterId: number;
  itemKey: string;
  qty: number;
  npcKey?: string;
}): Promise<SellResult> {
  const qty = Math.max(1, Math.min(99, Math.floor(opts.qty || 1)));
  if (!opts.itemKey) return { ok: false, error: "What are you selling?" };

  const buyer = opts.npcKey
    ? { npcKey: opts.npcKey, trade: TRADES[opts.npcKey]?.find((t) => t.itemKey === opts.itemKey) ?? null }
    : findBuyer(opts.itemKey);
  if (!buyer || !buyer.trade) return { ok: false, error: "Nobody here buys that." };

  const [npc] = await db.select().from(npcs).where(eq(npcs.key, buyer.npcKey));
  if (!npc) return { ok: false, error: "Nobody here buys that." };

  const ok = await removeItem(opts.characterId, opts.itemKey, qty);
  if (!ok) return { ok: false, error: "You don't have that." };

  const gained = buyer.trade.price * qty;
  await addCoins(opts.characterId, gained);
  const [row] = await db
    .select({ coins: sql<number>`coalesce(${characters.coins}, 0)::int` })
    .from(characters)
    .where(eq(characters.id, opts.characterId));
  return { ok: true, soldTo: npc.name, itemKey: opts.itemKey, qty, gained, coins: row?.coins ?? 0 };
}

export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const itemKey = String(body.itemKey ?? "");
    const qty = Math.max(1, Math.min(99, Number(body.qty ?? 1)));
    const npcKey = body.npcKey ? String(body.npcKey) : undefined;

    const r = await performSell({ characterId: me.id, itemKey, qty, npcKey });
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });

    await logEvent(
      "trade",
      `${me.name} sold ${r.qty} ${r.itemKey} to ${r.soldTo} for ${r.gained} coin.`,
      "character",
      me.id,
      me.x,
      me.y,
    );
    return Response.json({ ok: true, soldTo: r.soldTo, itemKey: r.itemKey, qty: r.qty, gained: r.gained, coins: r.coins });
  } catch (e) {
    return handleApiError(e);
  }
}

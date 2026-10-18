// The caravan, the pure part (the server is src/lib/mind/mindServer.ts
// tradeAtMarket): a trader with a mind who travels a circuit of markets. At
// each stop she sells what she carries to the town's buyers, drops off what
// the town's makers are short of, and buys up what the town has had too much
// of (and its own land's goods) when another stop pays more. Goods move
// between towns, and a flooded town recovers faster when she comes through.

import { TOWNS } from "../settlements";
import { ORCHARD_FRUITS } from "../orchard";
import type { CaravanBuy, CaravanCandidate, MindOption, MindProfile, MindView } from "@/types/mind";

/** How long she trades at a stop before moving on. */
export const STOP_LINGER_MS = 8 * 60_000;
/** The most she carries. */
export const LOAD_MAX = 40;
/** She buys only what another stop pays at least this much more for. */
export const MIN_MARGIN = 1.3;
/** Of her purse, the most she spends at one stop. */
export const SPEND_SHARE = 0.6;

const FAMILY_GOODS: Readonly<Record<string, readonly string[]>> = {
  port: ["silver_minnow", "pond_perch", "river_trout"],
  desert: ["chitin"],
  snow: ["frost_pelt", "wood"],
  swamp: ["herb", "lurker_hide"],
  darkwood: ["mushroom", "shade_essence"],
  hills: ["wheat", "wool", "pumpkin"],
};

/** What a market makes itself (its land's goods), which she can buy there. */
export function localGoods(market: string): string[] {
  if (market === "village") return ["wheat", "egg", "milk", "honey", "apple"];
  if (market === "hollowmere") return ["wood", "plank"];
  if (market === "brightwater") return ["silver_minnow", "river_trout", "catfish"];
  const town = TOWNS.find((t) => t.key === market);
  if (!town) return [];
  return [...ORCHARD_FRUITS.filter((f) => f.families.includes(town.family)).map((f) => f.fruit), ...(FAMILY_GOODS[town.family] ?? [])];
}

/** The stop an intent (`travel:2`, `stay:2`) is about, or null. */
export function stopOf(intent: string): number | null {
  const m = /^(?:travel|stay):(\d+)$/.exec(intent);
  return m ? Number(m[1]) : null;
}

/** Where she goes next: the stop after the one she's at (round the circuit), else the first. */
export function nextStop(p: MindProfile, intent: string): number {
  const n = p.circuit?.length ?? 0;
  const at = stopOf(intent);
  return n === 0 ? 0 : at == null ? 0 : (at + 1) % n;
}

/** Her options: walking, nothing to decide; at a stop, mind the stall a while; then travel on. One at a time, so never a Jev call. */
export function caravanActions(p: MindProfile, v: MindView): MindOption[] {
  if (v.onTrip) return [{ key: "wait", description: "Keep travelling" }];
  const stop = stopOf(v.intent);
  if (v.intent.startsWith("stay:") && v.arrivedAt != null && v.now - v.arrivedAt < STOP_LINGER_MS) {
    return [{ key: "tend_shop", description: `Mind the stall at ${p.circuit?.[stop ?? 0]?.place ?? "this stop"}` }];
  }
  const next = nextStop(p, v.intent);
  const to = p.circuit?.[next];
  return to ? [{ key: `travel:${next}`, description: `Pack up the wagon and travel on to ${to.place}` }] : [{ key: "wait", description: "Wait" }];
}

/**
 * What to buy at a stop: goods another stop pays MIN_MARGIN more for, the
 * best margins first. A glutted good, up to most of the glut (she takes the
 * flood off the town's hands); the town's own goods, a few. No more than her
 * wagon holds or SPEND_SHARE of her purse.
 */
export function pickBuys(cands: readonly CaravanCandidate[], load: number, purse: number): CaravanBuy[] {
  let room = Math.max(0, LOAD_MAX - load), budget = Math.floor(purse * SPEND_SHARE);
  const out: CaravanBuy[] = [];
  const good = cands.filter((c) => c.here > 0 && c.elsewhere >= c.here * MIN_MARGIN).sort((a, b) => b.elsewhere / b.here - a.elsewhere / a.here);
  for (const c of good) {
    const unit = Math.max(1, Math.ceil(c.here));
    let qty = c.glut >= 1 ? Math.min(20, Math.round(c.glut * 0.6)) : 6;
    qty = Math.min(qty, room, Math.floor(budget / unit));
    if (qty <= 0) continue;
    out.push({ itemKey: c.itemKey, qty, unit });
    room -= qty;
    budget -= qty * unit;
  }
  return out;
}

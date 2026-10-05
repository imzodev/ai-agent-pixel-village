// Furniture commissions, the pure part: innkeepers, the mayor, Marigold and
// others order pieces now and then (tavern chairs, a polished table…).
// Each commission is a mission keyed `com_<npcKey>_<ms>` (collect the
// pieces, get paid), so it shows in their talk offers and turns in through
// the usual accept flow; the first player to deliver closes it, and it
// expires after COMMISSION_TTL_MS. tickd posts them (commissionsServer.ts).

import { FURNITURE_VALUE } from "./furniture";
import { SETTLEMENT_NPCS } from "./settlements";
import { hash } from "./terrain/noise";
import type { Commissioner, CommissionWish } from "@/types/commissions";

export type { Commissioner, CommissionWish } from "@/types/commissions";

export const COMMISSION_EVERY_MS = 30 * 60_000;
export const COMMISSION_TTL_MS = 24 * 3600_000;
/** Pay over the pieces' value: making to order is worth more than selling. */
export const COMMISSION_PAY_MULT = 1.6;
/** Chance an NPC without an open commission posts one in a given half hour. */
export const COMMISSION_CHANCE = 0.35;
export const COMMISSION_XP = 6;

export const COMMISSIONERS: readonly Commissioner[] = [
  { npcKey: "hollowmere_ivy", wishes: [{ item: "chair", qty: 4 }, { item: "table", qty: 2 }, { item: "stool", qty: 4 }] },
  { npcKey: "village_hettie", wishes: [{ item: "chair", qty: 3 }, { item: "table", qty: 1 }, { item: "bookshelf", qty: 1 }] },
  { npcKey: "brightwater_coral", wishes: [{ item: "chair", qty: 2 }, { item: "rug", qty: 1 }, { item: "armchair", qty: 1 }] },
  { npcKey: "brightwater_wynn", wishes: [{ item: "polished_table", qty: 1 }, { item: "wardrobe", qty: 1 }, { item: "polished_cabinet", qty: 1 }] },
  { npcKey: "village_marigold", wishes: [{ item: "cabinet", qty: 1 }, { item: "stool", qty: 2 }] },
  { npcKey: "hollowmere_bjorn", wishes: [{ item: "stool", qty: 2 }, { item: "chair", qty: 1 }] },
  // The continent's innkeepers furnish their taverns too.
  ...SETTLEMENT_NPCS.filter((n) => n.job === "innkeeper").map((n) => ({ npcKey: n.key, wishes: [{ item: "chair", qty: 4 }, { item: "table", qty: 1 }, { item: "rocking_chair", qty: 1 }] })),
];

export const commissionKey = (npcKey: string, at: number) => `com_${npcKey}_${at}`;
export const isCommissionKey = (key: string) => key.startsWith("com_");
/** When a commission was posted (from its key). */
export const postedAt = (key: string) => Number(key.split("_").at(-1)) || 0;

/** What a commission pays. */
export function commissionPay(w: CommissionWish): number {
  return Math.round((FURNITURE_VALUE[w.item] ?? 10) * w.qty * COMMISSION_PAY_MULT);
}

/** Does this NPC post a commission in this half hour, and which one? (deterministic) */
export function commissionFor(c: Commissioner, slot: number): CommissionWish | null {
  const salt = [...c.npcKey].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7);
  if (hash(slot, salt, 71) >= COMMISSION_CHANCE) return null;
  return c.wishes[Math.floor(hash(salt, slot, 72) * c.wishes.length) % c.wishes.length];
}

// Supply and demand, the pure part (the server is src/lib/marketServer.ts).
// Every market (the village, Hollowmere, Brightwater, each town) remembers
// how much of each item it has been sold lately: its `glut`. Each unit sold
// adds one; the glut halves every DEMAND_HALF_LIFE_MS. What buyers pay falls
// as the glut grows — base / (1 + glut / depth), never below PRICE_FLOOR of
// base — so flooding one market pays less and less, and the next town over
// pays full price. Buyers in a market share its glut.

import { itemValue } from "./itemDefs";
import type { MarketTrend } from "@/types/economy";

const env = (k: string, d: number) => { const n = Number(process.env[k]); return Number.isFinite(n) && n > 0 ? n : d; };

/** The glut halves this often (a market forgets a flood over an afternoon). */
export const DEMAND_HALF_LIFE_MS = env("DEMAND_HALF_LIFE_MS", 3 * 3600_000);
/** Buyers never pay less than this share of base, however full the market. */
export const PRICE_FLOOR = 0.1;

/**
 * How much of an item one specialist buyer takes before its price halves
 * (a market's depth scales with its buyers: marketDepth in trade.ts). Cheap bulk
 * goods are shallow (wheat ~48, a minnow ~34, trout ~24); dear ones deeper in
 * coins but fewer in number (a pike ~8: one barely moves the price).
 */
export function depthOf(itemKey: string): number {
  const v = Math.max(1, itemValue(itemKey));
  return Math.max(8, Math.round(48 / Math.sqrt(v)));
}

/** A glut `dtMs` later. */
export const decayGlut = (glut: number, dtMs: number): number => (glut <= 0 ? 0 : glut * 0.5 ** (Math.max(0, dtMs) / DEMAND_HALF_LIFE_MS));

/** The share of base a buyer pays at this glut. */
export const demandFactor = (glut: number, depth: number): number => Math.max(PRICE_FLOOR, 1 / (1 + Math.max(0, glut) / depth));

/** What the next one sells for. */
export const unitPrice = (base: number, glut: number, depth: number): number => base * demandFactor(glut, depth);

/** What `qty` sell for together: each priced after the one before (unrounded). */
export function bulkPay(base: number, glut: number, depth: number, qty: number): number {
  let total = 0;
  for (let i = 0; i < qty; i++) total += unitPrice(base, glut + i, depth);
  return total;
}

/** How many of `want` a buyer with `purse` (null: no limit) can pay for, at `mult` (Haggler) on top. */
export function affordableBulk(base: number, glut: number, depth: number, want: number, purse: number | null, mult = 1): number {
  if (purse == null) return want;
  let n = 0, total = 0;
  while (n < want) {
    const next = total + unitPrice(base, glut + n, depth) * mult;
    if (Math.round(next) > purse) break;
    total = next;
    n++;
  }
  return n;
}

/** How a market feels about an item, in a word for the Sell window. */
export function trendOf(glut: number, depth: number): MarketTrend {
  const f = demandFactor(glut, depth);
  return f >= 0.9 ? "fresh" : f >= 0.5 ? "plenty" : "glut";
}

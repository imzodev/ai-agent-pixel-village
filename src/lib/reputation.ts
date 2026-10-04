// Town reputation: helping a continent town (trading with its people,
// its bounties) raises your standing there — Neutral, Friendly, Honoured,
// Revered — for shop discounts and, at Revered, the title "Friend of
// <town>". Pure rules; the store is src/lib/reputationServer.ts.

import { SETTLEMENT_NPCS, TOWNS } from "./settlements";
import type { RepTier } from "@/types/reputation";

export type { RepTier, RepView } from "@/types/reputation";

export const REP_TIERS: readonly RepTier[] = [
  { name: "Neutral", min: 0, discount: 0 },
  { name: "Friendly", min: 50, discount: 0.05 },
  { name: "Honoured", min: 150, discount: 0.1 },
  { name: "Revered", min: 400, discount: 0.15 },
];
/** Points for one trade with a town's people. */
export const REP_PER_TRADE = 1;

export function repTier(points: number): RepTier {
  return [...REP_TIERS].reverse().find((t) => points >= t.min) ?? REP_TIERS[0];
}
export function nextTier(points: number): RepTier | null {
  return REP_TIERS.find((t) => t.min > points) ?? null;
}
/** The town an NPC belongs to (continent towns only). */
export function townOfNpc(npcKey: string): string | null {
  return SETTLEMENT_NPCS.find((n) => n.key === npcKey)?.town ?? null;
}
export const townName = (town: string): string => TOWNS.find((t) => t.key === town)?.name ?? town;
/** A price after a town's reputation discount (never below 1). */
export const discounted = (price: number, points: number): number => Math.max(1, Math.round(price * (1 - repTier(points).discount)));
/** The title Revered standing earns. */
export const repTitle = (town: string): string => `Friend of ${townName(town)}`;

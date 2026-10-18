// Tool wear: axes, blades, bows and the fishing rod wear with use, work worse
// when worn and never break; Bjorn repairs them for coins at the forge. The
// wear (0–WEAR_MAX) lives on the inventory row (`meta.wear`), like a forge
// level. Pure rules here; the writes are src/lib/wearServer.ts.

import { AXE_ITEMS, BOWS, WEAPONS } from "./progression";
import { FISHING_ROD } from "./fishing";
import { itemValue } from "./itemDefs";
import { plusOf } from "./forge";
import type { WearLevel, WearUse } from "@/types/forge";

export type { WearLevel, WearUse } from "@/types/forge";

export const WEAR_MAX = 100;
/** From here a tool works a little worse. */
export const WORN_AT = 75;
/** Wear per use: about 200 chops, 400 sword hits, 200 shots or 200 casts from new to dull. */
export const WEAR_PER_USE: Readonly<Record<WearUse, number>> = { chop: 0.5, hit: 0.25, shot: 0.5, cast: 0.5 };
/** A full repair costs REPAIR_K × √value (an axe ~25, a steel sword ~64, the Hollow Edge ~174). */
export const REPAIR_K = 5;

/** Does this item wear with use? */
export const wears = (itemKey: string): boolean =>
  AXE_ITEMS.includes(itemKey) || itemKey === FISHING_ROD || itemKey in BOWS || (WEAPONS[itemKey]?.damage ?? 0) > 0;

/** An inventory row's wear (0 when none or malformed). */
export function wearOf(meta: unknown): number {
  const w = (meta as { wear?: unknown } | null)?.wear;
  return typeof w === "number" && Number.isFinite(w) && w > 0 ? Math.min(WEAR_MAX, w) : 0;
}

export const wearLevel = (wear: number): WearLevel => (wear >= WEAR_MAX ? "dull" : wear >= WORN_AT ? "worn" : "fine");

/** Wood per chop with a worn axe: one less when worn, half when dull (never none). */
export function wornYield(yieldAmt: number, wear: number): number {
  const l = wearLevel(wear);
  return l === "dull" ? Math.max(1, Math.floor(yieldAmt / 2)) : l === "worn" ? Math.max(1, yieldAmt - 1) : yieldAmt;
}

/** Damage share with a worn weapon or bow. */
export const wornDamage = (wear: number): number => ({ fine: 1, worn: 0.85, dull: 0.7 })[wearLevel(wear)];

/** Catch zone a worn rod loses (CATCH_ZONE is 0.11–0.36). */
export const wornRodZone = (wear: number): number => ({ fine: 0, worn: 0.03, dull: 0.06 })[wearLevel(wear)];

/** What Bjorn charges to repair a tool this worn (0 when it isn't). */
export function repairCost(itemKey: string, wear: number): number {
  if (wear <= 0) return 0;
  return Math.max(1, Math.ceil((Math.min(WEAR_MAX, wear) / WEAR_MAX) * REPAIR_K * Math.sqrt(Math.max(1, itemValue(itemKey)))));
}

/** The best axe in the bag (the one chopBonus counts, so the one that wears). */
export function axeKeyOf(bag: readonly string[], plus: Readonly<Record<string, number>> = {}): string | null {
  let best: string | null = null, bonus = -1;
  for (const k of bag) if (AXE_ITEMS.includes(k)) { const b = (WEAPONS[k]?.chopBonus ?? 0) + (plus[k] ?? 0); if (b > bonus) { best = k; bonus = b; } }
  return best;
}

/** The equipped melee weapon that strikes (the one weaponBonus counts). */
export function weaponKeyOf(equipped: readonly string[], plus: Readonly<Record<string, number>> = {}): string | null {
  let best: string | null = null, dmg = 0;
  for (const k of equipped) { const w = WEAPONS[k]; if (w && w.damage > 0 && w.damage + (plus[k] ?? 0) > dmg) { best = k; dmg = w.damage + (plus[k] ?? 0); } }
  return best;
}

/** A heads-up when a tool just got worn or dull. */
export function wearNotice(name: string, before: number, after: number): string | null {
  const a = wearLevel(before), b = wearLevel(after);
  if (a === b) return null;
  return b === "dull"
    ? `🔧 Your ${name} is dull and works badly. Bjorn at the Hollowmere forge can repair it.`
    : `🔧 Your ${name} is getting worn. Bjorn at the Hollowmere forge can sharpen it.`;
}

/**
 * Of the copies of one tool (already narrowed to the equipped ones, if any),
 * the one in use: the most upgraded, then the one already in hand (the most
 * worn that isn't dull), so a spare stays new until the first is dull.
 */
export function usedCopy<T extends { meta: unknown }>(copies: readonly T[]): T {
  const inHand = (m: unknown) => { const w = wearOf(m); return w >= WEAR_MAX ? -1 : w; };
  return [...copies].sort((a, b) => plusOf(b.meta) - plusOf(a.meta) || inHand(b.meta) - inHand(a.meta))[0];
}

/** Of the copies of one tool, the one most in need of a repair. */
export function mostWorn<T extends { meta: unknown }>(copies: readonly T[]): T {
  return [...copies].sort((a, b) => wearOf(b.meta) - wearOf(a.meta) || plusOf(b.meta) - plusOf(a.meta))[0];
}

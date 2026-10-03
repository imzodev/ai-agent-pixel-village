// The Hollowmere forge: Bjorn upgrades swords, axes and the fishing rod
// (+1 … +3) for coin and materials. Each level adds one point of what the
// item is for: sword damage, wood per chop, or a wider fishing catch zone.
// The level lives on the inventory row (`meta.plus`); data + pure rules
// here, the transaction in src/lib/forgeServer.ts.

import type { ForgeCost, ForgeItemDef } from "@/types/forge";

export type { ForgeCost, ForgeFamily, ForgeItemDef, ForgeItemView, ForgeView, Gear } from "@/types/forge";

export const FORGE_KEY = "forge_hollowmere";
export const FORGE_MAX_PLUS = 3;
/** How far from the forge door you can work the anvil (px). */
export const FORGE_REACH_PX = 160;
/** Catch-zone width each rod level adds (CATCH_ZONE is 0.11–0.36). */
export const ROD_ZONE_PER_PLUS = 0.03;

/** Coins and material count for levels +1, +2, +3. */
const LEVELS = [{ coins: 20, qty: 2 }, { coins: 50, qty: 4 }, { coins: 120, qty: 6 }];

/** Upgradable items: their family and the material each level asks for. */
export const FORGE_ITEMS: Record<string, ForgeItemDef> = {
  wooden_sword: { family: "sword", materials: ["thorn", "boar_hide", "wolf_pelt"] },
  stone_sword: { family: "sword", materials: ["thorn", "boar_hide", "wolf_pelt"] },
  thorn_blade: { family: "sword", materials: ["thorn", "boar_hide", "wolf_pelt"] },
  wisp_blade: { family: "sword", materials: ["boar_hide", "wolf_pelt", "wisp_essence"] },
  axe: { family: "axe", materials: ["stone", "wood", "boar_hide"] },
  sharp_axe: { family: "axe", materials: ["stone", "wood", "boar_hide"] },
  fishing_rod: { family: "rod", materials: ["wood", "thorn", "wolf_pelt"] },
};

/** Cost of taking `itemKey` from `plus` to `plus + 1`, or null (not upgradable / capped). */
export function upgradeCost(itemKey: string, plus: number): ForgeCost | null {
  const def = FORGE_ITEMS[itemKey];
  if (!def || plus >= FORGE_MAX_PLUS || plus < 0) return null;
  const lv = LEVELS[plus];
  return { coins: lv.coins, items: [{ itemKey: def.materials[plus], qty: lv.qty }] };
}

/** An inventory row's upgrade level (0 when none or malformed). */
export function plusOf(meta: unknown): number {
  const p = (meta as { plus?: unknown } | null)?.plus;
  return typeof p === "number" && Number.isInteger(p) && p > 0 ? Math.min(p, FORGE_MAX_PLUS) : 0;
}

/** "Thorn Blade +2". */
export function withPlus(name: string, plus: number): string {
  return plus > 0 ? `${name} +${plus}` : name;
}

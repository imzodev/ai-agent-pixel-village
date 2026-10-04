// A shop's real stock, shown out front: Bjorn's rack carries the axes,
// swords and arrow bundles he actually has (src/lib/mind/), so you can see
// him forge and see things sell. The rack itself is in the building art
// (scripts/draw-trade-buildings.mjs forge); the goods are drawn by the game.
// Pure: server (counts) and client (layout) share it.

import type { ShopDisplayDef } from "@/types/shopDisplay";

export type { DisplaySlot, ShopDisplayDef, ShopDisplaySnapshot } from "@/types/shopDisplay";

export const SHOP_DISPLAYS: readonly ShopDisplayDef[] = [
  {
    // Hollowmere Forge (forge_hollowmere at -374,10); rack at template x 52–106.
    key: "forge_hollowmere", npcKey: "hollowmere_bjorn", buildingTx: -374, buildingTy: 10,
    slots: [
      { itemKey: "axe", per: 1, sprite: "rack_axe", at: [[56, 174], [65, 174], [74, 174]] },
      { itemKey: "stone_sword", per: 1, sprite: "rack_sword", at: [[86, 174], [93, 174], [100, 174]] },
      { itemKey: "arrow", per: 10, sprite: "rack_arrows", at: [[57, 189], [70, 189], [83, 189]] },
    ],
  },
];

/** Pieces shown for a stock count (a partial bundle still shows). */
export function piecesFor(slot: { per: number; at: unknown[] }, stock: number): number {
  return Math.max(0, Math.min(slot.at.length, Math.ceil(stock / slot.per)));
}

/** A full display (an NPC without a mind keeps a full rack). */
export function fullCounts(d: ShopDisplayDef): Record<string, number> {
  return Object.fromEntries(d.slots.map((s) => [s.itemKey, s.at.length]));
}

/** World position of a piece. */
export function piecePoint(d: ShopDisplayDef, at: [number, number]): { x: number; y: number } {
  return { x: d.buildingTx * 16 + at[0], y: d.buildingTy * 16 + at[1] };
}

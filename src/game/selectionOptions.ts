// What pressing E does with what's selected. Chopping a tree acts at once;
// everything else (a plant, an item, a townsperson, a home, a lot to cheer…)
// first opens its action card, so you can pick any button, and a second E on
// the open card takes the main action. Pure; the HUD wires it.

import { CROP_KINDS } from "@/lib/crops";
import { recipesForNpc } from "@/lib/recipes";
import { TRADES, stockForNpc } from "@/lib/trade";
import type { Selection } from "@/types/world";
import type { BagLine, EDecision, NpcOptions } from "@/types/selection";

/** An NPC's crafting, buying and selling options for a player with this bag. */
export function npcOptions(npcKey: string, bag: readonly BagLine[]): NpcOptions {
  const trades = TRADES[npcKey] ?? [];
  return {
    recipes: recipesForNpc(npcKey) ?? [],
    sellable: trades.some((t) => bag.some((i) => i.itemKey === t.itemKey && i.qty > 0)),
    stock: stockForNpc(npcKey),
  };
}

/** Chopping a tree (terrain trees and wild axe-nodes): the one action that happens on the first E. */
export function isChopTarget(sel: Selection): boolean {
  return sel.type === "tree" || (sel.type === "node" && CROP_KINDS[sel.kind]?.needsAxe === true);
}

/**
 * What an E press does. Out of reach always "act"s (the action walks you
 * over), and so does chopping; anything else opens the menu, unless it's
 * already open for this very target: then the second E takes the main action.
 */
export function eDecision(opts: { inReach: boolean; instant: boolean; menuOpenForIt: boolean }): EDecision {
  if (!opts.inReach || opts.instant || opts.menuOpenForIt) return "act";
  return "menu";
}

/** A stable identity for a selection (to tell "the same target" across renders). */
export function selectionKey(sel: Selection): string {
  switch (sel.type) {
    case "tree": return `tree:${sel.vx},${sel.vy}`;
    case "board": return `board:${sel.town}`;
    case "relic": return `relic:${sel.key}`;
    case "bread": return `bread:${sel.table}`;
    case "plot": return `plot:${sel.lotKey}:${sel.plot}`;
    default: return `${sel.type}:${sel.id}`;
  }
}

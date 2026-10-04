// How many things you can do with what's selected, and so what pressing E
// does: with one option it acts at once (chopping, picking up, talking to a
// townsperson stays one press); with several (a shopkeeper: talk, craft,
// sell, buy…; a home: enter, move in…) the first E opens the action card to choose, and a second E
// on the open card takes the first option (talk). Pure; the HUD wires it.

import { recipesForNpc } from "@/lib/recipes";
import { TRADES, stockForNpc } from "@/lib/trade";
import type { Selection } from "@/types/world";
import type { BagLine, EDecision, NpcOptions, OptionContext } from "@/types/selection";

/** An NPC's crafting, buying and selling options for a player with this bag. */
export function npcOptions(npcKey: string, bag: readonly BagLine[]): NpcOptions {
  const trades = TRADES[npcKey] ?? [];
  return {
    recipes: recipesForNpc(npcKey) ?? [],
    sellable: trades.some((t) => bag.some((i) => i.itemKey === t.itemKey && i.qty > 0)),
    stock: stockForNpc(npcKey),
  };
}

/** How many actions a selection offers: talking counts as one for an NPC,
 *  and a building counts each button the action card draws for it. "About"
 *  is information, not an action, so it never counts. */
export function optionCount(sel: Selection, ctx: OptionContext): number {
  if (sel.type === "building") return buildingOptionCount(sel, ctx);
  if (sel.type !== "npc") return 1;
  const key = ctx.npcs.find((n) => n.id === sel.id)?.key;
  if (!key) return 1;
  const o = npcOptions(key, ctx.bag);
  return 1 + (o.recipes.length > 0 ? 1 : 0) + (o.sellable ? 1 : 0) + o.stock.length;
}

/** A building's actions: enter it (not bare land), its lot's buy / move in /
 *  move out (not when someone else owns it), and reserving it for a business. */
function buildingOptionCount(sel: Extract<Selection, { type: "building" }>, ctx: OptionContext): number {
  const enter = sel.key.startsWith("land_") ? 0 : 1;
  const lot = ctx.lots.find((l) => l.buildingKey === sel.key);
  const lotAction = lot && (!lot.owner || lot.owner.id === ctx.myId) ? 1 : 0;
  const reserve = sel.reservable && !sel.hasSponsor ? 1 : 0;
  return Math.max(1, enter + lotAction + reserve);
}

/**
 * What an E press does. Out of reach always "act"s (the action walks you
 * over); several options open the menu, unless it's already open for this
 * very target — then the second E takes the first option.
 */
export function eDecision(opts: { count: number; inReach: boolean; menuOpenForIt: boolean }): EDecision {
  if (!opts.inReach || opts.count <= 1 || opts.menuOpenForIt) return "act";
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

// What you can do with a selection (src/game/selectionOptions.ts). Types only.

import type { Recipe, TradeItem } from "@/lib/types";
import type { LotSnapshot } from "./garden";

/** An NPC's options besides talking: crafting, selling to them, buying from them. */
export type NpcOptions = { recipes: Recipe[]; sellable: boolean; stock: TradeItem[] };

/** Just what the options need to know about your bag. */
export type BagLine = { itemKey: string; qty: number };

/** What E does: act at once, or open the menu to choose. */
export type EDecision = "act" | "menu";

/** What counting a selection's options needs from the world and the player. */
export type OptionContext = {
  npcs: readonly { id: number; key: string }[];
  bag: readonly BagLine[];
  lots: readonly Pick<LotSnapshot, "buildingKey" | "owner">[];
  myId: number | null;
};

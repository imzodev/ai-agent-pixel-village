// The controls players are told about, in order: the in-game help
// (src/components/HelpModal.tsx) and the player's guide (/guide) both show
// them, with each command's real key from src/game/input/bindings.ts.

import type { CommandId } from "@/types/input";

export const CONTROLS: readonly [CommandId | "move", string][] = [
  ["move", "Walk (hold Shift to run)"],
  ["player.interact", "Talk, pick up, use, enter"],
  ["player.attack", "Attack or chop (hold to keep going)"],
  ["player.dodge", "Dodge roll: a quick dash that avoids hits"],
  ["player.fish", "Cast and strike, facing deep water with a rod"],
  ["player.bike", "Get on or off your bike"],
  ["player.sell", "Sell to the villager you've selected"],
  ["player.buy", "Buy from them"],
  ["player.craft", "Craft with them"],
  ["player.orders", "Their weekly orders"],
  ["ui.bag", "Your bag"],
  ["ui.map", "The map"],
  ["ui.close", "Close a window"],
];

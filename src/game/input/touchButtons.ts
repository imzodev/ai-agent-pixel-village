// Presentation data for the on-screen touch buttons. These are visual
// labels and positions, not keyboard characters — changing a keyboard
// binding does NOT require editing this file. Only changing the set of
// touch buttons does.

import type { CommandId } from "@/types/input";

export type TouchButton = {
  readonly id: CommandId;
  readonly label: string;
  readonly ariaLabel: string;
  /** Right column offset (% from right edge). */
  readonly right: string;
  /** Bottom offset (% from bottom edge). */
  readonly bottom: string;
};

export const TOUCH_BUTTONS: readonly TouchButton[] = [
  { id: "player.interact", label: "A", ariaLabel: "Interact", right: "8%", bottom: "20%" },
  { id: "ui.bag", label: "B", ariaLabel: "Bag", right: "20%", bottom: "12%" },
  { id: "ui.shop", label: "Y", ariaLabel: "Shop", right: "8%", bottom: "12%" },
  { id: "ui.map", label: "M", ariaLabel: "Map", right: "20%", bottom: "20%" },
];

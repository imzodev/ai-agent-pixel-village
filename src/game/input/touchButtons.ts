// Presentation data for the on-screen touch buttons. These are visual
// labels and positions, not keyboard characters — changing a keyboard
// binding does NOT require editing this file. Only changing the set of
// touch buttons does.

import type { CommandId } from "@/types/input";

export type TouchButton = {
  readonly id: CommandId;
  readonly label: string;
  readonly ariaLabel: string;
  /** Offset from the right edge (CSS length). */
  readonly right: string;
  /** Offset from the bottom edge (CSS length). */
  readonly bottom: string;
};

// A fixed grid in px (52px buttons, 60px pitch), so they never overlap on a
// narrow phone the way percent offsets did. The bottom row sits above the
// chat bar; A, the most used, is nearest the right thumb. Bag, map and shop
// have no button here: they're in the ☰ menu (and on B / M / Y).
/** The run toggle (src/game/InputSource.ts): above the attack button, still in the right thumb's reach. */
export const RUN_BUTTON: Pick<TouchButton, "right" | "bottom"> = { right: "16px", bottom: "184px" };

export const TOUCH_BUTTONS: readonly TouchButton[] = [
  { id: "player.interact", label: "A", ariaLabel: "Interact", right: "16px", bottom: "64px" },
  { id: "player.bike", label: "🚲", ariaLabel: "Get on or off your bike", right: "76px", bottom: "64px" },
  { id: "player.attack", label: "⚔", ariaLabel: "Attack", right: "16px", bottom: "124px" },
  { id: "player.dodge", label: "💨", ariaLabel: "Dodge roll", right: "76px", bottom: "124px" },
];

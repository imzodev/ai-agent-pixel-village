// Presentation data for the on-screen touch buttons. These are visual
// labels and positions, not keyboard characters — changing a keyboard
// binding does NOT require editing this file. Only changing the set of
// touch buttons does.
//
// The handheld layout: A (big, nearest the right thumb) does whatever is
// in front of you, ⚔ attacks, B goes back (or rolls, with nothing open)
// and, held, gets you on or off the bike. Running is pushing the stick all
// the way (src/game/input/dpad.ts). Bag, map and shop are in the ☰ menu.

import type { CommandId, TouchButton } from "@/types/input";

/** How long B must be held to get on or off the bike. */
export const BIKE_HOLD_MS = 450;

export const TOUCH_BUTTONS: readonly TouchButton[] = [
  // Near the bottom edge (on touch the chat is a 💬 button, not a bar), and
  // B's top level with the arrow pad's (src/components/GameCanvas.tsx).
  { id: "player.interact", label: "A", ariaLabel: "Interact: talk, pick up, open, fish", right: "16px", bottom: "22px", size: "big" },
  { id: "player.attack", label: "⚔", ariaLabel: "Attack or chop (hold to keep going)", right: "92px", bottom: "18px", hold: true },
  { id: "ui.back", label: "B", ariaLabel: "Back (or dodge); hold to get on or off your bike", right: "24px", bottom: "100px", longPress: "player.bike" },
];

/** What each button stands for in hints (B also means the bike, when held). */
export const TOUCH_LABEL: Readonly<Partial<Record<CommandId, string>>> = {
  "player.dodge": "B",
  "ui.close": "B",
  "player.bike": "hold B",
  "player.fish": "A",
  "move.run": "push the stick",
};

// Key names in hints, for the device in hand: "(E)" on a keyboard is the "A"
// button on a phone, "(J)" is ⚔, "(K)" (dodge) is B, and so on. Built from the real bindings
// (src/game/input/bindings.ts) and touch buttons (touchButtons.ts), so it
// can't drift from the controls. Used by the tutorial, the journey and help.

import { DEFAULT_KEY_BINDINGS } from "@/game/input/bindings";
import { TOUCH_BUTTONS, TOUCH_LABEL } from "@/game/input/touchButtons";

/** What a touch player presses for things that share a button (dodge, the
 *  bike and Esc are B; fishing is A) or live in the ☰ menu. */
const TOUCH_ELSEWHERE: Readonly<Record<string, string>> = { ...TOUCH_LABEL, "ui.map": "☰ → Map", "ui.bag": "☰ → Bag", "ui.shop": "☰ → Shop" };

/** Keyboard key (as shown, "E") → what a touch player presses instead. */
export const TOUCH_KEYS: Readonly<Record<string, string>> = Object.fromEntries(
  DEFAULT_KEY_BINDINGS.flatMap((b) => {
    const touch = TOUCH_BUTTONS.find((t) => t.id === b.command)?.label ?? TOUCH_ELSEWHERE[b.command];
    return touch && b.keys[0]?.length === 1 ? [[b.keys[0].toUpperCase(), touch]] : [];
  }),
);

/** Rewrite "(E)"-style key hints for touch devices; unchanged on a keyboard. */
export function deviceKeys(text: string, touch: boolean): string {
  if (!touch) return text;
  return text.replace(/\(([A-Z])\)/g, (m, k: string) => (TOUCH_KEYS[k] ? `(${TOUCH_KEYS[k]})` : m));
}

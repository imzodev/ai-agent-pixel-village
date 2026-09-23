// Single source of truth for keyboard bindings + key normalisation.
// Edit DEFAULT_KEY_BINDINGS to change or add shortcuts. Nothing else in
// the codebase should compare a raw key character to a literal.

import type { BindingMode, CommandId, KeyBinding } from "@/types/input";
import { inputRouter } from "./router";

// Order matters for formatBinding(): the first key listed is the
// "primary" key shown to the player in hints like "Pick up (E)".
export const DEFAULT_KEY_BINDINGS: readonly KeyBinding[] = [
  { keys: ["w", "arrowup"], command: "move.up", mode: "hold" },
  { keys: ["s", "arrowdown"], command: "move.down", mode: "hold" },
  { keys: ["a", "arrowleft"], command: "move.left", mode: "hold" },
  { keys: ["d", "arrowright"], command: "move.right", mode: "hold" },
  { keys: ["e", "space"], command: "player.interact", mode: "press" },
  // Craft/Sell are NPC-contextual: the handler no-ops when the current
  // selection isn't an NPC with recipes / sellable inventory. The binding
  // still fires — the handler decides.
  { keys: ["c"], command: "player.craft", mode: "press" },
  { keys: ["f"], command: "player.sell", mode: "press" },
  { keys: ["b"], command: "ui.bag", mode: "press" },
  { keys: ["y"], command: "ui.shop", mode: "press" },
  { keys: ["m"], command: "ui.map", mode: "press" },
  { keys: ["escape"], command: "ui.close", mode: "press" },
];

// Install the global key bindings on the router so its `lookup()` can
// resolve them. Done once at module load.
inputRouter.setGlobalBindings(DEFAULT_KEY_BINDINGS);

/**
 * Normalise a KeyboardEvent.key string into the canonical lowercase token
 * used by DEFAULT_KEY_BINDINGS (e.g. " " → "space", "Escape" → "escape",
 * "ArrowUp" → "arrowup"). Returns null if the key isn't tracked.
 */
export function normalizeKey(key: string): string | null {
  if (key === " ") return "space";
  if (key === "Enter") return "enter";
  if (key === "Tab") return "tab";
  const lower = key.toLowerCase();
  if (lower === "escape" || lower.startsWith("arrow")) return lower;
  if (/^[a-z0-9]$/.test(lower)) return lower;
  return null;
}

export type BindingLookup = { command: CommandId; mode: BindingMode };

/** The primary (first-listed) key for a command — used by UI hints. */
export function formatBinding(command: CommandId): string | null {
  for (const b of DEFAULT_KEY_BINDINGS) {
    if (b.command === command) return b.keys[0] ?? null;
  }
  return null;
}

/** Pretty-print a key token for display ("space" → "Space", "escape" → "Esc"). */
export function prettyKey(token: string): string {
  if (token === "space") return "Space";
  if (token === "escape") return "Esc";
  if (token.startsWith("arrow")) return "Arrow" + token.charAt(5).toUpperCase() + token.slice(6);
  return token.toUpperCase();
}

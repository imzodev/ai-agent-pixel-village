// Single source of truth for keyboard bindings + key normalisation.
// Edit DEFAULT_KEY_BINDINGS to change or add shortcuts. Nothing else in
// the codebase should compare a raw key character to a literal.

import type { BindingMode, CommandId, KeyBinding } from "@/types/input";

// Order matters for formatBinding(): the first key listed is the
// "primary" key shown to the player in hints like "Pick up (E)".
export const DEFAULT_KEY_BINDINGS: readonly KeyBinding[] = [
  { keys: ["w", "arrowup"], command: "move.up", mode: "hold" },
  { keys: ["s", "arrowdown"], command: "move.down", mode: "hold" },
  { keys: ["a", "arrowleft"], command: "move.left", mode: "hold" },
  { keys: ["d", "arrowright"], command: "move.right", mode: "hold" },
  { keys: ["e", "space"], command: "player.interact", mode: "press" },
  { keys: ["b"], command: "ui.bag", mode: "press" },
  { keys: ["y"], command: "ui.shop", mode: "press" },
  { keys: ["m"], command: "ui.map", mode: "press" },
  { keys: ["escape"], command: "ui.close", mode: "press" },
];

/** Map from normalised key → { command, mode }. Built once at module load. */
const KEY_LOOKUP: ReadonlyMap<string, { command: CommandId; mode: BindingMode }> = (() => {
  const m = new Map<string, { command: CommandId; mode: BindingMode }>();
  for (const b of DEFAULT_KEY_BINDINGS) {
    for (const k of b.keys) {
      m.set(k, { command: b.command, mode: b.mode });
    }
  }
  return m;
})();

/**
 * Normalise a KeyboardEvent.key string into the canonical lowercase token
 * used by DEFAULT_KEY_BINDINGS (e.g. " " → "space", "Escape" → "escape",
 * "ArrowUp" → "arrowup"). Returns null if the key isn't tracked.
 */
export function normalizeKey(key: string): string | null {
  if (key === " ") return "space";
  const lower = key.toLowerCase();
  if (lower === "escape" || lower.startsWith("arrow")) return lower;
  if (/^[a-z0-9]$/.test(lower)) return lower;
  return null;
}

export type BindingLookup = { command: CommandId; mode: BindingMode };

/** Look up the command and mode for a normalised key, or null. */
export function commandFor(key: string): BindingLookup | null {
  return KEY_LOOKUP.get(key) ?? null;
}

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

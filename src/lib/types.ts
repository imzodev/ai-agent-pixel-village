// Shared app-level types. Domain-neutral (no DB, no Phaser). Imported by
// server routes, the HUD, the rate limiter, and agent.ts when needed.

export type ConversationSource = "llm" | "scripted" | "remote";

/** One line in the NPC conversation panel. `source` is set only for lines
 *  produced in the current session (historical rows don't carry it). */
export type TalkLine = {
  role: "npc" | "player";
  text: string;
  source?: ConversationSource;
};

/** Sliding-window rate limit config. */
export type RateLimitConfig = {
  /** Maximum allowed actions per window. */
  max: number;
  /** Window size in milliseconds. */
  windowMs: number;
};

/** An action an NPC can offer right now. Each kind carries the data its
 *  accept handler needs; the `id` is opaque to clients. */
export type Offer =
  | { id: string; type: "mission"; missionId: number; label: string; line: string }
  | { id: string; type: "turnin"; missionId: number; label: string; line: string }
  | { id: string; type: "discount"; label: string; line: string }
  | { id: string; type: "gift"; itemKey: string; label: string; line: string }
  /** The NPC buys `qty` of `itemKey` from the player for `price` coins. */
  | { id: string; type: "sell"; itemKey: string; qty: number; price: number; label: string; line: string };

/** A single buyable item a trader NPC will pay for. */
export type TradeItem = { itemKey: string; qty: number; price: number; line: string };

/** Per-NPC buy lists, keyed by `npc.key`. Open for extension: add a new
 *  trader = add an entry; add new items via the items seed + a TRADES row. */
export type TradeConfig = Record<string, TradeItem[]>;


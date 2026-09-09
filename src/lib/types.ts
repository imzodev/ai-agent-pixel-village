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
/** One input slot for a crafting recipe. */
export type RecipeInput = { itemKey: string; qty: number };

/** A crafting recipe: each recipe belongs to ONE NPC (the crafter). The
 *  player must stand near that NPC to use it — that's the discovery game. */
export type Recipe = {
  /** Stable id used by the API and persisted in client state. */
  key: string;
  /** Display name in the modal. */
  name: string;
  /** Emoji or short string shown in the row. */
  icon: string;
  /** The NPC.key that crafts this recipe. */
  crafterKey: string;
  inputs: RecipeInput[];
  output: { itemKey: string; qty: number };
  /** Optional flavor line shown in the modal header. */
  line?: string;
  /** Future gating hooks — the route checks these against the character. */
  requires?: { level?: number; itemKey?: string; qty?: number };
};

/** One world-driven random event. Adding a new event = pushing one entry
 *  into the `simEvents` registry in src/lib/events.ts — no other edits. */
export type RandomEvent = {
  /** Unique id, used for cooldowns and logs. */
  key: string;
  /** Higher = more likely to fire per eligible tick. */
  weight: number;
  /** Minimum ms between two fires of THIS event (global per-key). */
  cooldownMs: number;
  /** Optional gate against world state (hour, weather, player count, etc.). */
  when?: (ctx: SimCtx) => boolean | Promise<boolean>;
  /** The effect — mutates world state, emits world events. */
  fire: (ctx: SimCtx) => void | Promise<void>;
};

/** World context passed to every random event — read-only view of the sim. */
export type SimCtx = {
  db: typeof import("@/db/index").db;
  hour: number;
  weather: string;
  now: Date;
};



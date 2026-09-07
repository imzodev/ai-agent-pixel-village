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

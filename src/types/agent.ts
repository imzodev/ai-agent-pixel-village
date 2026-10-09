// Agents (NPC dialogue brain + external HTTP agents). Types only.
import type { characters, npcs, sponsors } from "@/db/schema";
import type { Offer } from "@/lib/types";

/** Input to the reply brain (remote webhook, LLM or scripted). */
export type BrainInput = {
  npc: typeof npcs.$inferSelect;
  sponsor: typeof sponsors.$inferSelect | null;
  character: typeof characters.$inferSelect;
  message: string;
  history: { role: string; text: string }[];
  offers: Offer[];
  hour: number;
  weather: string;
  /** Skip the LLM and scripted brain entirely (e.g. remote agent). */
  skipLocalBrain?: boolean;
  /** Force the scripted path (e.g. rate-limited). */
  forceScripted?: boolean;
  /** An NPC with a mind: how it feels about this player and what it's up to. */
  mindNote?: string | null;
};

export type BrainSource = "scripted" | "llm" | "remote";

export type BrainOutput = { text: string; offerIds: string[]; source: BrainSource };

/** Body the server POSTs to an external agent's webhook for a conversation. */
export type AgentWebhookConversation = {
  type: "conversation";
  npc: { id: number; key: string; name: string; role: string; persona: string };
  sponsor: { businessName: string; pitch: string; discountCode: string } | null;
  player: { id: number; name: string; level: number };
  message: string;
  history: { role: string; text: string }[];
  offers: { id: string; type: string; label: string; line: string }[];
  world: { hour: number; weather: string };
};

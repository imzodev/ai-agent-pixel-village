// NPC conversation replies (POST /api/npc/[id]/talk). Types only — no logic.
//
// Asked with `accept: text/event-stream`, the route streams the reply as
// server-sent events: `text` (the reply so far, sent as it grows), then one
// `done` (the same body the plain JSON answer has) or one `error`.
import type { ConversationSource, Offer } from "@/lib/types";

/** The NPC in a talk reply (for the panel's header). */
export type TalkNpc = {
  id: number;
  name: string;
  role: string;
  sponsored: boolean;
  sponsor: { businessName: string; brandColor: string } | null;
};

/** The finished reply: the JSON answer, or the stream's `done` event. */
export type TalkReply = {
  text: string;
  offers: Offer[];
  source: ConversationSource;
  notices: string[];
  npc: TalkNpc;
};

/** A stream's `text` event: the reply text written so far. */
export type TalkTextEvent = { text: string };

/** A stream's `error` event. */
export type TalkErrorEvent = { error: string };

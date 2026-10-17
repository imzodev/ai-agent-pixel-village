// NPCs talking to each other (src/lib/npcTalk.ts, src/lib/npcTalkServer.ts):
// meetings, conversations, gossip and relationships. Types only.

/** An NPC where it stands now, as the meeting finder sees it. */
export type TalkNpc = { id: number; key: string; name: string; x: number; y: number; busy: boolean };

/** Two NPCs close enough to talk (a < b by id). */
export type TalkPair = { a: TalkNpc; b: TalkNpc; dist: number };

/** When each NPC and each pair last talked (ms), for the cooldowns. */
export type TalkCooldowns = { npc: ReadonlyMap<number, number>; pair: ReadonlyMap<string, number> };

/** One spoken line: who says it (A = the first NPC of the pair, B = the second). */
export type TalkLine = { who: "A" | "B"; text: string };

/** What the LLM gave back for one conversation, once checked. */
export type TalkResult = {
  lines: TalkLine[];
  /** Rumours passed on in it (ids from the prompt). */
  told: number[];
  relation: { delta: -1 | 0 | 1; note: string };
};

/** A rumour as the talk prompt and the player prompt see it. */
export type Rumour = { id: number; text: string; aboutCharacterId: number | null; at: number };

/** What one side of a conversation brings: who they are, what they're doing, what they've heard. */
export type TalkSide = {
  key: string; name: string; role: string; persona: string; mood: string;
  /** What they're up to, in a few words. */
  doing: string;
  /** Rumours they could pass on (the other hasn't heard them). */
  rumours: Rumour[];
};

/** How two NPCs get on (npc_relations): −10 (can't stand each other) … 10 (best friends). */
export type TalkRelation = { affinity: number; note: string; talks: number };

/** A world event that may become a rumour. */
export type GossipEvent = { id: number; kind: string; text: string; subjectType: string | null; subjectId: number | null; x: number | null; y: number | null };

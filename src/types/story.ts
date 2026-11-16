// Storylines: a personal quest chain each player follows, picked from the
// hand-written tales or written by the AI from one line about their hero
// (src/lib/story/). Types only.

/** What a chapter asks for. `deliver` = talk to `match.npcKey` with `qty` of `match.itemKey` in your bag. */
export type StoryEventKind = "talk" | "deliver" | "collect" | "defeat" | "visit" | "fish" | "plant" | "sell";

/** Narrows a chapter's event: talk to this NPC, collect this item, beat this foe, reach this region. */
export type StoryMatch = { npcKey?: string; itemKey?: string; enemyKind?: string; region?: string };

export type StoryReward = { coins: number; xp: number };

/** What a player just did, as the routes report it (a delivery is a talk; the server checks the bag). */
export type StoryDid = { kind: Exclude<StoryEventKind, "deliver">; npcKey?: string; itemKey?: string; enemyKind?: string; region?: string };

/** A chapter as written (by hand or by the AI), before rewards. */
export type StoryChapterDraft = {
  title: string;
  /** What happens, in a sentence or two (shown in the tracker). */
  text: string;
  event: StoryEventKind;
  match: StoryMatch;
  qty: number;
  /** What the chapter's NPC knows or wants (fed to their talk prompt while it's the current chapter). */
  npcNote?: string;
};

export type StoryChapter = StoryChapterDraft & { reward: StoryReward };

/** A whole story before it's handed to a player. */
export type StoryDraft = {
  title: string;
  /** The setup, a sentence or two. */
  premise: string;
  /** How it ends (shown when the last chapter is done). */
  ending: string;
  /** The title the hero earns at the end ("Heir of the Watch"). */
  heroTitle: string;
  chapters: StoryChapterDraft[];
};

/** A hand-written story (src/lib/story/templates.ts). */
export type StoryTemplate = StoryDraft & {
  key: string;
  icon: string;
  /** One line for the picker. */
  blurb: string;
  /** Words that match a player's description, for the fallback when the AI can't write one. */
  tags: string[];
};

export type StorySource = "template" | "ai";
export type StoryStatus = "active" | "done" | "abandoned";

/** What the AI may name, by band of the player's level (src/lib/story/catalog.ts). */
export type StoryCatalog = {
  npcs: { key: string; name: string; role: string; place: string | null }[];
  regions: { key: string; name: string }[];
  foes: { key: string; name: string }[];
  /** Things players gather, fish, farm or loot. */
  collect: { key: string; name: string }[];
  /** Things worth handing to someone: `collect` plus a few made goods. */
  deliver: { key: string; name: string }[];
};

/** The current story as the client sees it (in /api/me). */
export type StoryView = {
  id: number;
  title: string;
  premise: string;
  source: StorySource;
  step: number;
  total: number;
  progress: number;
  chapter: StoryChapter;
  /** Display names for the chapter's NPC, item, foe or region. */
  names: { npc?: string; item?: string; foe?: string; region?: string };
  /** Where to head when the target isn't on screen (the NPC's home, the region's middle). */
  where: { x: number; y: number } | null;
};

/** What starting, writing or setting aside a story says back. */
export type StoryResult = { ok: true; message: string; view: StoryView | null } | { ok: false; error: string };

/** A finished story, for the profile. */
export type StoryRecord = { id: number; title: string; premise: string; heroTitle: string; source: StorySource; finishedAt: string };

/** A hand-written story in the picker. */
export type StoryPick = { key: string; title: string; icon: string; blurb: string; chapters: number };

/** GET /api/story. */
export type StoryState = {
  view: StoryView | null;
  picks: StoryPick[];
  /** Stories still allowed today (started by hand or written). */
  startsLeft: number;
  /** The last story finished, for "continue" (a sequel). */
  lastDone: { id: number; title: string } | null;
  /** A story still being written (Play now's hero line, in the background). */
  writing: boolean;
};

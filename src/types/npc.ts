// Seeded NPCs (src/lib/npcDefs.ts). Types only.

import type { Appearance } from "./domain";

/** A job an NPC does. Recipes and shop rules key off trades, never off an
 *  NPC's key, so any number of NPCs can share one (two bakers, …). */
export type NpcTrade =
  | "baker"
  | "innkeeper"
  | "shopkeeper"
  | "herbalist"
  | "tinker"
  | "smith"
  | "miller"
  | "woodcutter"
  | "farmhand"
  | "elder"
  | "fishmonger"
  | "boatwright"
  | "mayor"
  | "bounty"
  | "trader"
  | "curio";

/** One seeded NPC. `key` is `<place>_<name>` (e.g. `village_marigold`). */
export type NpcDef = {
  key: string;
  name: string;
  role: string;
  persona: string;
  greeting: string;
  /** Chunk-world tile units (ty grows down). Converted to pixels via tilePoint. */
  tilePos: [number, number];
  wanderRadius: number;
  appearance: Appearance;
  mood: string;
  trades: NpcTrade[];
};

/** How an NPC talks and what they care about (src/lib/npcPersonalities.ts). */
export type NpcPersonality = {
  /** How they speak: rhythm, habits, words they like. */
  voice: string;
  /** What they care about, enjoy or worry over. */
  likes: string;
  /** A habit or oddity that makes them recognisable. */
  quirk: string;
  /** What they think of their neighbours (true to who those neighbours are). */
  opinions?: string;
};

/** An item's display name by key (the caller supplies the catalogue, e.g. the items table). */
export type ItemNameOf = (itemKey: string) => string;

/** Old NPC key → its `<place>_<name>` key (renamed once at boot). */
export type LegacyKeyMap = Readonly<Record<string, string>>;

/** What an NPC may know beyond their own town (src/lib/npcKnowledge.ts):
 *  where things are sold across the world, who makes what, and the roads. */
export type KnowledgeTopic = "trade" | "craft" | "roads";

/** A place an NPC can live in or know of: a continent town or one of the
 *  hand-made places (the grove, Hollowmere, Brightwater), with its centre tile. */
export type KnowledgePlace = { key: string; name: string; tx: number; ty: number };

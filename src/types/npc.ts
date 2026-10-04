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
  | "elder"
  | "fishmonger"
  | "boatwright"
  | "mayor"
  | "bounty";

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

/** Old NPC key → its `<place>_<name>` key (renamed once at boot). */
export type LegacyKeyMap = Readonly<Record<string, string>>;

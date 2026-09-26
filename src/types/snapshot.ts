// Snapshot assembly + cache types. Types only — no logic.
//
// `Snapshot` is the aliased `WorldSnapshot` wire shape (defined in
// lib/protocol.ts) that the client and DB assembler both speak.

import type {
  animals,
  buildings,
  enemies,
  groundItems,
  npcs,
  resourceNodes,
  worldChat,
  worldEvents,
  worldState,
} from "@/db/schema";
import type { WorldSnapshot } from "@/lib/protocol";
import type { Appearance } from "@/types/domain";

export type Snapshot = WorldSnapshot;

export type SponsorLite = {
  id: number;
  businessName: string;
  brandColor: string;
  tagline: string;
};

export type PlayerRow = {
  id: number;
  name: string;
  x: number;
  y: number;
  facing: string;
  appearance: Appearance;
  level: number;
  hp: number;
  maxHp: number;
  coins: number;
  gems: number;
  xp: number;
};

/**
 * Intermediate shape produced by the DB assembler, before formatting.
 *
 * Note there is no `meId`/`meEquipped` here: the shared snapshot is cached
 * per chunk (not per player), and the local player's own row is injected
 * from `players` at send time. That keeps one rebuild shared across every
 * player in a chunk.
 */
export type RawSnapshot = {
  world: typeof worldState.$inferSelect;
  players: PlayerRow[];
  npcs: Array<typeof npcs.$inferSelect>;
  animals: Array<typeof animals.$inferSelect>;
  buildings: Array<typeof buildings.$inferSelect>;
  sponsors: SponsorLite[];
  groundItems: Array<typeof groundItems.$inferSelect>;
  resourceNodes: Array<typeof resourceNodes.$inferSelect>;
  enemies: Array<typeof enemies.$inferSelect>;
  chat: Array<typeof worldChat.$inferSelect>;
  events: Array<typeof worldEvents.$inferSelect>;
  onlineCount: number;
  doors: Map<string, { x: number; y: number }>;
  equippedByChar: Map<number, string[]>;
  /** Per-character equipped cosmetics (slot → itemKey). Populated from `character_equipped`. */
  cosmeticsByChar: Map<number, { slot: string; itemKey: string }[]>;
  spById: Record<string, SponsorLite>;
};

/** Availability of the online_players materialized view, cached. */
export type ViewState = { available: boolean; checkedAt: number };

/** One entry in the in-process snapshot cache. */
export type ProcCacheEntry = { snap: Snapshot; expiresAt: number };

/**
 * Process-wide snapshot cache state. Shared on globalThis because the
 * snapshot module is loaded both by src/server.ts and inside Next's
 * bundled API routes; separate copies would diverge and a mutation that
 * invalidated one would leave the other serving the pre-mutation
 * snapshot (e.g. a picked-up egg reappearing on the next refresh).
 */
export type SnapshotCacheState = {
  procCache: Map<string, ProcCacheEntry>;
  version: number;
};

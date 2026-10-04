// Event-bus types. Types only — no logic. Imported by lib/bus.ts (the
// emitter) and its subscribers (the scene, the HUD).

import type { Snapshot } from "@/types/snapshot";
import type { Selection } from "@/types/world";

export type Events = {
  snapshot: Snapshot;
  /** The local player's live sprite position, emitted as they walk. */
  playerMoved: { x: number; y: number };
  select: Selection | null;
  toast: { text: string; kind?: "info" | "good" | "bad" };
  enterBuilding: { key: string; name: string };
  focus: { x: number; y: number };
  refreshMe: undefined;
  moveTo: { x: number; y: number };
  poke: undefined;
  /** Emitted by WorldScene when E/Space is pressed on an actionable selection. */
  primaryAction: Selection;
  /** Toggle one of the UI panels / routes. */
  toggle: "bag" | "shop" | "map" | "quests" | "friends";
  /** True while any modal is open that should block canvas interaction. */
  modalOpen: boolean;
  /** The local player attacks: swing toward (x, y); `tool` swaps the held
   *  item for the swing (e.g. "axe"). */
  attack: { x: number; y: number; tool?: string };
  /** The local player took damage (flash + floating number). */
  hurt: { amount: number; hp?: number; maxHp?: number };
  /** The player walked into a named region (location banner, book). */
  region: { name: string; key: string; /** First sight on spawn: record it, no banner. */ quiet?: boolean };
  /** Whether there's fishable water in front of the player. */
  canFish: boolean;
  /** Tutorial guide target (arrow), or null to hide it. */
  guide: { x: number; y: number; npcId?: number } | null;
  /** The local player goes through a portal and arrives at (x, y). */
  teleport: { x: number; y: number };
  /** Hidden relics the local player has already found (they stop glinting). */
  relicsFound: string[];
  /** Whether the local player owns a bicycle (the HUD watches the bag). */
  hasBike: boolean;
  /** Get the local player off their bike (going indoors, …). */
  dismount: undefined;
  /** A saloon game you're in changed: re-read it. */
  saloon: { inn: string };
  /** The scene is up and listening: the HUD resends what it already knows
   *  (found relics, whether you own a bike). */
  sceneReady: undefined;
  /** The local player just picked up a relic: show it off over their head. */
  relicPicked: { key: string; have: number; total: number };
  /** The local player was knocked out and wakes at (x, y). */
  knockout: { x: number; y: number; coinsLost: number };
};

export type Handler<T> = (payload: T) => void;

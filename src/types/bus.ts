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
};

export type Handler<T> = (payload: T) => void;

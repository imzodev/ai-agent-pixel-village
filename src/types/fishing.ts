// Fishing (src/lib/fishing.ts). Types only.

export type FishRarity = "common" | "uncommon" | "rare" | "legendary";
export type FishWater = "river" | "pond";
export type FishTime = "any" | "day" | "night" | "dusk";

export type FishDef = {
  key: string;
  name: string;
  icon: string;
  rarity: FishRarity;
  waters: FishWater[];
  time: FishTime;
  /** Only bites in this weather (e.g. "rain"). */
  weather?: string;
  /** Relative chance among the fish that can bite here and now. */
  weight: number;
  price: number;
  xp: number;
  description: string;
};

/** A pending cast (server memory). */
export type FishCast = { id: string; characterId: number; fishKey: string; biteAt: number; createdAt: number };

/** Client minigame state (src/game/fishing.ts). */
export type FishingSession = {
  phase: "casting" | "waiting" | "bite" | "reel" | "landing";
  castId: string;
  /** performance-clock times (scene time, ms). */
  biteAt: number;
  deadline: number;
  /** Catch zone width (share of the bar) and its centre. */
  zone: number;
  zoneAt: number;
  /** Reel marker phase. */
  t: number;
  bobber: { x: number; y: number };
};

/** What the minigame needs from the scene. */
export type FishingHost = {
  player: () => { x: number; y: number; facing: string } | null;
  toast: (text: string, kind?: "info" | "good" | "bad") => void;
  refresh: () => void;
  emote: (text: string) => void;
};

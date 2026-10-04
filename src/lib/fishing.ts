// Fishing: what bites where and when, and the reel rules. Pure; the cast
// store and rewards live in src/app/api/fish/route.ts.

import type { FishDef, FishRarity, FishWater } from "@/types/fishing";
import { terrainAt } from "./regions";
import { riverCenter } from "./continent";

export type { FishCast, FishDef, FishRarity, FishTime, FishWater } from "@/types/fishing";

export const FISHING_ROD = "fishing_rod";

export const FISH_DEFS: FishDef[] = [
  { key: "silver_minnow", name: "Silver Minnow", icon: "🐟", rarity: "common", waters: ["river", "pond"], time: "any", weight: 30, price: 2, xp: 3, description: "Tiny, quick and everywhere." },
  { key: "river_trout", name: "River Trout", icon: "🐟", rarity: "common", waters: ["river"], time: "day", weight: 22, price: 4, xp: 5, description: "Speckled and strong against the current." },
  { key: "pond_perch", name: "Pond Perch", icon: "🐠", rarity: "common", waters: ["pond"], time: "any", weight: 24, price: 3, xp: 4, description: "Striped, curious, always hungry." },
  { key: "mud_carp", name: "Mud Carp", icon: "🐟", rarity: "common", waters: ["pond"], time: "any", weight: 16, price: 4, xp: 5, description: "Lives in the soft mud at the bottom." },
  { key: "bluegill", name: "Bluegill", icon: "🐠", rarity: "uncommon", waters: ["pond", "river"], time: "day", weight: 10, price: 7, xp: 9, description: "A flash of blue under the lily pads." },
  { key: "rainbow_trout", name: "Rainbow Trout", icon: "🐠", rarity: "uncommon", waters: ["river"], time: "day", weight: 9, price: 9, xp: 11, description: "Every colour of the Silverrun at noon." },
  { key: "catfish", name: "Whiskered Catfish", icon: "🐡", rarity: "uncommon", waters: ["river", "pond"], time: "night", weight: 10, price: 10, xp: 12, description: "Comes up from the deep after dark." },
  { key: "golden_carp", name: "Golden Carp", icon: "🐠", rarity: "rare", waters: ["pond"], time: "dusk", weight: 5, price: 22, xp: 25, description: "Said to bring luck to whoever lets it go. Nobody does." },
  { key: "moonfin", name: "Moonfin", icon: "🐟", rarity: "rare", waters: ["river"], time: "night", weight: 5, price: 24, xp: 28, description: "Its fins glow faintly under the moon." },
  { key: "storm_eel", name: "Storm Eel", icon: "🐍", rarity: "rare", waters: ["river", "pond"], time: "any", weather: "rain", weight: 6, price: 26, xp: 30, description: "Only rises when rain churns the water." },
  { key: "ghost_koi", name: "Ghost Koi", icon: "🐠", rarity: "legendary", waters: ["pond"], time: "night", weight: 1.2, price: 80, xp: 80, description: "Pale as mist. Some say it isn't there at all." },
  { key: "silverrun_pike", name: "Silverrun Pike", icon: "🦈", rarity: "legendary", waters: ["river"], time: "any", weight: 1, price: 90, xp: 90, description: "The old king of the river. Fishermen still tell stories." },
];

export const fishDef = (key: string) => FISH_DEFS.find((f) => f.key === key);

/** Size of the reel's catch zone (share of the bar) by rarity. */
export const CATCH_ZONE: Record<FishRarity, number> = { common: 0.36, uncommon: 0.26, rare: 0.18, legendary: 0.11 };
/** The bite comes this long after the cast (ms). */
export const BITE_MIN_MS = 1500;
export const BITE_MAX_MS = 5000;
/** A cast is forgotten after this long (ms). */
export const CAST_TTL_MS = 20_000;

/** The water at world tile (tx, ty): river, pond, or null when it isn't deep water. */
export function waterAt(tx: number, ty: number): FishWater | null {
  const cell = terrainAt(tx, ty);
  if (!cell.ground.startsWith("water_") || !cell.collide) return null;
  // The Silverrun runs from its north lake to the south coast.
  return ty >= -330 && Math.abs(tx - riverCenter(ty)) <= 4 ? "river" : "pond";
}

/** Fishable water within reach in front of a player standing at (x, y). */
export function waterInFront(x: number, y: number, facing: string): { tx: number; ty: number; water: FishWater } | null {
  const [dx, dy] = facing === "left" ? [-1, 0] : facing === "right" ? [1, 0] : facing === "up" ? [0, -1] : [0, 1];
  for (const d of [14, 26, 38]) {
    const tx = Math.floor((x + dx * d) / 16), ty = Math.floor((y - 6 + dy * d) / 16);
    const water = waterAt(tx, ty);
    if (water) return { tx, ty, water };
  }
  return null;
}

function timeOk(t: FishDef["time"], hour: number): boolean {
  if (t === "any") return true;
  if (t === "day") return hour >= 6 && hour < 19;
  if (t === "night") return hour >= 20 || hour < 5;
  return hour >= 17 && hour < 21; // dusk
}

/** Fish that can bite in this water at this hour and weather. */
export function fishFor(water: FishWater, hour: number, weather: string): FishDef[] {
  return FISH_DEFS.filter((f) => f.waters.includes(water) && timeOk(f.time, hour) && (!f.weather || f.weather === weather));
}

/** Roll which fish takes the bait. */
export function rollFish(water: FishWater, hour: number, weather: string, rand = Math.random): FishDef {
  const pool = fishFor(water, hour, weather);
  const total = pool.reduce((s, f) => s + f.weight, 0);
  let r = rand() * total;
  for (const f of pool) { r -= f.weight; if (r < 0) return f; }
  return pool[pool.length - 1];
}

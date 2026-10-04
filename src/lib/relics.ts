// Hidden relics: four sets of ten little treasures tucked away across the
// continent — old coins by the roads, fossils in the dry lands, wayfarer
// cards in the towns, rune carvings in the cold and dark places. Each one
// glints faintly where it lies; anyone may pick it up once, for their own
// collection book. A finished set pays out, gives a title and the first map
// of a treasure trail. Spots come from scripts/gen-relics.ts
// (src/lib/relicsData.json); claims are collection entries ("relic").

import DATA from "./relicsData.json";
import type { RelicDef, RelicSetDef, RelicSetKey, RelicsData } from "@/types/treasure";

export type { RelicDef, RelicSetDef, RelicSetKey } from "@/types/treasure";

/** How close you must stand to pick one up. */
export const RELIC_REACH_PX = 56;

export const RELIC_SETS: readonly RelicSetDef[] = [
  {
    key: "coins", name: "Old Coins", icon: "🪙", blurb: "A gold coin half-sunk in the dirt, a few steps off the roads between towns.",
    names: ["Crown Penny", "Silverrun Shilling", "Old King's Mark", "Ember Ducat", "Frostfang Groat", "Mirewood Bit", "Sailor's Sovereign", "Miner's Token", "Wayfarer's Farthing", "Twin-Moon Crown"],
    reward: { coins: 250, title: "Coin Collector" },
  },
  {
    key: "fossils", name: "Fossils", icon: "🦴", blurb: "A pale bone poking out of the sand, in the deserts, badlands and on beaches.",
    names: ["Fern Fossil", "Ammonite Spiral", "Trilobite", "Raptor Claw", "Sea-Lizard Tooth", "Amber Beetle", "Petrified Egg", "Dragonfly in Stone", "Shell Bed", "Great Wyrm Vertebra"],
    reward: { coins: 300, title: "Fossil Hunter" },
  },
  {
    key: "cards", name: "Wayfarer Cards", icon: "🃏", blurb: "A dropped playing card — one inside every town, and a few far out in the wilds.",
    names: ["The Wanderer", "The Lantern", "The Fox", "The Tower", "The Moon", "The Smith", "The River", "The Crown", "The Hermit", "The Star"],
    reward: { coins: 300, title: "Card Sharp" },
  },
  {
    key: "carvings", name: "Rune Carvings", icon: "🗿", blurb: "A small grey standing stone with a glowing blue rune, in the snows, darkwoods and bogs.",
    names: ["Rune of Frost", "Rune of the Hunt", "Rune of Roots", "Rune of the Tide", "Rune of Ember", "Rune of Silence", "Rune of the Wolf", "Rune of Stars", "Rune of Stone", "The First Rune"],
    reward: { coins: 400, title: "Runekeeper" },
  },
];

/** A relic's key: `<set>_<n>` (n = 0…9). */
export const relicKey = (set: RelicSetKey, n: number): string => `${set}_${n}`;

const SPOTS = new Map((DATA as RelicsData).relics.map((r) => [r.key, r]));

/** Every relic with its spot (only those the generator could place). */
export const RELICS: readonly RelicDef[] = RELIC_SETS.flatMap((s) => s.names.map((name, n) => {
  const at = SPOTS.get(relicKey(s.key, n));
  return at ? { key: at.key, set: s.key, name, tx: at.tx, ty: at.ty } : null;
})).filter((r): r is RelicDef => r !== null);

export const relicByKey = (key: string): RelicDef | undefined => RELICS.find((r) => r.key === key);
export const relicSet = (key: RelicSetKey): RelicSetDef => RELIC_SETS.find((s) => s.key === key)!;
/** Where a relic glints (world px): its tile's centre. */
export const relicPoint = (r: RelicDef): { x: number; y: number } => ({ x: r.tx * 16 + 8, y: r.ty * 16 + 8 });

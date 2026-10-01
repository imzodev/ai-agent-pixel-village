// Per-kind crop configuration shared between the server (sim worker,
// action route, seed) and the client (texture frame registration).
// Types-only live in src/types/*; this file holds runtime data for crop
// kinds so both processes agree on regrowth timing and yield.
//
// Adding a new crop = append one entry here. The renderer auto-registers
// one named frame per stage on the `lpc_crops` texture at scene-create
// time; the action route and sim worker pull timing + yield from the
// same record.

import type { CropKindConfig, CropRect } from "@/types/crops";
import type { GardenCropDef } from "@/types/garden";

export type { CropKindConfig, CropRect } from "@/types/crops";

/** Extra node spritesheets (texture key → URL), besides lpc_crops. */
export const NODE_SHEETS: Readonly<Record<string, string>> = {
  tree_oak: "/assets/trees/oak.png",
};

// 5-stage wheat progression harvested from public/assets/food/crops.png
// (LPC crops by bluecarrot16 / Eddeland / Taylor / Kettering). The
// wheat column at x=992 spans rows 1..11. To get a smooth visual growth
// with consistent image dimensions, all 5 stages are 32x64 crops that
// share the same soil line at the bottom — only the y offset changes:
//
// Stage 0  (picked / just regrowing) : tuft on soil                (y=16,  32x64)
// Stage 1  (sprout)                  : small sprout + soil         (y=48,  32x64)
// Stage 2  (small wheat)             : wheat with first head        (y=80,  32x64)
// Stage 3  (medium wheat)            : wheat with more leaves      (y=96,  32x64)
// Stage 4  (mature wheat)            : full plant, multiple heads  (y=128, 32x64)
//
// Tweak the y values here to dial in the visual growth. With
// setOrigin(0.5, 1) every frame's bottom anchors at the node's world
// position so the soil line stays on the ground.
const WHEAT_FRAMES: CropRect[] = [
  { x: 992, y: 32,  w: 32, h: 32 }, // stage 0 — tuft on soil
  { x: 992, y: 64,  w: 32, h: 64 }, // stage 1 — small sprout
  { x: 992, y: 128,  w: 32, h: 64 }, // stage 2 — wheat with first head
  { x: 960, y: 192,  w: 32, h: 64 }, // stage 3 — more leaves, fuller
  { x: 992, y: 192, w: 32, h: 64 }, // stage 4 — mature wheat
];

// Garden crops (planted by players in their home garden plots). Frames are
// 32×64 cells of food/crops.png on a 64 px row pitch: rows y = 0, 64, 128,
// 192 are the growth stages (sprout → mature) and y = 256 is dug soil.
// A planted crop starts at stage 1 and grows to stage 4; `regrowthMs` is
// the time per stage (tickResources advances it). Stage 0 is never shown
// for a planted crop (harvesting removes the node).
function gardenFrames(x: number): CropRect[] {
  return [
    { x: 0, y: 256, w: 32, h: 64 }, // stage 0 — dug soil
    { x, y: 0, w: 32, h: 64 }, // stage 1 — sprout
    { x, y: 64, w: 32, h: 64 }, // stage 2
    { x, y: 128, w: 32, h: 64 }, // stage 3
    { x, y: 192, w: 32, h: 64 }, // stage 4 — ready to harvest
  ];
}

export const CROP_KINDS: Record<string, CropKindConfig> = {
  // Garden crops: quick → slow. Longer crops pay more per plot.
  radish_crop:  { stages: 5, regrowthMs: 5 * 60_000,  yield: 2, frames: gardenFrames(256) },
  carrot_crop:  { stages: 5, regrowthMs: 10 * 60_000, yield: 3, frames: gardenFrames(32) },
  tomato_crop:  { stages: 5, regrowthMs: 30 * 60_000, yield: 4, frames: gardenFrames(608) },
  pumpkin_crop: { stages: 5, regrowthMs: 60 * 60_000, yield: 1, frames: gardenFrames(864) },
  wheat_field: {
    stages: 5,
    regrowthMs: 60_000, // 1 min per regrowth tick → ~4 min full regrowth
    yield: 1,
    frames: WHEAT_FRAMES,
  },
  // Berry bush: 4 berries per pick, no regrowth (depleted for good after first pick).
  berry_bush:    { stages: 2, regrowthMs: 0, yield: 4, frames: [] },
  // Herbs: 1 per pick, no regrowth.
  herb_patch:    { stages: 2, regrowthMs: 0, yield: 1, frames: [] },
  // Mushroom: 1 per pick, no regrowth.
  mushroom_ring: { stages: 2, regrowthMs: 0, yield: 1, frames: [] },
  // Rock (stone): 1 per pick, no regrowth.
  rock:          { stages: 2, regrowthMs: 0, yield: 1, frames: [] },
  // Oak (wood, needs an axe): a full tree takes 3 chops of 3 wood each,
  // then the stump grows back stage by stage (3 × 90 s ≈ 4.5 min).
  // Frames come from scripts/draw-tree.mjs: stump, sapling, young, full.
  oak_tree: {
    stages: 4,
    regrowthMs: 90_000,
    yield: 3,
    frames: [0, 1, 2, 3].map((i) => ({ x: i * 48, y: 0, w: 48, h: 64 })),
    sheet: "tree_oak",
    needsAxe: true,
  },
};

/** Seeds players can plant, keyed by seed item. */
export const GARDEN_CROPS: Record<string, GardenCropDef> = {
  radish_seeds:  { kind: "radish_crop",  seedKey: "radish_seeds",  produceKey: "radish" },
  carrot_seeds:  { kind: "carrot_crop",  seedKey: "carrot_seeds",  produceKey: "carrot" },
  tomato_seeds:  { kind: "tomato_crop",  seedKey: "tomato_seeds",  produceKey: "tomato" },
  pumpkin_seeds: { kind: "pumpkin_crop", seedKey: "pumpkin_seeds", produceKey: "pumpkin" },
};

/**
 * Seeds from harvests: chance that a harvest also gives back seeds of the
 * same crop, and how many (inclusive range). Keeps a garden going without
 * constant shop trips; buying stays the way to try new crops.
 */
export const HARVEST_SEED_CHANCE = 0.3;
export const HARVEST_SEED_QTY: readonly [number, number] = [1, 2];

/**
 * Seeds from foraging: chance that gathering a wild node (herbs, berries,
 * wheat, …) turns up a seed, and the relative odds of each — weighted
 * toward the quick, cheap crops so rare pumpkins stay a treat.
 */
export const FORAGE_SEED_CHANCE = 0.15;
export const FORAGE_SEED_WEIGHTS: Readonly<Record<string, number>> = {
  radish_seeds: 50,
  carrot_seeds: 30,
  tomato_seeds: 15,
  pumpkin_seeds: 5,
};

/** Returns the config for a kind, or undefined if it's not a crop kind. */
export function getCropKind(kind: string): CropKindConfig | undefined {
  return CROP_KINDS[kind];
}

/** True when the kind is tracked in CROP_KINDS. */
export function isCropKind(kind: string): boolean {
  return kind in CROP_KINDS;
}

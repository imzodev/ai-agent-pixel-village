// Per-kind crop configuration shared between the server (sim worker,
// action route, seed) and the client (texture frame registration).
// Types-only live in src/types/*; this file holds runtime data for crop
// kinds so both processes agree on regrowth timing and yield.
//
// Adding a new crop = append one entry here. The renderer auto-registers
// one named frame per stage on the `lpc_crops` texture at scene-create
// time; the action route and sim worker pull timing + yield from the
// same record.

export type CropRect = { x: number; y: number; w: number; h: number };

export type CropKindConfig = {
  /** Total visual stages. Stage 0 = picked/empty; (stages-1) = fully grown. */
  stages: number;
  /** Milliseconds per regrowth tick. 0 disables auto-regrowth. */
  regrowthMs: number;
  /** Items given to the player per pick. */
  yield: number;
  /**
   * Source-pixel rectangle for each stage, in row-major order:
   * `frames[0]` is the picked/empty tile, `frames[stages-1]` is the
   * fully-grown tile. Empty array = use the procedural node_<kind>
   * sprite (no lpc_crops frame).
   */
  frames: CropRect[];
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

export const CROP_KINDS: Record<string, CropKindConfig> = {
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
};

/** Returns the config for a kind, or undefined if it's not a crop kind. */
export function getCropKind(kind: string): CropKindConfig | undefined {
  return CROP_KINDS[kind];
}

/** True when the kind is tracked in CROP_KINDS. */
export function isCropKind(kind: string): boolean {
  return kind in CROP_KINDS;
}

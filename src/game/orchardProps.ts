// An orchard lot's buildings (scripts/draw-orchard-lot.mjs), drawn by the
// game as they're built: the fruit press and the jam kitchen, the same
// sprites as the vineyard's (src/game/vineyardProps.ts), standing in the
// orchard's gravel yard at the bottom right (template pixels, bottom-left).

import type { RanchBuildKey } from "@/types/ranchGrowth";

export const ORCHARD_PROP_SPOTS: Readonly<Partial<Record<RanchBuildKey, { sprite: string; x: number; y: number }>>> = {
  fruit_press: { sprite: "vy_fruit_press", x: 276, y: 207 },
  jam: { sprite: "vy_jam", x: 306, y: 207 },
};

// Pure garden rules (no DB), shared by src/lib/garden.ts and the client.
// Random rolls take `rand` (returns [0, 1)) so tests can pin them.

import { FORAGE_SEED_CHANCE, FORAGE_SEED_WEIGHTS, HARVEST_SEED_CHANCE, HARVEST_SEED_QTY } from "./crops";

/** True when a crop at `stage` of a kind with `stages` stages is ready. */
export function isRipe(stage: number, stages: number): boolean {
  return stage >= stages - 1;
}

/** When the current stage ends after watering: half the time left. */
export function wateredAdvanceAt(now: number, nextAdvanceAt: number): number {
  return now + Math.max(0, Math.floor((nextAdvanceAt - now) / 2));
}

/** Whether a crop can be watered right now, and why not. */
export function waterCheck(node: { stage: number; wateredStage: number | null; nextAdvanceAt: Date | null }, stages: number): string | null {
  if (isRipe(node.stage, stages)) return "It's ready to harvest — no need to water.";
  if (node.wateredStage === node.stage) return "Already watered. Check back when it grows.";
  if (!node.nextAdvanceAt) return "It's not growing right now.";
  return null;
}

/** Seeds returned by a harvest: 0 most of the time, else 1–2. */
export function rollHarvestSeeds(rand: () => number = Math.random): number {
  if (rand() >= HARVEST_SEED_CHANCE) return 0;
  const [lo, hi] = HARVEST_SEED_QTY;
  return lo + Math.floor(rand() * (hi - lo + 1));
}

/** Seed found while foraging a wild node, or null (most of the time). */
export function rollForageSeed(rand: () => number = Math.random, chanceMult = 1): string | null {
  if (rand() >= FORAGE_SEED_CHANCE * chanceMult) return null;
  const entries = Object.entries(FORAGE_SEED_WEIGHTS);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = rand() * total;
  for (const [seedKey, w] of entries) {
    r -= w;
    if (r < 0) return seedKey;
  }
  return entries[entries.length - 1][0];
}

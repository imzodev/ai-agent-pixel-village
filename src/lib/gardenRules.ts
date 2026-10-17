// Pure garden rules (no DB), shared by src/lib/garden.ts and the client.
// Random rolls take `rand` (returns [0, 1)) so tests can pin them.

import { FORAGE_SEED_CHANCE, FORAGE_SEED_WEIGHTS, HARVEST_SEED_CHANCE, HARVEST_SEED_QTY, getCropKind } from "./crops";
import { stageMs } from "./vineyard";
import type { RegrowthDue, RegrowthWrite } from "@/types/garden";

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

/**
 * What the lot-wide actions (Plant / Harvest / Water all) act on: the free
 * plots, `ownerId`'s ripe crops, and the crops that can be watered now.
 */
export function farmPlan(
  plots: readonly { plot: number }[],
  crops: readonly { id: number; plot: number | null; ownerId: number | null; stage: number; stages: number; wateredStage: number | null; nextAdvanceAt: Date | null }[],
  ownerId: number,
): { free: number[]; ripe: number[]; thirsty: number[] } {
  const taken = new Set(crops.map((c) => c.plot));
  return {
    free: plots.map((p) => p.plot).filter((p) => !taken.has(p)),
    ripe: crops.filter((c) => c.ownerId === ownerId && isRipe(c.stage, c.stages)).map((c) => c.id),
    thirsty: crops.filter((c) => waterCheck(c, c.stages) === null).map((c) => c.id),
  };
}

/**
 * The next stage of every node due to grow (tickd, once a beat): one stage
 * up, and when the stage after it is due (a perennial's fruit at its own
 * pace; Green Thumb owners' crops faster), or null once it's fully grown.
 * Kinds that don't regrow are left out.
 */
export function planRegrowth(due: readonly RegrowthDue[], thumbs: ReadonlySet<number>, now: number, greenThumbMult: number): RegrowthWrite[] {
  const out: RegrowthWrite[] = [];
  for (const row of due) {
    const cfg = getCropKind(row.kind);
    if (!cfg || cfg.regrowthMs <= 0) continue;
    const stage = row.stage + 1;
    const fullyGrown = stage >= cfg.stages - 1;
    const ms = Math.round(stageMs(cfg, stage) * (row.ownerId != null && thumbs.has(row.ownerId) ? greenThumbMult : 1));
    out.push({ id: row.id, fromStage: row.stage, stage, nextAdvanceAt: fullyGrown ? null : now + ms });
  }
  return out;
}

/** Most plots one "plant N" can ask for. */
export const PLANT_COUNT_MAX = 99;

/** How many plots a "plant all" asked for: a whole number 1–99, or null for all of them (anything else). */
export function plantCount(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= PLANT_COUNT_MAX ? n : null;
}

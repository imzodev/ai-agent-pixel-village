// Ranch growth, the pure part: farm levels, what each building costs and
// needs, how big the coop and barn are, care (affection) and the quality
// goods it brings, and the workshop's recipes and timing. The route and
// tickd carry it out (src/lib/ranchServer.ts).
//
// Building costs pull in the rest of the game: wood you chop, stone, and
// fittings from Bjorn's forge.

import type { RanchSpecies } from "@/types/ranch";
import type { BuildStep, MachineKey, MachineRecipe, RanchBuildKey, RanchGrowth, RanchJob } from "@/types/ranchGrowth";

export type { BuildStep, GrowthLot, MachineKey, MachineRecipe, RanchBuildKey, RanchGrowth, RanchGrowthView, RanchJob, RanchLook } from "@/types/ranchGrowth";

const MIN = 60_000;

/** XP where each farm level starts (level 1 at 0). */
export const FARM_LEVELS = [0, 50, 150, 350, 700] as const;
export const XP_PER_GOOD = 1;
export const XP_PER_PROCESSED = 2;
export const XP_PER_DELIVERY = 5;

export function farmLevel(xp: number): number {
  let lv = 1;
  for (let i = 0; i < FARM_LEVELS.length; i++) if (xp >= FARM_LEVELS[i]) lv = i + 1;
  return lv;
}
export function nextLevelAt(xp: number): number | null {
  return FARM_LEVELS.find((t) => t > xp) ?? null;
}

/** How many of each species a ranch holds, by coop / barn level. */
const CAPS: Readonly<Record<RanchSpecies, readonly number[]>> = { chicken: [6, 10, 14], sheep: [3, 5, 7], cow: [2, 3, 4] };
export function capFor(species: RanchSpecies, g: Pick<RanchGrowth, "coopLevel" | "barnLevel">): number {
  const lv = species === "chicken" ? g.coopLevel : g.barnLevel;
  return CAPS[species][Math.max(1, Math.min(3, lv)) - 1];
}

export const SILO_CAP = 60;
/** Ready honey the hives hold at most, and how often they make one. */
export const HIVE_MAX = 4;
export const HIVE_MS = 30 * MIN;

export const BUILD_STEPS: readonly BuildStep[] = [
  { id: "coop2", lot: "ranch", key: "coop", level: 2, name: "Hen house", description: "A bigger coop: room for 10 hens.", coins: 150, items: { wood: 20, stone: 10, fittings: 4 }, farmLevel: 2 },
  { id: "coop3", lot: "ranch", key: "coop", level: 3, name: "Grand hen house", description: "Room for 14 hens.", coins: 400, items: { wood: 40, stone: 20, fittings: 10 }, farmLevel: 4 },
  { id: "barn2", lot: "ranch", key: "barn", level: 2, name: "Barn extension", description: "Room for 5 sheep and 3 cows.", coins: 250, items: { wood: 30, stone: 15, fittings: 6 }, farmLevel: 3 },
  { id: "barn3", lot: "ranch", key: "barn", level: 3, name: "Great barn", description: "Room for 7 sheep and 4 cows.", coins: 600, items: { wood: 50, stone: 30, fittings: 12 }, farmLevel: 5 },
  { id: "silo", lot: "ranch", key: "silo", level: 1, name: "Silo", description: `Store up to ${SILO_CAP} feed.`, coins: 120, items: { wood: 15, stone: 10, fittings: 2 }, farmLevel: 1 },
  { id: "feeder", lot: "ranch", key: "feeder", level: 1, name: "Feeder", description: "Feeds hungry animals from the silo while you're away.", coins: 80, items: { fittings: 3 }, farmLevel: 2, needs: "silo" },
  { id: "mill", lot: "ranch", key: "mill", level: 1, name: "Mill", description: "Grind wheat into flour.", coins: 100, items: { wood: 10, stone: 6, fittings: 2 }, farmLevel: 1 },
  { id: "press", lot: "ranch", key: "press", level: 1, name: "Cheese press", description: "Press milk into cheese.", coins: 120, items: { wood: 8, fittings: 4 }, farmLevel: 2 },
  { id: "loom", lot: "ranch", key: "loom", level: 1, name: "Loom", description: "Weave wool into cloth.", coins: 140, items: { wood: 12, fittings: 4 }, farmLevel: 3 },
  { id: "hives", lot: "ranch", key: "hives", level: 1, name: "Beehives", description: `Bees make a honey every ${HIVE_MS / MIN} minutes (up to ${HIVE_MAX}).`, coins: 60, items: { wood: 8 }, farmLevel: 1 },
  // Vineyards: the winery (src/lib/vineyard.ts).
  { id: "fruit_press", lot: "vineyard", key: "fruit_press", level: 1, name: "Fruit press", description: "Press grapes into juice and apples into cider.", coins: 120, items: { wood: 10, fittings: 4 }, farmLevel: 1 },
  { id: "cellar", lot: "vineyard", key: "cellar", level: 1, name: "Wine cellar", description: "Make red and white wine from your grapes (2 hours a bottle).", coins: 300, items: { stone: 20, wood: 15, fittings: 6 }, farmLevel: 2 },
  { id: "racks", lot: "vineyard", key: "racks", level: 1, name: "Cellar racks", description: "Age a bottle 4 hours into aged wine, worth three times as much.", coins: 250, items: { wood: 20, fittings: 8 }, farmLevel: 3, needs: "cellar" },
  { id: "jam", lot: "vineyard", key: "jam", level: 1, name: "Jam kitchen", description: "Cook fruit and honey into jam.", coins: 150, items: { stone: 10, fittings: 4 }, farmLevel: 2 },
];

export const MACHINE_RECIPES: readonly MachineRecipe[] = [
  { id: "mill_wheat", lot: "ranch", machine: "mill", inputs: { wheat: 3 }, output: "flour", qty: 1, ms: 10 * MIN, name: "Grind 3 wheat into flour" },
  { id: "press_milk", lot: "ranch", machine: "press", inputs: { milk: 2 }, output: "cheese", qty: 1, ms: 20 * MIN, name: "Press 2 milk into cheese" },
  { id: "press_rich", lot: "ranch", machine: "press", inputs: { rich_milk: 1 }, output: "cheese", qty: 1, ms: 20 * MIN, name: "Press 1 rich milk into cheese" },
  { id: "loom_wool", lot: "ranch", machine: "loom", inputs: { wool: 3 }, output: "cloth", qty: 1, ms: 20 * MIN, name: "Weave 3 wool into cloth" },
  { id: "loom_fine", lot: "ranch", machine: "loom", inputs: { fine_wool: 1 }, output: "cloth", qty: 1, ms: 20 * MIN, name: "Weave 1 fine wool into cloth" },
  { id: "press_red", lot: "vineyard", machine: "fruit_press", inputs: { red_grape: 4 }, output: "grape_juice", qty: 1, ms: 10 * MIN, name: "Press 4 red grapes into juice" },
  { id: "press_white", lot: "vineyard", machine: "fruit_press", inputs: { white_grape: 4 }, output: "grape_juice", qty: 1, ms: 10 * MIN, name: "Press 4 white grapes into juice" },
  { id: "press_apples", lot: "vineyard", machine: "fruit_press", inputs: { apple: 3 }, output: "cider", qty: 1, ms: 15 * MIN, name: "Press 3 apples into cider" },
  { id: "wine_red", lot: "vineyard", machine: "cellar", inputs: { red_grape: 6 }, output: "red_wine", qty: 1, ms: 120 * MIN, name: "Make red wine from 6 red grapes" },
  { id: "wine_white", lot: "vineyard", machine: "cellar", inputs: { white_grape: 6 }, output: "white_wine", qty: 1, ms: 120 * MIN, name: "Make white wine from 6 white grapes" },
  { id: "age_red", lot: "vineyard", machine: "racks", inputs: { red_wine: 1 }, output: "aged_red_wine", qty: 1, ms: 240 * MIN, name: "Age a red wine" },
  { id: "age_white", lot: "vineyard", machine: "racks", inputs: { white_wine: 1 }, output: "aged_white_wine", qty: 1, ms: 240 * MIN, name: "Age a white wine" },
  { id: "jam_apple", lot: "vineyard", machine: "jam", inputs: { apple: 4, honey: 1 }, output: "jam", qty: 2, ms: 20 * MIN, name: "Cook 4 apples and a honey into jam" },
  { id: "jam_grape", lot: "vineyard", machine: "jam", inputs: { red_grape: 4, honey: 1 }, output: "jam", qty: 2, ms: 20 * MIN, name: "Cook 4 red grapes and a honey into jam" },
];

/** Is it built (coop/barn count as built at level 1)? */
export function hasBuilt(g: RanchGrowth, key: RanchBuildKey): boolean {
  if (key === "coop") return g.coopLevel >= 1;
  if (key === "barn") return g.barnLevel >= 1;
  return g.machines.includes(key);
}

/** Is this step the next one for its building (not built, not skipping a level)? */
export function isNextStep(g: RanchGrowth, s: BuildStep): boolean {
  if (s.key === "coop") return g.coopLevel === s.level - 1;
  if (s.key === "barn") return g.barnLevel === s.level - 1;
  return !g.machines.includes(s.key);
}

/** Can this step be built now? `why` says what's missing. */
export function canBuild(g: RanchGrowth, s: BuildStep, bag: Readonly<Record<string, number>>, coins: number): { ok: boolean; why: string | null } {
  if (!isNextStep(g, s)) return { ok: false, why: "Already built." };
  if (farmLevel(g.farmXp) < s.farmLevel) return { ok: false, why: `Needs farm level ${s.farmLevel}.` };
  if (s.needs && !hasBuilt(g, s.needs)) return { ok: false, why: `Build the ${s.needs} first.` };
  if (coins < s.coins) return { ok: false, why: `Needs ${s.coins} coins.` };
  const short = Object.entries(s.items).filter(([k, n]) => (bag[k] ?? 0) < n).map(([k, n]) => `${n} ${k}`);
  if (short.length) return { ok: false, why: `Needs ${short.join(", ")}.` };
  return { ok: true, why: null };
}

/** The growth after building a step. */
export function applyBuild(g: RanchGrowth, s: BuildStep, now: number): RanchGrowth {
  if (s.key === "coop") return { ...g, coopLevel: s.level };
  if (s.key === "barn") return { ...g, barnLevel: s.level };
  return { ...g, machines: [...g.machines, s.key], ...(s.key === "hives" ? { hivesAt: now } : {}) };
}

// ── Care and quality ─────────────────────────────────────────────────────
export const PET_AFFECTION = 8;
/** An animal gains affection from petting once per this. */
export const PET_COOLDOWN_MS = 20 * 3600_000;
export const FED_AFFECTION = 2;
export const STARVING_PENALTY = 1;
/** The better good each animal can give. */
export const QUALITY: Readonly<Record<string, string>> = { egg: "golden_egg", wool: "fine_wool", milk: "rich_milk" };
export const QUALITY_MAX = 0.4;

export function qualityChance(affection: number): number {
  return Math.max(0, Math.min(QUALITY_MAX, affection / 250));
}

/** Split `n` goods into plain and quality ones by affection. */
export function collectGoods(produce: string, n: number, affection: number, rand: () => number = Math.random): Record<string, number> {
  const out: Record<string, number> = {};
  const better = QUALITY[produce];
  for (let i = 0; i < n; i++) {
    const k = better && rand() < qualityChance(affection) ? better : produce;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export const clampAffection = (a: number) => Math.max(0, Math.min(100, Math.round(a)));

// ── Workshop ─────────────────────────────────────────────────────────────
export function recipeById(id: string): MachineRecipe | undefined {
  return MACHINE_RECIPES.find((r) => r.id === id);
}

/** A machine is free when it's built and has no job running. */
export function machineFree(g: RanchGrowth, machine: MachineKey): boolean {
  return g.machines.includes(machine) && !g.jobs.some((j) => j.machine === machine);
}

export function newJob(r: MachineRecipe, now: number): RanchJob {
  return { machine: r.machine, recipe: r.id, output: r.output, qty: r.qty, readyAt: now + r.ms };
}

/** Honey ready in the hives. */
export function honeyReady(g: RanchGrowth, now: number): number {
  if (!g.machines.includes("hives") || g.hivesAt == null) return 0;
  return Math.max(0, Math.min(HIVE_MAX, Math.floor((now - g.hivesAt) / HIVE_MS)));
}

/** The new `hivesAt` after taking `n` honey (partial progress kept unless full). */
export function afterHoney(hivesAt: number, n: number, now: number): number {
  return n >= HIVE_MAX ? now : hivesAt + n * HIVE_MS;
}

/** Feed in the silo, total. */
export const siloStored = (silo: Readonly<Record<string, number>>) => Object.values(silo).reduce((s, n) => s + n, 0);

/** Take one feed from the silo (largest pile first); null when empty. */
export function takeFeed(silo: Readonly<Record<string, number>>): { item: string; silo: Record<string, number> } | null {
  const [item] = Object.entries(silo).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!item) return null;
  const next = { ...silo, [item]: silo[item] - 1 };
  if (next[item] <= 0) delete next[item];
  return { item, silo: next };
}

export const EMPTY_GROWTH: RanchGrowth = { farmXp: 0, coopLevel: 1, barnLevel: 1, silo: {}, machines: [], jobs: [], hivesAt: null };
export const MACHINES: readonly MachineKey[] = ["mill", "press", "loom", "hives", "fruit_press", "cellar", "racks", "jam"];

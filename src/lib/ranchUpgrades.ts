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
  // Workshops: the carpenter's stations (the workbench comes with the lot).
  { id: "saw", lot: "workshop", key: "saw", level: 1, name: "Saw bench", description: "Saw logs into planks.", coins: 80, items: { stone: 10, fittings: 2 }, farmLevel: 1 },
  { id: "lathe", lot: "workshop", key: "lathe", level: 1, name: "Lathe", description: "Turn rocking chairs and wardrobes.", coins: 200, items: { plank: 20, fittings: 4 }, farmLevel: 2 },
  { id: "upholstery", lot: "workshop", key: "upholstery", level: 1, name: "Upholstery bench", description: "Beds, armchairs, sofas and rugs, from your ranch's cloth and wool.", coins: 250, items: { plank: 15, cloth: 4, fittings: 6 }, farmLevel: 3 },
  { id: "varnish", lot: "workshop", key: "varnish", level: 1, name: "Varnish shelf", description: "Polish a piece with honey wax: worth twice as much.", coins: 300, items: { plank: 20, honey: 2, fittings: 6 }, farmLevel: 4 },
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
  { id: "saw_planks", lot: "workshop", machine: "saw", inputs: { wood: 2 }, output: "plank", qty: 3, ms: 5 * MIN, name: "Saw 2 logs into 3 planks", xp: 1 },
  { id: "make_chair", lot: "workshop", machine: "workbench", inputs: { plank: 4 }, output: "chair", qty: 1, ms: 10 * MIN, name: "Make a chair (4 planks)", xp: 3 },
  { id: "make_stool", lot: "workshop", machine: "workbench", inputs: { plank: 2 }, output: "stool", qty: 1, ms: 6 * MIN, name: "Make a stool (2 planks)", xp: 3 },
  { id: "make_table", lot: "workshop", machine: "workbench", inputs: { plank: 6, fittings: 1 }, output: "table", qty: 1, ms: 15 * MIN, name: "Make a table (6 planks, 1 fitting)", xp: 3 },
  { id: "make_bookshelf", lot: "workshop", machine: "workbench", inputs: { plank: 8, fittings: 2 }, output: "bookshelf", qty: 1, ms: 20 * MIN, name: "Make a bookshelf (8 planks, 2 fittings)", xp: 3 },
  { id: "make_lamp", lot: "workshop", machine: "workbench", inputs: { plank: 1, cloth: 1, fittings: 1 }, output: "lamp", qty: 1, ms: 10 * MIN, name: "Make a lamp (1 plank, 1 cloth, 1 fitting)", xp: 3 },
  { id: "make_cabinet", lot: "workshop", machine: "workbench", inputs: { plank: 8, fittings: 3 }, output: "cabinet", qty: 1, ms: 20 * MIN, name: "Make a cabinet (8 planks, 3 fittings)", xp: 3 },
  { id: "turn_rocking", lot: "workshop", machine: "lathe", inputs: { plank: 6, fittings: 1 }, output: "rocking_chair", qty: 1, ms: 20 * MIN, name: "Turn a rocking chair (6 planks, 1 fitting)", xp: 3 },
  { id: "turn_wardrobe", lot: "workshop", machine: "lathe", inputs: { plank: 12, fittings: 3 }, output: "wardrobe", qty: 1, ms: 30 * MIN, name: "Build a wardrobe (12 planks, 3 fittings)", xp: 3 },
  { id: "up_bed", lot: "workshop", machine: "upholstery", inputs: { plank: 6, cloth: 2, wool: 2 }, output: "bed", qty: 1, ms: 25 * MIN, name: "Make a bed (6 planks, 2 cloth, 2 wool)", xp: 3 },
  { id: "up_armchair", lot: "workshop", machine: "upholstery", inputs: { plank: 5, cloth: 2, wool: 2, fittings: 1 }, output: "armchair", qty: 1, ms: 25 * MIN, name: "Make an armchair (5 planks, 2 cloth, 2 wool, 1 fitting)", xp: 3 },
  { id: "up_sofa", lot: "workshop", machine: "upholstery", inputs: { plank: 8, cloth: 3, wool: 3, fittings: 2 }, output: "sofa", qty: 1, ms: 35 * MIN, name: "Make a sofa (8 planks, 3 cloth, 3 wool, 2 fittings)", xp: 3 },
  { id: "up_rug", lot: "workshop", machine: "upholstery", inputs: { cloth: 3 }, output: "rug", qty: 1, ms: 15 * MIN, name: "Weave a rug (3 cloth)", xp: 3 },
  { id: "pol_chair", lot: "workshop", machine: "varnish", inputs: { chair: 1, honey: 1 }, output: "polished_chair", qty: 1, ms: 20 * MIN, name: "Polish a chair (1 honey)", xp: 3 },
  { id: "pol_table", lot: "workshop", machine: "varnish", inputs: { table: 1, honey: 1 }, output: "polished_table", qty: 1, ms: 20 * MIN, name: "Polish a table (1 honey)", xp: 3 },
  { id: "pol_cabinet", lot: "workshop", machine: "varnish", inputs: { cabinet: 1, honey: 1 }, output: "polished_cabinet", qty: 1, ms: 20 * MIN, name: "Polish a cabinet (1 honey)", xp: 3 },
  { id: "pol_wardrobe", lot: "workshop", machine: "varnish", inputs: { wardrobe: 1, honey: 1 }, output: "polished_wardrobe", qty: 1, ms: 20 * MIN, name: "Polish a wardrobe (1 honey)", xp: 3 },
];

/** Stations every lot of its kind starts with (the workshop's workbench is in the template). */
export const BUILT_IN: readonly RanchBuildKey[] = ["workbench"];

/** Is it built (coop/barn count as built at level 1; built-in stations always)? */
export function hasBuilt(g: RanchGrowth, key: RanchBuildKey): boolean {
  if (key === "coop") return g.coopLevel >= 1;
  if (key === "barn") return g.barnLevel >= 1;
  return BUILT_IN.includes(key) || g.machines.includes(key);
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
  return hasBuilt(g, machine) && !g.jobs.some((j) => j.machine === machine);
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

export const EMPTY_GROWTH: RanchGrowth = { farmXp: 0, coopLevel: 1, barnLevel: 1, silo: {}, machines: [], jobs: [], hivesAt: null, display: [] };
export const MACHINES: readonly MachineKey[] = ["mill", "press", "loom", "hives", "fruit_press", "cellar", "racks", "jam", "workbench", "saw", "lathe", "upholstery", "varnish"];

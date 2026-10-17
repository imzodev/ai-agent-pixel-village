// Homestead growth, the pure part: farm levels, what each building costs
// and needs (the barn and the workshop, then what goes by them), care (affection) and the quality
// goods it brings, and the workshop's recipes and timing. The route and
// tickd carry it out (src/lib/ranchServer.ts).
//
// Building costs pull in the rest of the game: wood you chop, stone, and
// fittings from Bjorn's forge.

import type { BuildStep, BuildingParcels, MachineKey, MachineRecipe, RanchBuildKey, RanchGrowth, RanchJob } from "@/types/ranchGrowth";

export type { BuildStep, BuildingParcels, MachineKey, MachineRecipe, RanchBuildKey, RanchGrowth, RanchGrowthView, RanchJob, RanchLook } from "@/types/ranchGrowth";

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

export const SILO_CAP = 60;
/** Ready honey the hives hold at most, and how often they make one. */
export const HIVE_MAX = 4;
export const HIVE_MS = 30 * MIN;

export const BUILD_STEPS: readonly BuildStep[] = [
  { id: "silo", place: "barn", key: "silo", name: "Silo", description: `Store up to ${SILO_CAP} feed.`, coins: 120, items: { wood: 15, stone: 10, fittings: 2 }, farmLevel: 1 },
  { id: "feeder", place: "barn", key: "feeder", name: "Feeder", description: "Feeds hungry animals from the silo while you're away.", coins: 80, items: { fittings: 3 }, farmLevel: 2, needs: "silo" },
  { id: "mill", place: "barn", key: "mill", name: "Mill", description: "Grind wheat into flour.", coins: 100, items: { wood: 10, stone: 6, fittings: 2 }, farmLevel: 1 },
  { id: "press", place: "barn", key: "press", name: "Cheese press", description: "Press milk into cheese.", coins: 120, items: { wood: 8, fittings: 4 }, farmLevel: 2 },
  { id: "loom", place: "barn", key: "loom", name: "Loom", description: "Weave wool into cloth.", coins: 140, items: { wood: 12, fittings: 4 }, farmLevel: 3 },
  { id: "hives", place: "barn", key: "hives", name: "Beehives", description: `Bees make a honey every ${HIVE_MS / MIN} minutes (up to ${HIVE_MAX}).`, coins: 60, items: { wood: 8 }, farmLevel: 1 },
  // The winery and the jam kitchen (vineyard and orchard fruit).
  { id: "fruit_press", place: "barn", key: "fruit_press", name: "Fruit press", description: "Press grapes into juice and apples into cider.", coins: 120, items: { wood: 10, fittings: 4 }, farmLevel: 1 },
  { id: "cellar", place: "barn", key: "cellar", name: "Wine cellar", description: "Make red and white wine from your grapes (2 hours a bottle).", coins: 300, items: { stone: 20, wood: 15, fittings: 6 }, farmLevel: 2 },
  { id: "racks", place: "barn", key: "racks", name: "Cellar racks", description: "Age a bottle 4 hours into aged wine, worth three times as much.", coins: 250, items: { wood: 20, fittings: 8 }, farmLevel: 3, needs: "cellar" },
  { id: "jam", place: "barn", key: "jam", name: "Jam kitchen", description: "Cook fruit and honey into jam.", coins: 150, items: { stone: 10, fittings: 4 }, farmLevel: 2 },
  // Homesteads: the barn and the workshop, each on its own parcel (src/lib/homestead.ts).
  { id: "hs_barn", place: "homestead", key: "hs_barn", name: "Barn", description: "A red barn: then build a silo, a feeder, a mill, a cheese press, a loom, hives, a fruit press, a wine cellar and a jam kitchen beside it.", coins: 150, items: { wood: 20, stone: 10, fittings: 4 }, farmLevel: 1 },
  { id: "hs_workshop", place: "homestead", key: "hs_workshop", name: "Carpenter's workshop", description: "A workshop with its workbench: then add a saw bench, a lathe, an upholstery bench and a varnish shelf, and show your furniture.", coins: 80, items: { wood: 12, stone: 6, fittings: 2 }, farmLevel: 1 },
  // Workshops: the carpenter's stations (the workbench comes with the lot).
  { id: "saw", place: "workshop", key: "saw", name: "Saw bench", description: "Saw logs into planks.", coins: 80, items: { stone: 10, fittings: 2 }, farmLevel: 1 },
  { id: "lathe", place: "workshop", key: "lathe", name: "Lathe", description: "Turn rocking chairs and wardrobes.", coins: 200, items: { plank: 20, fittings: 4 }, farmLevel: 2 },
  { id: "upholstery", place: "workshop", key: "upholstery", name: "Upholstery bench", description: "Beds, armchairs, sofas and rugs, from your ranch's cloth and wool.", coins: 250, items: { plank: 15, cloth: 4, fittings: 6 }, farmLevel: 3 },
  { id: "varnish", place: "workshop", key: "varnish", name: "Varnish shelf", description: "Polish a piece with honey wax: worth twice as much.", coins: 300, items: { plank: 20, honey: 2, fittings: 6 }, farmLevel: 4 },
];

export const MACHINE_RECIPES: readonly MachineRecipe[] = [
  { id: "mill_wheat", place: "barn", machine: "mill", inputs: { wheat: 3 }, output: "flour", qty: 1, ms: 10 * MIN, name: "Grind 3 wheat into flour" },
  { id: "press_milk", place: "barn", machine: "press", inputs: { milk: 2 }, output: "cheese", qty: 1, ms: 20 * MIN, name: "Press 2 milk into cheese" },
  { id: "press_rich", place: "barn", machine: "press", inputs: { rich_milk: 1 }, output: "cheese", qty: 1, ms: 20 * MIN, name: "Press 1 rich milk into cheese" },
  { id: "loom_wool", place: "barn", machine: "loom", inputs: { wool: 3 }, output: "cloth", qty: 1, ms: 20 * MIN, name: "Weave 3 wool into cloth" },
  { id: "loom_fine", place: "barn", machine: "loom", inputs: { fine_wool: 1 }, output: "cloth", qty: 1, ms: 20 * MIN, name: "Weave 1 fine wool into cloth" },
  { id: "press_red", place: "barn", machine: "fruit_press", inputs: { red_grape: 4 }, output: "grape_juice", qty: 1, ms: 10 * MIN, name: "Press 4 red grapes into juice" },
  { id: "press_white", place: "barn", machine: "fruit_press", inputs: { white_grape: 4 }, output: "grape_juice", qty: 1, ms: 10 * MIN, name: "Press 4 white grapes into juice" },
  { id: "press_apples", place: "barn", machine: "fruit_press", inputs: { apple: 3 }, output: "cider", qty: 1, ms: 15 * MIN, name: "Press 3 apples into cider" },
  { id: "wine_red", place: "barn", machine: "cellar", inputs: { red_grape: 6 }, output: "red_wine", qty: 1, ms: 120 * MIN, name: "Make red wine from 6 red grapes" },
  { id: "wine_white", place: "barn", machine: "cellar", inputs: { white_grape: 6 }, output: "white_wine", qty: 1, ms: 120 * MIN, name: "Make white wine from 6 white grapes" },
  { id: "age_red", place: "barn", machine: "racks", inputs: { red_wine: 1 }, output: "aged_red_wine", qty: 1, ms: 240 * MIN, name: "Age a red wine" },
  { id: "age_white", place: "barn", machine: "racks", inputs: { white_wine: 1 }, output: "aged_white_wine", qty: 1, ms: 240 * MIN, name: "Age a white wine" },
  { id: "jam_apple", place: "barn", machine: "jam", inputs: { apple: 4, honey: 1 }, output: "jam", qty: 2, ms: 20 * MIN, name: "Cook 4 apples and a honey into jam" },
  { id: "o_press_orange", place: "barn", machine: "fruit_press", inputs: { orange: 3 }, output: "orange_juice", qty: 1, ms: 10 * MIN, name: "Press 3 oranges into juice" },
  { id: "o_press_lemon", place: "barn", machine: "fruit_press", inputs: { lemon: 3, honey: 1 }, output: "lemonade", qty: 2, ms: 12 * MIN, name: "Make lemonade from 3 lemons and a honey" },
  { id: "o_press_pear", place: "barn", machine: "fruit_press", inputs: { pear: 3 }, output: "pear_cider", qty: 1, ms: 15 * MIN, name: "Press 3 pears into pear cider" },
  { id: "o_jam_cherry", place: "barn", machine: "jam", inputs: { cherry: 4, honey: 1 }, output: "cherry_jam", qty: 2, ms: 20 * MIN, name: "Cook 4 cherries and a honey into jam" },
  { id: "o_jam_peach", place: "barn", machine: "jam", inputs: { peach: 3, honey: 1 }, output: "peach_jam", qty: 2, ms: 20 * MIN, name: "Cook 3 peaches and a honey into jam" },
  { id: "o_jam_plum", place: "barn", machine: "jam", inputs: { plum: 4, honey: 1 }, output: "plum_jam", qty: 2, ms: 20 * MIN, name: "Cook 4 plums and a honey into jam" },
  { id: "jam_grape", place: "barn", machine: "jam", inputs: { red_grape: 4, honey: 1 }, output: "jam", qty: 2, ms: 20 * MIN, name: "Cook 4 red grapes and a honey into jam" },
  { id: "saw_planks", place: "workshop", machine: "saw", inputs: { wood: 2 }, output: "plank", qty: 3, ms: 5 * MIN, name: "Saw 2 logs into 3 planks", xp: 1 },
  { id: "make_chair", place: "workshop", machine: "workbench", inputs: { plank: 4 }, output: "chair", qty: 1, ms: 10 * MIN, name: "Make a chair (4 planks)", xp: 3 },
  { id: "make_stool", place: "workshop", machine: "workbench", inputs: { plank: 2 }, output: "stool", qty: 1, ms: 6 * MIN, name: "Make a stool (2 planks)", xp: 3 },
  { id: "make_table", place: "workshop", machine: "workbench", inputs: { plank: 6, fittings: 1 }, output: "table", qty: 1, ms: 15 * MIN, name: "Make a table (6 planks, 1 fitting)", xp: 3 },
  { id: "make_bookshelf", place: "workshop", machine: "workbench", inputs: { plank: 8, fittings: 2 }, output: "bookshelf", qty: 1, ms: 20 * MIN, name: "Make a bookshelf (8 planks, 2 fittings)", xp: 3 },
  { id: "make_lamp", place: "workshop", machine: "workbench", inputs: { plank: 1, cloth: 1, fittings: 1 }, output: "lamp", qty: 1, ms: 10 * MIN, name: "Make a lamp (1 plank, 1 cloth, 1 fitting)", xp: 3 },
  { id: "make_cabinet", place: "workshop", machine: "workbench", inputs: { plank: 8, fittings: 3 }, output: "cabinet", qty: 1, ms: 20 * MIN, name: "Make a cabinet (8 planks, 3 fittings)", xp: 3 },
  { id: "turn_rocking", place: "workshop", machine: "lathe", inputs: { plank: 6, fittings: 1 }, output: "rocking_chair", qty: 1, ms: 20 * MIN, name: "Turn a rocking chair (6 planks, 1 fitting)", xp: 3 },
  { id: "turn_wardrobe", place: "workshop", machine: "lathe", inputs: { plank: 12, fittings: 3 }, output: "wardrobe", qty: 1, ms: 30 * MIN, name: "Build a wardrobe (12 planks, 3 fittings)", xp: 3 },
  { id: "up_bed", place: "workshop", machine: "upholstery", inputs: { plank: 6, cloth: 2, wool: 2 }, output: "bed", qty: 1, ms: 25 * MIN, name: "Make a bed (6 planks, 2 cloth, 2 wool)", xp: 3 },
  { id: "up_armchair", place: "workshop", machine: "upholstery", inputs: { plank: 5, cloth: 2, wool: 2, fittings: 1 }, output: "armchair", qty: 1, ms: 25 * MIN, name: "Make an armchair (5 planks, 2 cloth, 2 wool, 1 fitting)", xp: 3 },
  { id: "up_sofa", place: "workshop", machine: "upholstery", inputs: { plank: 8, cloth: 3, wool: 3, fittings: 2 }, output: "sofa", qty: 1, ms: 35 * MIN, name: "Make a sofa (8 planks, 3 cloth, 3 wool, 2 fittings)", xp: 3 },
  { id: "up_rug", place: "workshop", machine: "upholstery", inputs: { cloth: 3 }, output: "rug", qty: 1, ms: 15 * MIN, name: "Weave a rug (3 cloth)", xp: 3 },
  { id: "pol_chair", place: "workshop", machine: "varnish", inputs: { chair: 1, honey: 1 }, output: "polished_chair", qty: 1, ms: 20 * MIN, name: "Polish a chair (1 honey)", xp: 3 },
  { id: "pol_table", place: "workshop", machine: "varnish", inputs: { table: 1, honey: 1 }, output: "polished_table", qty: 1, ms: 20 * MIN, name: "Polish a table (1 honey)", xp: 3 },
  { id: "pol_cabinet", place: "workshop", machine: "varnish", inputs: { cabinet: 1, honey: 1 }, output: "polished_cabinet", qty: 1, ms: 20 * MIN, name: "Polish a cabinet (1 honey)", xp: 3 },
  { id: "pol_wardrobe", place: "workshop", machine: "varnish", inputs: { wardrobe: 1, honey: 1 }, output: "polished_wardrobe", qty: 1, ms: 20 * MIN, name: "Polish a wardrobe (1 honey)", xp: 3 },
];

/** Stations that come with their building (the workshop's workbench). */
export const BUILT_IN: readonly RanchBuildKey[] = ["workbench"];

/** Is it built (built-in stations always)? */
export function hasBuilt(g: RanchGrowth, key: RanchBuildKey): boolean {
  return BUILT_IN.includes(key) || g.machines.includes(key);
}

/** Not built yet? (Every step is a one-off building.) */
export function isNextStep(g: RanchGrowth, s: BuildStep): boolean {
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
  return { ...g, machines: [...g.machines, s.key], ...(s.key === "hives" ? { hivesAt: now } : {}) };
}

// ── Care and quality ─────────────────────────────────────────────────────
export const PET_AFFECTION = 8;
/** The same pet with the Fox Charm worn (src/lib/gear.ts, the charm slot). */
export const FOX_CHARM_AFFECTION = 12;
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

// ── What can be built and run ─────────────────────────────────────────────
/** Is the homestead's barn (workshop) up: built, and with a parcel to stand on? */
export const barnUp = (g: RanchGrowth, at: BuildingParcels) => at.barn && g.machines.includes("hs_barn");
export const workshopUp = (g: RanchGrowth, at: BuildingParcels) => at.workshop && g.machines.includes("hs_workshop");

/**
 * What a homestead can build and run: its barn and workshop once it has a
 * parcel for them; then, once built, what goes by each. Built machines stay
 * the homestead's if the parcel changes use; they're back up as soon as
 * another parcel is made the barn (workshop).
 */
export function growthScope(g: RanchGrowth, at: BuildingParcels): { steps: BuildStep[]; recipes: MachineRecipe[] } {
  const up = (place: string) => place === "barn" ? barnUp(g, at) : place === "workshop" ? workshopUp(g, at) : false;
  const steps = BUILD_STEPS.filter((s) => (s.place === "homestead" ? (s.key === "hs_barn" ? at.barn : at.workshop) : up(s.place)));
  return { steps, recipes: MACHINE_RECIPES.filter((r) => up(r.place)) };
}

export const EMPTY_GROWTH: RanchGrowth = { farmXp: 0, silo: {}, machines: [], jobs: [], hivesAt: null, display: [] };
export const MACHINES: readonly MachineKey[] = ["mill", "press", "loom", "hives", "fruit_press", "cellar", "racks", "jam", "workbench", "saw", "lathe", "upholstery", "varnish"];

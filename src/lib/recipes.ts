// Crafting recipes — data + pure helpers. Each recipe belongs to a trade
// (baker, smith, …); any NPC with that trade (src/lib/npcDefs.ts) crafts
// it, and the player must stand near them. Adding a recipe = one entry
// here; adding a crafter = give an NPC the trade.
//
// Pure module — no DB imports — so the HUD can import RECIPES without
// pulling the pg driver into the client bundle. Server-side logic
// (validation, debit/credit) lives in the route.
import { npcTrades } from "./npcDefs";
import type { Recipe } from "./types";

export const RECIPES: Recipe[] = [
  {
    key: "bread",
    name: "Fresh Bread",
    icon: "🍞",
    trade: "baker",
    inputs: [
      { itemKey: "flour", qty: 1 },
      { itemKey: "egg",   qty: 1 },
      { itemKey: "herb",  qty: 1 },
    ],
    output: { itemKey: "bread", qty: 1 },
    line: "Mix flour with an egg and herbs. I'll bake it for you.",
  },
  {
    key: "tea",
    name: "Calming Tea",
    icon: "🍵",
    trade: "herbalist",
    inputs: [{ itemKey: "herb", qty: 3 }],
    output: { itemKey: "tea", qty: 1 },
    line: "Steep three herbs in hot water for a quiet minute. I'll do the rest.",
  },
  {
    key: "honey_bun",
    name: "Honey Bun",
    icon: "🥐",
    trade: "baker",
    inputs: [
      { itemKey: "flour", qty: 1 },
      { itemKey: "egg",   qty: 1 },
    ],
    output: { itemKey: "honey_bun", qty: 1 },
    line: "Flour and an egg, a touch of honey, a hot oven. Done.",
  },
  {
    key: "cinnamon_knot",
    name: "Cinnamon Knot",
    icon: "🥯",
    trade: "baker",
    inputs: [
      { itemKey: "flour", qty: 1 },
      { itemKey: "berry", qty: 2 },
      { itemKey: "egg",   qty: 1 },
    ],
    output: { itemKey: "cinnamon_knot", qty: 1 },
    line: "Flour, two berries, an egg, and a fold of cinnamon. Try it warm.",
  },
  {
    key: "flour",
    name: "Bag of Flour",
    icon: "🌾",
    trade: "miller",
    inputs: [{ itemKey: "wheat", qty: 2 }],
    output: { itemKey: "flour", qty: 1 },
    line: "Two sheaves, ground while you wait. A full sack of flour.",
  },
  {
    key: "lantern",
    name: "Brass Lantern",
    icon: "🏮",
    trade: "tinker",
    inputs: [
      { itemKey: "stone", qty: 2 },
      { itemKey: "slime_gel", qty: 1 },
    ],
    output: { itemKey: "lantern", qty: 1 },
    line: "Two stones, a blob of gel, a brass housing. Burns steady all night.",
  },
  {
    key: "rug",
    name: "Woven Rug",
    icon: "🟥",
    trade: "tinker",
    inputs: [{ itemKey: "wool", qty: 4 }],
    output: { itemKey: "rug", qty: 1 },
    line: "Four tufts of wool, felted tight. Ties the room together.",
  },
  // Gear: weapons and tools from wood, stone and enemy drops. Level-gated
  // (see LEVEL_UNLOCKS in src/lib/progression.ts).
  {
    key: "stone_sword",
    name: "Stone Sword",
    icon: "🗡️",
    trade: "smith",
    inputs: [{ itemKey: "stone", qty: 4 }, { itemKey: "wood", qty: 4 }],
    output: { itemKey: "stone_sword", qty: 1 },
    line: "A good river stone, knapped to an edge, on an oak grip. +4 attack.",
    requires: { level: 3 },
  },
  {
    key: "thorn_blade",
    name: "Thorn Blade",
    icon: "🗡️",
    trade: "smith",
    inputs: [{ itemKey: "thorn", qty: 6 }, { itemKey: "boar_hide", qty: 2 }, { itemKey: "wood", qty: 4 }],
    output: { itemKey: "thorn_blade", qty: 1 },
    line: "Thornling thorns set in oak, wrapped in boar hide. +6 attack.",
    requires: { level: 5 },
  },
  {
    key: "sharp_axe",
    name: "Sharp Axe",
    icon: "🪓",
    trade: "smith",
    inputs: [{ itemKey: "axe", qty: 1 }, { itemKey: "boar_hide", qty: 2 }, { itemKey: "stone", qty: 4 }],
    output: { itemKey: "sharp_axe", qty: 1 },
    line: "I'll hone your axe and wrap the haft. +1 wood every chop.",
    requires: { level: 5 },
  },
  {
    key: "wisp_blade",
    name: "Wisp Blade",
    icon: "🗡️",
    trade: "smith",
    inputs: [{ itemKey: "wisp_essence", qty: 4 }, { itemKey: "thorn_blade", qty: 1 }],
    output: { itemKey: "wisp_blade", qty: 1 },
    line: "Bring me wisp light and your thorn blade. +9 attack.",
    requires: { level: 8 },
  },
  // The far lands' gear: each step forged from the one before and that land's trophies.
  {
    key: "steel_sword",
    name: "Steel Sword",
    icon: "🗡️",
    trade: "smith",
    inputs: [{ itemKey: "stalker_scale", qty: 6 }, { itemKey: "hag_charm", qty: 1 }, { itemKey: "wisp_blade", qty: 1 }],
    output: { itemKey: "steel_sword", qty: 1 },
    line: "Stalker scale over good steel, and a hag's charm for the edge. +16 attack.",
    requires: { level: 15 },
  },
  {
    key: "runed_bow",
    name: "Runed Bow",
    icon: "🏹",
    trade: "smith",
    inputs: [{ itemKey: "gloam_antler", qty: 3 }, { itemKey: "troll_hide", qty: 2 }, { itemKey: "recurve_bow", qty: 1 }],
    output: { itemKey: "runed_bow", qty: 1 },
    line: "Antler tips, troll-gut string, runes cut along the limbs. Reaches further than anything I've made.",
    requires: { level: 20 },
  },
  {
    key: "wyvernbone_blade",
    name: "Wyvernbone Blade",
    icon: "🗡️",
    trade: "smith",
    inputs: [{ itemKey: "wyvern_bone", qty: 4 }, { itemKey: "basalt_core", qty: 1 }, { itemKey: "steel_sword", qty: 1 }],
    output: { itemKey: "wyvernbone_blade", qty: 1 },
    line: "Wyvern bone, tempered in a golem's core. +21 attack.",
    requires: { level: 25 },
  },
  {
    key: "elder_blade",
    name: "Elder Blade",
    icon: "🗡️",
    trade: "smith",
    inputs: [{ itemKey: "elder_heartwood", qty: 3 }, { itemKey: "rime_essence", qty: 3 }, { itemKey: "wyvernbone_blade", qty: 1 }],
    output: { itemKey: "elder_blade", qty: 1 },
    line: "Heartwood that walked, rime that never melts. The last blade I'll ever need to make. +27 attack.",
    requires: { level: 32 },
  },
  // Archery: a better bow, and arrows from wood and stone.
  {
    key: "recurve_bow",
    name: "Recurve Bow",
    icon: "🏹",
    trade: "smith",
    inputs: [{ itemKey: "wood", qty: 6 }, { itemKey: "boar_hide", qty: 2 }, { itemKey: "wolf_pelt", qty: 1 }],
    output: { itemKey: "recurve_bow", qty: 1 },
    line: "Six good logs, boar hide for the grip and a wolf pelt for the string. It'll outshoot any short bow.",
    requires: { level: 5 },
  },
  {
    key: "arrows",
    name: "Arrows ×10",
    icon: "➶",
    trade: "smith",
    inputs: [{ itemKey: "wood", qty: 2 }, { itemKey: "stone", qty: 1 }],
    output: { itemKey: "arrow", qty: 10 },
    line: "Two logs and a stone: ten arrows, fletched and pointed.",
  },
  // Woodwork: oak logs from the west forest (needs an axe).
  {
    key: "chair",
    name: "Oak Chair",
    icon: "🪑",
    trade: "tinker",
    inputs: [{ itemKey: "wood", qty: 6 }],
    output: { itemKey: "chair", qty: 1 },
    line: "Six oak logs and an afternoon. Sturdy enough for Bram.",
  },
  {
    key: "table",
    name: "Round Table",
    icon: "🟤",
    trade: "tinker",
    inputs: [{ itemKey: "wood", qty: 10 }],
    output: { itemKey: "table", qty: 1 },
    line: "Ten logs, planed and pegged. Seats four friends.",
  },
  {
    key: "bookshelf",
    name: "Bookshelf",
    icon: "📚",
    trade: "tinker",
    inputs: [{ itemKey: "wood", qty: 14 }],
    output: { itemKey: "bookshelf", qty: 1 },
    line: "Fourteen logs of good oak. Room for every cookbook you own.",
  },
];

/** Recipes the given NPC can craft: those of every trade it does. */
export function recipesForNpc(npcKey: string): Recipe[] {
  const trades = npcTrades(npcKey);
  return RECIPES.filter((r) => trades.includes(r.trade));
}

/** Quick lookup. */
export function recipeByKey(key: string): Recipe | null {
  return RECIPES.find((r) => r.key === key) ?? null;
}

/** Pure check: does the player's bag contain all inputs × multiplier? */
export function canCraft(
  recipe: Recipe,
  bag: { itemKey: string; qty: number }[],
  times = 1,
): boolean {
  return recipe.inputs.every((i) => {
    const have = bag
      .filter((b) => b.itemKey === i.itemKey)
      .reduce((s, b) => s + b.qty, 0);
    return have >= i.qty * times;
  });
}

/** Max times this recipe can be crafted with the player's current bag. */
export function maxCraftable(
  recipe: Recipe,
  bag: { itemKey: string; qty: number }[],
): number {
  if (recipe.inputs.length === 0) return 99;
  const perInput = recipe.inputs.map((i) => {
    const have = bag
      .filter((b) => b.itemKey === i.itemKey)
      .reduce((s, b) => s + b.qty, 0);
    return Math.floor(have / i.qty);
  });
  return Math.max(0, Math.min(...perInput));
}

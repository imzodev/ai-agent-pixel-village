// Crafting recipes — data + pure helpers. Each recipe belongs to ONE NPC
// (the crafter); the player must stand near that NPC to use it. Adding a
// recipe = one entry here; adding a crafter = give them recipes by key.
//
// Pure module — no DB imports — so the HUD can import RECIPES without
// pulling the pg driver into the client bundle. Server-side logic
// (validation, debit/credit) lives in the route.
import type { Recipe } from "./types";

export const RECIPES: Recipe[] = [
  {
    key: "bread",
    name: "Fresh Bread",
    icon: "🍞",
    crafterKey: "baker",
    inputs: [
      { itemKey: "flour", qty: 1 },
      { itemKey: "egg",   qty: 1 },
      { itemKey: "herb",  qty: 1 },
    ],
    output: { itemKey: "bread", qty: 1 },
    line: "Mix flour with an egg and herbs. I'll bake it for you.",
  },
];

/** Recipes the given NPC can craft. */
export function recipesForNpc(npcKey: string): Recipe[] {
  return RECIPES.filter((r) => r.crafterKey === npcKey);
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

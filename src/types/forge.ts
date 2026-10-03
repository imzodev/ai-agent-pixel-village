// The Hollowmere forge (src/lib/forge.ts): gear upgrades. Types only.

/** What one forge upgrade costs. */
export type ForgeCost = { coins: number; items: { itemKey: string; qty: number }[] };

/** How an upgrade level helps: sword damage, axe wood, or the rod's catch zone. */
export type ForgeFamily = "sword" | "axe" | "rod";

/** An upgradable item: its family and the material for levels +1, +2, +3. */
export type ForgeItemDef = { family: ForgeFamily; materials: [string, string, string] };

/** One upgradable item in the forge panel. */
export type ForgeItemView = {
  itemKey: string;
  name: string;
  icon: string;
  family: ForgeFamily;
  plus: number;
  /** Cost of the next level, or null at the cap. */
  next: ForgeCost | null;
};

/** The forge panel's data: your upgradable gear, coins and materials on hand. */
export type ForgeView = { items: ForgeItemView[]; coins: number; have: Record<string, number> };

/** Gear the character carries: item keys, what's equipped, and each key's best upgrade level. */
export type Gear = { bag: string[]; equipped: string[]; plus: Record<string, number> };

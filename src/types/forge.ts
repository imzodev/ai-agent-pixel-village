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

/** A worn tool Bjorn can repair: how worn the copy you use is (0–100) and what it costs. */
export type RepairView = { itemKey: string; name: string; icon: string; wear: number; cost: number };

/** The forge panel's data: your upgradable gear, worn tools, coins and materials on hand. */
export type ForgeView = { items: ForgeItemView[]; repairs: RepairView[]; coins: number; have: Record<string, number> };

/** Gear the character carries: item keys, what's equipped, and each key's best upgrade level and that copy's wear. */
export type Gear = { bag: string[]; equipped: string[]; plus: Record<string, number>; wear: Record<string, number> };

/** How worn a tool is: fine, worn (from WORN_AT) or dull (at WEAR_MAX). */
export type WearLevel = "fine" | "worn" | "dull";

/** What a use of a tool is: a chop, a melee hit, a bow shot or a cast. */
export type WearUse = "chop" | "hit" | "shot" | "cast";

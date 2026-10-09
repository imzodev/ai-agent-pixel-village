// Business agents (a sponsor's agent that walks around, pitches and buys).
// Types only. Logic lives in src/lib/mind/business.ts and businessServer.ts.

/** One row of an agent's shopping list. */
export type ShoppingRule = { itemKey: string; maxPrice: number; perPeriod: number };

export type BudgetPeriod = "day" | "week";

/** What the sponsor set, as the mind reads it. */
export type BusinessConfig = {
  npcId: number;
  sponsorId: number;
  pitchLines: string[];
  patrol: string[];
  shopping: ShoppingRule[];
  budgetCoins: number;
  budgetPeriod: BudgetPeriod;
  pitchCooldownMs: number;
  enabled: boolean;
};

/** A nearby player the agent may pitch right now. */
export type PitchTarget = { id: number; name: string };

/** A seller the agent can buy from right now. */
export type ShopOption = { itemKey: string; sellerKey: string; price: number; purchasesLeft: number };

/** The agent's situation this think, in plain values. */
export type BusinessView = {
  now: number;
  hour: number;
  atHome: boolean;
  onTrip: boolean;
  intent: string;
  purse: number;
  pantry: Record<string, number>;
  pitchTargets: PitchTarget[];
  shopOptions: ShopOption[];
  /** Patrol places it may walk to now (already filtered for cooldowns and the current place). */
  patrolCandidates: string[];
  /** Human names for place keys, for the state text. */
  placeNames: Record<string, string>;
  memories: string[];
};

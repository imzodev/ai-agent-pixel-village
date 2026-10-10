// NPC minds (src/lib/mind/): what an NPC has, what it can do right now,
// and what it decided. Types only.

/** Ingredients and baked goods an NPC holds, by item key. */
export type NpcStock = Record<string, number>;

/** One thing that happened to the NPC, in plain words (newest first). */
export type MindMemory = { at: number; text: string };

/** What the NPC is in the middle of: an errand to buy an item, or heading home. */
export type MindIntent = "" | "going_home" | `errand:${string}` | `patrol:${string}` | `shop:${string}`;

/** An action the NPC can take right now: Jev sees `key` + `description`. */
export type MindOption = { key: string; description: string };

/** The answer of one think, kept for the admin view. */
export type MindDecision = {
  at: number;
  source: "jev" | "scripted";
  action: string;
  options: string[];
  probabilities?: Record<string, number>;
  confidence?: number;
  mood?: string;
  urgency?: number;
  /** Why the scripted policy decided instead of Jev. */
  fallback?: string;
};

/** How the NPC feels about a player. */
export type RegardTier = "cool" | "neutral" | "fond" | "dear";

/** A player near the NPC, as the mind sees them. */
export type NearbyPlayer = { id: number; name: string; score: number; tier: RegardTier; giftedToday: boolean };

/** An open request (a mission the NPC posted from a shortage). */
export type OpenRequest = { missionId: number; itemKey: string; qty: number; postedAt: number };

/** Everything a think is decided from (src/lib/mind/profile.ts). */
export type MindView = {
  now: number;
  hour: number;
  weather: string;
  name: string;
  /** At their workplace (near their home spot). */
  atHome: boolean;
  onTrip: boolean;
  intent: MindIntent;
  /** The errand's trip reached its end. */
  errandArrived: boolean;
  stock: NpcStock;
  purse: number;
  /** When they last made a batch of anything. */
  lastCraftAt: number | null;
  /** Their free table (bakers), or null. */
  table: { left: number; itemKey: string | null; bakedAt: number | null } | null;
  requests: OpenRequest[];
  nearby: NearbyPlayer[];
  memories: MindMemory[];
};

/** A batch an NPC can make: what it takes, what it makes, how many go on
 *  the free table (bakers; 0 = all to the shelf), and how it's told. */
export type CraftRecipe = {
  itemKey: string;
  uses: NpcStock;
  makes: number;
  toTable: number;
  /** "bake 12 loaves", for the action's description and the LLM. */
  verb: string;
  /** Said when there's no LLM. */
  line: string;
};

/** Where an NPC goes to buy an ingredient itself (an errand). */
export type SupplyDef = { supplierKey: string; place: string; price: number; buy: number; low: number };

/** A standing order an NPC offers players: so many a week, at this price each. */
export type OrderDef = { qty: number; pay: number };

/** An ingredient an NPC asks players for when it runs low. */
export type AskDef = { qty: number; pay: number; low: number };

/** A kind of mind (src/lib/mind/profiles.ts): pure data, the logic is shared. */
/** How a mind NPC's purse refills, scaled by the players active in the last day. */
export type MindIncome = {
  /** Coins an hour with nobody playing. */
  basePerHour: number;
  /** Extra coins an hour per active player. */
  perPlayerPerHour: number;
  /** The purse refills up to this with nobody playing... */
  baseTarget: number;
  /** ...plus this per active player. */
  perPlayerTarget: number;
};

export type MindProfile = {
  key: string;
  /** "the village baker", for Jev's state and the LLM. */
  trade: string;
  startStock: NpcStock;
  startPurse: number;
  /** Takings from villagers you don't see, so the purse can pay players (src/lib/mind/profile.ts incomeRate). */
  income: MindIncome;
  /** What they sell off their shelf, only while they have it (item → unit price, for the state text). */
  shelf: Readonly<Record<string, number>>;
  shelfFull: number;
  /** Per-item shelf limits where `shelfFull` doesn't fit (arrows come in 20s). */
  shelfCap?: Readonly<Record<string, number>>;
  minCraftGapMs: number;
  /** A table batch this old may be replaced (bakers). */
  tableStaleMs: number;
  /** Action key → batch. */
  crafts: Readonly<Record<string, CraftRecipe>>;
  /** Item → where they buy it themselves. */
  supplies: Readonly<Record<string, SupplyDef>>;
  /** Item → what they ask players for. */
  asks: Readonly<Record<string, AskDef>>;
  /** What they give friends, if anything. */
  gift: { itemKey: string; qty: number } | null;
  /** Item → what they'll buy from players on a standing order, each week. */
  orders: Readonly<Record<string, OrderDef>>;
  /** Item → plural words ("bags of flour"). */
  words: Readonly<Record<string, string>>;
};

/** A parsed Jev answer. */
export type JevChoice = { choice: string; confidence: number; probabilities: Record<string, number> };
export type JevScore = { score: number; confidence: number; probabilities: Record<string, number> };
export type JevAnswers = { choices: Record<string, JevChoice>; scores: Record<string, JevScore> };

/** A Jev question as the client sends it. */
export type JevQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "noul"; instructions: string };

/** The admin view of a mind (GET /api/mind). */
export type MindReport = {
  npcKey: string;
  profile: string;
  stock: NpcStock;
  purse: number;
  intent: MindIntent;
  lastThinkAt: number | null;
  decision: MindDecision | null;
  memories: MindMemory[];
  requests: OpenRequest[];
};

// The economy (src/lib/economy.ts, src/lib/market.ts). Types only — no logic.

/** What kind of good an item is, for who buys it and how it's priced. */
export type GoodsCategory =
  | "produce" // field and garden crops, wild herbs and mushrooms
  | "fruit" // grapes and orchard fruit
  | "fish"
  | "animal" // eggs, milk, wool, honey and their quality kinds
  | "drink" // juices, ciders and wines
  | "food" // bread, pies, jams, cheese, stew…
  | "craft" // cloth, planks, fittings
  | "furniture"
  | "raw" // wood and stone
  | "monster" // hides, pelts and essences from the near wilds (tiers 1–4)
  | "farland" // materials from the far lands (tiers 5–8)
  | "trophy" // boss trophies
  | "gear" // tools, weapons, arrows, the bicycle: sold by shops, not bought back
  | "seed" // seeds, cuttings and saplings: sold by shops, not bought back
  | "keepsake"; // quest items, maps, codes, recipes: not traded

/** One buyer: what it takes (categories or item keys) and what it's a specialist in (pays full value). */
export type BuyerSpec = {
  buys: readonly string[];
  specialty?: readonly string[];
  /** Said when the Sell window opens (no prices: they change with demand). */
  line: string;
};

/** How a market feels about an item right now, for the Sell window. */
export type MarketTrend = "fresh" | "plenty" | "glut";

/** One item's current price at a buyer (GET /api/trade?npcKey=…). */
export type MarketPrice = {
  /** What the buyer pays for the next one, before Haggler. */
  price: number;
  /** What it pays when the market isn't full of it. */
  base: number;
  trend: MarketTrend;
  /** The market's glut of it now (src/lib/market.ts), to price a bulk sale. */
  glut: number;
  /** How much this market takes before the price halves (more buyers, deeper). */
  depth: number;
};

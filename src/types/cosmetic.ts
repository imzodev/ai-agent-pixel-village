// Cosmetics + gem economy. Repos live in src/db/repos/, services in src/services/.

export const COSMETIC_SLOTS = ["hair", "hat", "glasses", "outfit", "back", "pet"] as const;
export type CosmeticSlot = (typeof COSMETIC_SLOTS)[number];

export const COSMETIC_RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;
export type CosmeticRarity = (typeof COSMETIC_RARITIES)[number];

export type CosmeticItem = {
  /** Stable key, matches LPC layer / asset filename. */
  key: string;
  /** Display name shown in shop UI. */
  name: string;
  /** Slot the item fills. Only one item per slot can be equipped. */
  slot: CosmeticSlot;
  /** Path under /public; e.g. `/cosmetics/hat_crown.png`. */
  assetRef: string;
  /** Hex color used for sponsor brand hats overlay. Null for non-recolor items. */
  tintColor: string | null;
  rarity: CosmeticRarity;
  /** Price in coins (free currency). 0 means not sold for coins. */
  coinPrice: number;
  /** Price in gems (premium). 0 means not sold for gems. */
  gemPrice: number;
  /** True if the item is granted automatically by a sponsor (not buyable). */
  sponsorGrantedOnly: boolean;
  /** Sponsor id when sponsorGrantedOnly is true; null otherwise. */
  sponsorId: number | null;
  /** Optional seasonal window (ISO date strings); null = always available. */
  availableFrom: string | null;
  availableUntil: string | null;
};

export type CosmeticOwnership = {
  userId: number;
  characterId: number;
  itemKey: string;
  acquiredAt: Date;
  source: "coin" | "gem" | "sponsor" | "starter" | "seasonal" | "admin";
};

export type CharacterEquipped = {
  characterId: number;
  slot: CosmeticSlot;
  itemKey: string;
};

export const GEM_PACKS = [
  { key: "gems_100", gems: 100, priceCents: 199 },
  { key: "gems_550", gems: 550, priceCents: 999 },
  { key: "gems_1200", gems: 1200, priceCents: 1999 },
  { key: "gems_3000", gems: 3000, priceCents: 4499 },
] as const;

export type GemPackKey = (typeof GEM_PACKS)[number]["key"];

export type GemPack = (typeof GEM_PACKS)[number];

export type GemTransaction = {
  id: number;
  characterId: number;
  delta: number;
  /** Positive = credit (purchase / grant), negative = debit (purchase). */
  source: "purchase" | "spend" | "sponsor_grant" | "seasonal_grant" | "admin";
  packKey: GemPackKey | null;
  stripeSessionId: string | null;
  createdAt: Date;
};

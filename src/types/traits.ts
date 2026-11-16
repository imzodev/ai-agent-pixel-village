// Who a character is (src/lib/traits.ts): an origin (where they come from)
// and a few traits (what they're like), picked when they start; more traits
// are earned by finishing stories. Types only.

import type { Qualities } from "./qualities";

export type OriginKey = "farmhand" | "woodsman" | "sellsword" | "merchant" | "wanderer" | "scholar";

export type TraitKey = "charming" | "lucky" | "angler" | "brave" | "animal_friend" | "hardy" | "patient" | "storyteller";

/** How a trait was got: picked at the start, or earned by finishing a story. */
export type TraitSource = "pick" | "story";

export type OriginDef = {
  key: OriginKey;
  name: string;
  icon: string;
  /** One line for the picker. */
  description: string;
  /** How NPCs know them ("grew up on a farm"). */
  past: string;
  /** What they bring with them (given once, the first time they choose). */
  kit: { coins?: number; items?: { itemKey: string; qty: number }[] };
};

export type TraitDef = { key: TraitKey; name: string; icon: string; description: string; /** How NPCs see it ("easy to like"). */ seen: string };

/** A character's origin and traits. */
export type CharacterTraits = {
  origin: OriginKey | null;
  /** Picked at the start (at most TRAIT_PICKS). */
  picked: TraitKey[];
  /** Earned from finished stories. */
  earned: TraitKey[];
};

/** A character's traits and whether they can still choose. */
export type TraitsState = CharacterTraits & {
  /** Can the origin and picks still be changed (first day), or chosen at all (never chosen yet)? */
  canChoose: boolean;
};

/** GET /api/traits: traits plus qualities (src/lib/qualities.ts). */
export type HeroState = TraitsState & { qualities: Qualities };

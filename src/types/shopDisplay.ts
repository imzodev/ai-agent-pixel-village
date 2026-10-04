// Displays of a shop's real stock out front (src/lib/shopDisplay.ts). Types only.

/** One kind of good on a display: where each piece hangs or sits. */
export type DisplaySlot = {
  itemKey: string;
  /** Stock units per piece shown (arrows: one bundle per 10). */
  per: number;
  /** Texture of one piece (src/game/shopDisplay.ts). */
  sprite: string;
  /** Top-left of each piece, in the building template's pixels. */
  at: [number, number][];
};

/** A display in front of a building, stocked by an NPC with a mind. */
export type ShopDisplayDef = { key: string; npcKey: string; buildingTx: number; buildingTy: number; slots: DisplaySlot[] };

/** What a display shows right now: pieces per item. */
export type ShopDisplaySnapshot = { key: string; counts: Record<string, number> };

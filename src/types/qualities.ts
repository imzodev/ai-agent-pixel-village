// Qualities (src/lib/qualities.ts): what a character has become through what
// they do, measured from the game's own records. Types only.

export type QualityKey = "courage" | "kindness" | "cunning" | "industry";

/** The raw tallies a quality is measured from. */
export type QualityTallies = {
  /** Foes beaten (all kinds, every time). */
  foes: number;
  bounties: number;
  /** Regard won with NPCs (positive scores summed). */
  regard: number;
  missions: number;
  /** Standing won with towns by trading (reputation points summed). */
  reputation: number;
  /** Shifts worked at jobs. */
  shifts: number;
  crops: number;
  fish: number;
};

export type QualityDef = { key: QualityKey; name: string; icon: string; /** What it's measured from, for the profile. */ from: string; /** Titles at 50 and 80. */ titles: [string, string]; /** How NPCs say it ("known for their courage"). */ known: string };

/** A character's qualities, each 0–100. */
export type Qualities = Record<QualityKey, number>;

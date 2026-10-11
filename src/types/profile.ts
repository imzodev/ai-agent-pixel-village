// A player's public profile (/u/[username], src/lib/profileServer.ts). Types only.

import type { CardLook, Moment } from "./moments";

/** A collection book page on the profile. */
export type ProfileBookPage = { name: string; icon: string; found: number; total: number; claimed: boolean };

/** A named thing from the book (a fish, a creature) with its icon and a note. */
export type ProfileBookThing = { name: string; icon: string; note: string };

/** The book's highlights: totals and the rarest or toughest finds. */
export type ProfileBookHighlights = {
  fishCaught: number;
  /** Rare and legendary fish caught, rarest first. */
  rareFish: ProfileBookThing[];
  creaturesBeaten: number;
  /** The toughest kinds they've beaten (bosses, then by danger tier). */
  toughest: ProfileBookThing[];
  towns: { visited: number; total: number };
  places: { visited: number; total: number };
  folk: { met: number; total: number };
  cropsHarvested: number;
  chestsDug: number;
  lostCache: boolean;
};

/** A trophy or legendary weapon on the profile shelf. */
export type ProfileTrophy = { itemKey: string; name: string; from: string; legendary: boolean };

export type Profile = {
  username: string;
  look: CardLook;
  memberSince: Date;
  lastSeen: Date;
  trophies: ProfileTrophy[];
  /** Share of the collection book found (0–100). */
  collectionPct: number;
  /** Every achievement in the collection book, earned or not. */
  achievements: { name: string; description: string; done: boolean }[];
  /** Every collection book page: how much of it they've found, and whether it's claimed. */
  bookPages: ProfileBookPage[];
  /** The best of the book, for bragging. */
  book: ProfileBookHighlights;
  /** Towns where they're known (best standing first). */
  reputation: { town: string; tier: string }[];
  /** Lots they own ("home", "ranch", …) and their farm's level, if any. */
  lots: string[];
  farmLevel: number | null;
  relicSets: string[];
  /** NPCs who call them a dear friend. */
  dearFriends: { key: string; name: string; role: string }[];
  moments: Moment[];
};

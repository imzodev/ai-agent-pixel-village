// The collection book, achievements and titles (src/lib/collection.ts).
// Types only.

export type CollectionKind = "fish" | "crop" | "enemy" | "region" | "npc" | "relic" | "treasure";

export type CollectionEntry = { key: string; name: string; icon: string; /** Where to look (hidden relics). */ hint?: string };

export type CollectionPageDef = {
  key: string;
  name: string;
  icon: string;
  kind: CollectionKind;
  entries: CollectionEntry[];
  reward: { coins: number; title: string; /** Also the first map of a treasure trail. */ treasureMap?: boolean };
  /** What to look for, and where. */
  blurb?: string;
};

/** What a player has collected: kind → key → count. */
export type CollectionCounts = Partial<Record<CollectionKind, Record<string, number>>>;

export type AchievementDef = {
  key: string;
  name: string;
  description: string;
  title: string;
};

/** The book as sent to the client. */
export type CollectionBookView = {
  pages: (Omit<CollectionPageDef, "entries"> & { entries: (CollectionEntry & { count: number })[]; claimed: boolean })[];
  achievements: (AchievementDef & { done: boolean })[];
  titles: string[];
  title: string | null;
};

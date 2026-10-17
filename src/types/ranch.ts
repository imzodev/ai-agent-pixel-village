// A homestead's animals (src/lib/ranch.ts): what you can raise and their produce. Types only.

import type { RanchGrowthView } from "./ranchGrowth";

export type RanchSpecies = "chicken" | "sheep" | "cow";

/** What a homestead can raise: price and what each makes (how many fit: pasture space, src/lib/homestead.ts). */
export type RanchSpeciesDef = {
  species: RanchSpecies;
  /** What you buy ("Chick"). */
  young: string;
  icon: string;
  price: number;
  /** Item key it produces. */
  produce: string;
};

/** One animal in the ranch panel. */
export type RanchAnimalView = {
  id: number;
  name: string;
  species: string;
  hunger: number;
  /** 0–100: how much it loves you; more means better goods. */
  affection: number;
  /** Can be petted for affection again (once a day). */
  pettable: boolean;
  /** Produce waiting to be collected. */
  ready: number;
  /** Ms until the next one (null when hungry or full). */
  nextInMs: number | null;
};

/** The homestead's animals-and-growth panel (RanchPanel). */
export type RanchView = {
  key: string;
  owner: { id: number; name: string } | null;
  mine: boolean;
  animals: RanchAnimalView[];
  /** What you can buy: how many you have, and how many fit (`cap`, by free pasture space). */
  shop: (RanchSpeciesDef & { owned: number; cap: number })[];
  /** Crops in your bag that animals eat. */
  feed: { itemKey: string; qty: number }[];
  coins: number;
  /** Farm level, buildings, machines (owner only). */
  growth: RanchGrowthView | null;
};

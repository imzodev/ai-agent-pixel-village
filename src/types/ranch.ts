// Ranch plots (src/lib/ranch.ts): owned animals and their produce. Types only.

import type { RanchGrowthView } from "./ranchGrowth";

export type RanchSpecies = "chicken" | "sheep" | "cow";

/** What a ranch can raise: price, how many fit, and what each makes. */
export type RanchSpeciesDef = {
  species: RanchSpecies;
  /** What you buy ("Chick"). */
  young: string;
  icon: string;
  price: number;
  /** Most of this species one ranch can hold. */
  cap: number;
  /** Item key it produces. */
  produce: string;
  /** Where it lives on the ranch (coop / barn). */
  home: "coop" | "barn";
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

/** The ranch panel's data. */
export type RanchView = {
  key: string;
  /** Ranches raise animals; vineyards only grow (their plants live in the plots). */
  kind: "ranch" | "vineyard" | "workshop" | "orchard";
  name: string;
  owner: { id: number; name: string } | null;
  mine: boolean;
  animals: RanchAnimalView[];
  shop: (RanchSpeciesDef & { owned: number })[];
  /** Crops in your bag that animals eat. */
  feed: { itemKey: string; qty: number }[];
  coins: number;
  /** Farm level, buildings, workshop (owner only). */
  growth: RanchGrowthView | null;
};

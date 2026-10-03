// Ranch plots (src/lib/ranch.ts): owned animals and their produce. Types only.

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
  /** Produce waiting to be collected. */
  ready: number;
  /** Ms until the next one (null when hungry or full). */
  nextInMs: number | null;
};

/** The ranch panel's data. */
export type RanchView = {
  key: string;
  name: string;
  owner: { id: number; name: string } | null;
  mine: boolean;
  animals: RanchAnimalView[];
  shop: (RanchSpeciesDef & { owned: number })[];
  /** Crops in your bag that animals eat. */
  feed: { itemKey: string; qty: number }[];
  coins: number;
};

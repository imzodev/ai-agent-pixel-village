// A homestead's animals: buy chicks, lambs and calves for your pastures,
// feed them crops from your fields, and collect eggs, wool and milk. A fed
// animal (hunger below HUNGRY_AT) makes one item every PRODUCE_MS, holding
// up to MAX_STORED; production is computed lazily from `last_produced_at`
// when you collect, so the tick does no extra work. Pure rules here; the
// route is src/app/api/ranch/route.ts.

import { GARDEN_CROPS } from "./crops";
import type { RanchSpecies, RanchSpeciesDef } from "@/types/ranch";

export type { RanchAnimalView, RanchSpecies, RanchSpeciesDef, RanchView } from "@/types/ranch";

export const RANCH_SPECIES: Readonly<Record<RanchSpecies, RanchSpeciesDef>> = {
  chicken: { species: "chicken", young: "Chick", icon: "🐔", price: 20, produce: "egg" },
  sheep: { species: "sheep", young: "Lamb", icon: "🐑", price: 60, produce: "wool" },
  cow: { species: "cow", young: "Calf", icon: "🐄", price: 120, produce: "milk" },
};
export const isRanchSpecies = (s: string): s is RanchSpecies => s in RANCH_SPECIES;

export const PRODUCE_MS = 20 * 60_000;
export const MAX_STORED = 3;
/** At this hunger an animal stops producing until fed. */
export const HUNGRY_AT = 70;
/** Animals this full don't need feeding. */
export const FED_BELOW = 25;
/** Crops animals eat: wheat and everything the fields grow. */
export const FEED_ITEMS: readonly string[] = ["wheat", ...Object.values(GARDEN_CROPS).map((c) => c.produceKey)];

/** Produce ready on an animal last collected at `last`. */
export function readyCount(last: number, hunger: number, now: number): number {
  if (hunger >= HUNGRY_AT) return 0;
  return Math.max(0, Math.min(MAX_STORED, Math.floor((now - last) / PRODUCE_MS)));
}

/** Ms until the next item, or null when hungry or already full. */
export function nextIn(last: number, hunger: number, now: number): number | null {
  if (hunger >= HUNGRY_AT || readyCount(last, hunger, now) >= MAX_STORED) return null;
  return PRODUCE_MS - ((now - last) % PRODUCE_MS);
}

/** The new `last` after collecting `n`: keep partial progress, unless it was full. */
export function afterCollect(last: number, n: number, now: number): number {
  return n >= MAX_STORED ? now : last + n * PRODUCE_MS;
}

/** The new `last` after feeding: a hungry animal starts over (nothing made while starving). */
export function afterFeed(last: number, hunger: number, now: number): number {
  return hunger >= HUNGRY_AT ? now : last;
}

const NAMES: Readonly<Record<RanchSpecies, readonly string[]>> = {
  chicken: ["Pecky", "Nugget", "Henrietta", "Clucky", "Biscuit", "Dottie", "Pip", "Saffron"],
  sheep: ["Woolly", "Cloud", "Bramble", "Fleece", "Maple"],
  cow: ["Buttercup", "Daisy", "Moomoo", "Hazel"],
};

/** A name not already used on this homestead. */
export function nextName(species: RanchSpecies, taken: readonly string[]): string {
  const free = NAMES[species].filter((n) => !taken.includes(n));
  return free[0] ?? `${RANCH_SPECIES[species].young} ${taken.length + 1}`;
}

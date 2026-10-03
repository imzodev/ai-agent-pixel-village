// Ranch plots: the pens south of the fields. Buy chicks, lambs and calves,
// feed them crops from your field, and collect eggs, wool and milk. A fed
// animal (hunger below HUNGRY_AT) makes one item every PRODUCE_MS, holding
// up to MAX_STORED; production is computed lazily from `last_produced_at`
// when you collect, so the tick does no extra work. Pure rules here; the
// route is src/app/api/ranch/route.ts.

import { GARDEN_CROPS } from "./crops";
import type { RanchSpecies, RanchSpeciesDef } from "@/types/ranch";

export type { RanchAnimalView, RanchSpecies, RanchSpeciesDef, RanchView } from "@/types/ranch";

export const RANCH_SPECIES: Readonly<Record<RanchSpecies, RanchSpeciesDef>> = {
  chicken: { species: "chicken", young: "Chick", icon: "🐔", price: 20, cap: 6, produce: "egg", home: "coop" },
  sheep: { species: "sheep", young: "Lamb", icon: "🐑", price: 60, cap: 3, produce: "wool", home: "barn" },
  cow: { species: "cow", young: "Calf", icon: "🐄", price: 120, cap: 2, produce: "milk", home: "barn" },
};
export const isRanchSpecies = (s: string): s is RanchSpecies => s in RANCH_SPECIES;

export const PRODUCE_MS = 20 * 60_000;
export const MAX_STORED = 3;
/** At this hunger an animal stops producing until fed. */
export const HUNGRY_AT = 70;
/** Animals this full don't need feeding. */
export const FED_BELOW = 25;
/** How far from the ranch gate you can tend it (the pen is big). */
export const RANCH_REACH_PX = 320;

/** Crops animals eat: wheat and everything the fields grow. */
export const FEED_ITEMS: readonly string[] = ["wheat", ...Object.values(GARDEN_CROPS).map((c) => c.produceKey)];

/** The pen inside a ranch template (tiles): where its animals roam. */
export const RANCH_PEN = { c: 7, r: 5, w: 8, h: 7 } as const;

/** The pen of a ranch stamped at (tx, ty), in world pixels. */
export function penRect(tx: number, ty: number): { x: number; y: number; w: number; h: number } {
  return { x: (tx + RANCH_PEN.c) * 16, y: (ty + RANCH_PEN.r) * 16, w: RANCH_PEN.w * 16, h: RANCH_PEN.h * 16 };
}

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

/** A name not already used on this ranch. */
export function nextName(species: RanchSpecies, taken: readonly string[]): string {
  const free = NAMES[species].filter((n) => !taken.includes(n));
  return free[0] ?? `${RANCH_SPECIES[species].young} ${taken.length + 1}`;
}

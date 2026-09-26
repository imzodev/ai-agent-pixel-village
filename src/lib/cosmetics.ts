// src/lib/cosmetics.ts
// Canonical cosmetic catalog — single source of truth shared by the seed
// upsert (server) and the LPC compositor (client). The actual PNGs live in
// public/lpc/, downloaded by scripts/fetch-lpc.mjs from the Universal-LPC
// generator mirrors. Slots currently populated: "hat", "glasses", "outfit".

import type { CosmeticItem } from "@/types/cosmetic";

/** Catalog consumed by seed (server) and the LPC compositor (client). */
export const COSMETIC_CATALOG: CosmeticItem[] = [
  {
    key: "hat_straw",
    name: "Straw Hat",
    slot: "hat",
    assetRef: "/lpc/hat_straw.png",
    tintColor: "#d9b676",
    rarity: "common",
    coinPrice: 200,
    gemPrice: 0,
    sponsorGrantedOnly: false,
    sponsorId: null,
    availableFrom: null,
    availableUntil: null,
  },
  {
    key: "hat_crown",
    name: "Forest Crown",
    slot: "hat",
    assetRef: "/lpc/hat_crown.png",
    tintColor: "#ffd166",
    rarity: "rare",
    coinPrice: 0,
    gemPrice: 250,
    sponsorGrantedOnly: false,
    sponsorId: null,
    availableFrom: null,
    availableUntil: null,
  },
  {
    key: "hat_party",
    name: "Party Cone",
    slot: "hat",
    assetRef: "/lpc/hat_party.png",
    tintColor: "#ff5e8a",
    rarity: "uncommon",
    coinPrice: 350,
    gemPrice: 50,
    sponsorGrantedOnly: false,
    sponsorId: null,
    availableFrom: null,
    availableUntil: null,
  },
  {
    key: "glasses_round",
    name: "Round Specs",
    slot: "glasses",
    assetRef: "/lpc/glasses_round.png",
    tintColor: null,
    rarity: "common",
    coinPrice: 300,
    gemPrice: 30,
    sponsorGrantedOnly: false,
    sponsorId: null,
    availableFrom: null,
    availableUntil: null,
  },
  {
    key: "outfit_apron",
    name: "Baker's Apron",
    slot: "outfit",
    assetRef: "/lpc/outfit_apron.png",
    tintColor: "#e76f51",
    rarity: "uncommon",
    coinPrice: 600,
    gemPrice: 80,
    sponsorGrantedOnly: false,
    sponsorId: null,
    availableFrom: null,
    availableUntil: null,
  },
];

/** Look up a cosmetic by its key. */
export function cosmoByKey(key: string): CosmeticItem | undefined {
  return COSMETIC_CATALOG.find((c) => c.key === key);
}

/** All equipped slot→itemKey entries for a character. */
export type EquippedSet = Map<import("@/types/cosmetic").CosmeticSlot, string>;

/** Build an EquippedSet from a flat list of {slot,itemKey}. */
export function equippedSetFromList(
  list: Array<{ slot: import("@/types/cosmetic").CosmeticSlot; itemKey: string }>,
): EquippedSet {
  const map: EquippedSet = new Map();
  for (const e of list) map.set(e.slot, e.itemKey);
  return map;
}

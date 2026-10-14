// What anyone may pick at the Village Ranch: the garden's radishes, carrots,
// onions, cabbages, red bell peppers, tomatoes, wheat and pumpkins, and honey
// from the beehives. Like wild forage (src/lib/forage.ts) every crop is
// personal: each player picks it on their own cooldown (it vanishes for them
// until then), so a crowd can't strip the garden bare. The crops are planted
// in rows along the layout's beds (src/lib/villageRanch.ts ranchPickSpots,
// src/lib/seed.ts).

import type { RanchPick } from "@/types/villageRanch";

const MIN = 60_000;

export const RANCH_PICKS: Readonly<Record<string, RanchPick>> = {
  ranch_radish: { item: "radish", cooldownMs: 10 * MIN, label: "Radishes" },
  ranch_carrot: { item: "carrot", cooldownMs: 10 * MIN, label: "Carrots" },
  ranch_onion: { item: "onion", cooldownMs: 10 * MIN, label: "Onions" },
  ranch_wheat: { item: "wheat", cooldownMs: 10 * MIN, label: "Wheat" },
  ranch_cabbage: { item: "cabbage", cooldownMs: 15 * MIN, label: "Cabbages" },
  ranch_pepper: { item: "bell_pepper", cooldownMs: 15 * MIN, label: "Red bell peppers" },
  ranch_tomato: { item: "tomato", cooldownMs: 15 * MIN, label: "Tomatoes" },
  ranch_pumpkin: { item: "pumpkin", cooldownMs: 30 * MIN, label: "Pumpkins" },
  ranch_beehive: { item: "honey", cooldownMs: 30 * MIN, label: "Beehive" },
};

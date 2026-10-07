// Town bounty boards: every continent town keeps a few bounties posted on
// its notice board — hunts, gathering, deliveries to another town,
// exploring a far spot, and wanted beasts (a named elite at a marked
// spot). Take up to MAX_ACTIVE, do them out in the world, and turn them in
// at the town that posted them for coins, XP and reputation. Pure rules
// here; the store and the world side are src/lib/bountiesServer.ts.

import { enemyKind } from "./progression";
import { TOWNS } from "./settlements";
import type { BountyData, BountyKind, BountyReward } from "@/types/bounty";
import type { TownFamily } from "@/types/settlement";

export type { BountyData, BountyKind, BountyReward, BountyView } from "@/types/bounty";

export const OPEN_PER_TOWN = 5;
export const BOUNTY_TTL_MS = 6 * 3_600_000;
export const MAX_ACTIVE = 3;
/** How close to a board (or a spot) counts as being there, px. */
export const BOARD_REACH_PX = 100;
export const SPOT_REACH_PX = 56;
/** Wanted beasts: how much tougher than their kind. */
export const WANTED_HP_MULT = 4;
export const WANTED_DMG_MULT = 1.5;
export const WANTED_XP_MULT = 4;

/** Where a town's notice board stands (world px, in front of it). */
export function boardPoint(town: string): { x: number; y: number } | null {
  const t = TOWNS.find((x) => x.key === town);
  return t ? { x: (t.sq.tx - 3) * 16, y: (t.sq.ty + 12) * 16 + 8 } : null;
}

export function targetOf(d: BountyData): number {
  return d.kind === "hunt" || d.kind === "gather" ? d.qty : 1;
}

const townName = (k: string) => TOWNS.find((t) => t.key === k)?.name ?? k;
const plural = (name: string) => (name.endsWith("f") ? `${name.slice(0, -1)}ves` : `${name}s`);
const itemName = (k: string) => k.replace(/_/g, " ");

export function titleOf(d: BountyData): string {
  switch (d.kind) {
    case "hunt": return `Cull ${d.qty} ${plural(enemyKind(d.enemyKind).name)}`;
    case "gather": return `Bring ${d.qty} ${itemName(d.itemKey)}`;
    case "delivery": return `Parcel for ${townName(d.toTown)}`;
    case "explore": return `Scout ${d.place}`;
    case "wanted": return `WANTED: ${d.name}`;
  }
}
export function describe(d: BountyData): string {
  switch (d.kind) {
    case "hunt": return `They've been bothering travellers. Take down ${d.qty} anywhere in the wilds.`;
    case "gather": return `The town's running short. Bring ${d.qty} ${itemName(d.itemKey)} back to this board.`;
    case "delivery": return `Carry a sealed parcel to the bounty board in ${townName(d.toTown)}, then come back for your pay.`;
    case "explore": return `Someone reported something odd out there. Go see for yourself — it's marked on your map.`;
    case "wanted": return `A ${enemyKind(d.enemyKind).name.toLowerCase()} the size of a cart. It's marked on your map. Bring friends.`;
  }
}

const BASE: Record<BountyKind, BountyReward> = {
  hunt: { coins: 10, xp: 8, rep: 12 },
  gather: { coins: 8, xp: 4, rep: 10 },
  delivery: { coins: 45, xp: 30, rep: 16 },
  explore: { coins: 35, xp: 30, rep: 12 },
  wanted: { coins: 140, xp: 120, rep: 35 },
};
/** Pay for a bounty (hunts and gathering scale with quantity). */
export function rewardFor(d: BountyData): BountyReward {
  const b = BASE[d.kind];
  if (d.kind === "hunt") return { coins: b.coins * d.qty, xp: Math.max(b.xp, Math.round(enemyKind(d.enemyKind).xp * d.qty * 0.6)), rep: b.rep };
  if (d.kind === "gather") return { coins: b.coins * d.qty, xp: b.xp * d.qty, rep: b.rep };
  return { ...b };
}

/** What each kind of town needs brought in. */
export const GATHER: Readonly<Record<TownFamily, readonly string[]>> = {
  port: ["silver_minnow", "river_trout", "pond_perch", "wood"],
  desert: ["chitin", "stone", "wood"],
  snow: ["frost_pelt", "wood", "stone"],
  swamp: ["lurker_hide", "herb", "wood"],
  darkwood: ["shade_essence", "mushroom", "wood"],
  hills: ["wheat", "wool", "egg", "wood"],
};

/** How often each kind is posted (wanted is capped at one per board). */
export const KIND_WEIGHT: Readonly<Record<BountyKind, number>> = { hunt: 4, gather: 3, delivery: 2, explore: 2, wanted: 1 };
export function pickKind(rand: () => number, wantedOpen: boolean): BountyKind {
  const opts = (Object.entries(KIND_WEIGHT) as [BountyKind, number][]).filter(([k]) => k !== "wanted" || !wantedOpen);
  let r = rand() * opts.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of opts) { r -= w; if (r < 0) return k; }
  return opts[0][0];
}

const WANTED_A = ["Old", "Red", "Grim", "One-Eyed", "Scarred", "Big", "Mad", "Black"];
/** Names that suit each kind of beast. */
const WANTED_B: Readonly<Record<string, readonly string[]>> = {
  wolf: ["Ironjaw", "Ashfang", "Greymane"], frostwolf: ["Frostbite", "Icefang", "Whitefang"],
  boar: ["Bonecrusher", "Tuskgrim", "Mudsnout"], scorpion: ["Sandclaw", "Stingtail", "Dunebiter"],
  lurker: ["Mudmaw", "Bogmouth", "Fenbelly"], shade: ["Gloomhide", "Hollowsoul", "Duskwhisper"],
  thornling: ["Thornback", "Brambleheart", "Briarjaw"],
  dune_stalker: ["Sandfang", "Duneskulk", "Sunscale"], bog_hag: ["Mother Mire", "Grandmother Rot", "the Fen Crone"],
  ice_troll: ["Glacierfist", "Rimebelly", "Snowcrusher"], gloam_stag: ["Nightcrown", "Duskantler", "Gloomhart"],
  basalt_golem: ["Cinderheart", "Slagback", "Magmafist"], wyvern: ["Emberwing", "Ashtalon", "Scorchscale"],
  rime_wraith: ["Hollowfrost", "the Pale Widow", "Wintersigh"], elder_treant: ["Oldroot", "Mossbeard", "Grandfather Oak"],
};
export function wantedName(rand: () => number, kind = "wolf"): string {
  const b = WANTED_B[kind] ?? WANTED_B.wolf;
  return `${WANTED_A[Math.floor(rand() * WANTED_A.length)]} ${b[Math.floor(rand() * b.length)]}`;
}

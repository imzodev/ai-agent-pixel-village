// What a story may name: the people, places, foes and things a hero of this
// level can actually reach. The AI is shown this list and its story is
// checked against it (parse.ts), so a story never sends anyone after a
// person, place or creature that isn't in the world. Pure.

import { NPC_DEFS, placeOfNpc } from "@/lib/npcDefs";
import { ENEMY_KINDS } from "@/lib/progression";
import { REGIONS } from "@/lib/regions";
import { TOWNS, TOWN_REGIONS, SETTLEMENT_NPCS } from "@/lib/settlements";
import { itemDef } from "@/lib/itemDefs";
import type { StoryCatalog } from "@/types/story";

/** Level bands: what's reachable grows with the hero. */
export const storyBand = (level: number): 1 | 2 | 3 => (level < 8 ? 1 : level < 16 ? 2 : 3);

/** Foes by the band that first allows them (wild ones only; bosses never). */
const FOES_BY_BAND: Record<1 | 2 | 3, string[]> = {
  1: ["slime", "bat", "thornling", "boar", "wolf"],
  2: ["scorpion", "lurker", "frostwolf", "shade", "wisp"],
  3: ["dune_stalker", "bog_hag", "ice_troll", "gloam_stag"],
};
/** Regions of the heartland by band (towns come with band 2). */
const REGIONS_BY_BAND: Record<1 | 2 | 3, string[]> = {
  1: ["meadow", "whisperwood", "hollowmere", "village_ranch"],
  2: ["greyspine", "silverrun", "brightwater"],
  3: ["caverns"],
};
/** Things anyone can gather, farm or fish near the village. */
const GATHERED = ["wood", "stone", "berry", "mushroom", "herb", "wheat", "egg", "wool"];
/** Made goods worth handing over (bought or made, never just found). */
const MADE = ["bread", "flour"];
/** How many continent towns (nearest the village first) each band reaches. */
const TOWNS_BY_BAND: Record<1 | 2 | 3, number> = { 1: 0, 2: 4, 3: 10 };

const upTo = <T,>(by: Record<1 | 2 | 3, T[]>, band: 1 | 2 | 3): T[] => [1, 2, 3].filter((b) => b <= band).flatMap((b) => by[b as 1 | 2 | 3]);
const named = (keys: string[]) => keys.flatMap((key) => { const d = itemDef(key); return d ? [{ key, name: d.name }] : []; });

/** Continent towns nearest the village first (the village square is near tile 40, 10). */
const TOWNS_NEAR = [...TOWNS].sort((a, b) => Math.hypot(a.sq.tx - 40, a.sq.ty - 10) - Math.hypot(b.sq.tx - 40, b.sq.ty - 10));

/** Everything a story for a hero of this level may name. */
export function storyCatalog(level: number): StoryCatalog {
  const band = storyBand(level);
  const towns = new Set(TOWNS_NEAR.slice(0, TOWNS_BY_BAND[band]).map((t) => t.key));
  const townsfolk = new Set(SETTLEMENT_NPCS.map((n) => n.key));
  // Brightwater is past the Greyspine pass: band 2 on, like its region.
  const inReach = (key: string) => (townsfolk.has(key) ? towns.has(SETTLEMENT_NPCS.find((n) => n.key === key)!.town) : band >= 2 || !key.startsWith("brightwater_"));
  const foes = upTo(FOES_BY_BAND, band).filter((k) => k in ENEMY_KINDS);
  const drops = [...new Set(foes.flatMap((k) => ENEMY_KINDS[k].drops.map((d) => d.itemKey)))];
  const collect = named([...GATHERED, ...drops]);
  return {
    npcs: NPC_DEFS.filter((n) => inReach(n.key)).map((n) => ({ key: n.key, name: n.name, role: n.role, place: placeOfNpc(n.key) })),
    regions: [
      ...upTo(REGIONS_BY_BAND, band).flatMap((k) => REGIONS.filter((r) => r.key === k).map((r) => ({ key: r.key, name: r.name }))),
      ...TOWN_REGIONS.filter((r) => towns.has(r.key.replace(/^town_/, ""))).map((r) => ({ key: r.key, name: r.name })),
    ],
    foes: foes.map((k) => ({ key: k, name: ENEMY_KINDS[k].name })),
    collect,
    deliver: [...collect, ...named(MADE)],
  };
}

/** The catalog as lines for the AI's prompt. */
export function catalogText(c: StoryCatalog): string {
  return [
    "PEOPLE (who):",
    ...c.npcs.map((n) => `- ${n.key}: ${n.name}, ${n.role}${n.place ? ` (${n.place})` : ""}`),
    "PLACES (place):",
    ...c.regions.map((r) => `- ${r.key}: ${r.name}`),
    "CREATURES (foe):",
    ...c.foes.map((f) => `- ${f.key}: ${f.name}`),
    "THINGS TO GATHER, FARM OR LOOT (item, for collect):",
    ...c.collect.map((i) => `- ${i.key}: ${i.name}`),
    "THINGS TO HAND OVER (item, for deliver):",
    ...c.deliver.map((i) => `- ${i.key}: ${i.name}`),
  ].join("\n");
}

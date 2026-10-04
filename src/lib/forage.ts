// Wild foraging in a shared world: herb patches, berry bushes, mushroom
// rings and rocks are never used up for everyone. Each player gets their
// own pick from every patch, which comes back *for them* after a cooldown —
// so nobody can strip an area bare for the others. Patches are scattered
// over the continent by biome (forageSpots), plus the hand-placed ones
// near the village (src/lib/seed.ts). Pure rules; picks are recorded in
// forage_claims (src/app/api/act/route.ts).

import { CONTINENT, biomeAt, continentAt, inHeartland } from "./continent";
import { townAt } from "./settlements";
import { hash } from "./terrain/noise";
import type { Biome } from "@/types/continent";
import type { ForageBiome } from "@/types/forage";

/** How long a patch takes to come back for the player who picked it. */
export const FORAGE_COOLDOWN_MS: Readonly<Record<string, number>> = {
  herb_patch: 10 * 60_000,
  mushroom_ring: 10 * 60_000,
  berry_bush: 15 * 60_000,
  rock: 15 * 60_000,
};
export const isForage = (kind: string): boolean => kind in FORAGE_COOLDOWN_MS;
/** A patch's stable identity (node ids change when the wilds are reseeded). */
export const forageKey = (kind: string, x: number, y: number): string => `${kind}@${Math.round(x)},${Math.round(y)}`;
/** Ms until a patch is ready again for a player who last picked it at `last`. */
export function readyIn(kind: string, last: number | null, now: number): number {
  if (last == null) return 0;
  return Math.max(0, last + (FORAGE_COOLDOWN_MS[kind] ?? 0) - now);
}

const ITEM: Readonly<Record<string, string>> = { herb_patch: "herb", mushroom_ring: "mushroom", berry_bush: "berry", rock: "stone" };
/** What grows where, and how often a 26×20 cell has a patch. */
const BIOME_FORAGE: Readonly<Record<Biome, ForageBiome>> = {
  ocean: { chance: 0, kinds: {} },
  beach: { chance: 0.25, kinds: { rock: 2, berry_bush: 1 } },
  meadow: { chance: 0.5, kinds: { berry_bush: 3, herb_patch: 2, rock: 1 } },
  forest: { chance: 0.55, kinds: { herb_patch: 3, berry_bush: 2, mushroom_ring: 2 } },
  darkwood: { chance: 0.55, kinds: { mushroom_ring: 4, herb_patch: 2 } },
  swamp: { chance: 0.6, kinds: { herb_patch: 4, mushroom_ring: 2 } },
  desert: { chance: 0.3, kinds: { rock: 3 } },
  badlands: { chance: 0.35, kinds: { rock: 4 } },
  snow: { chance: 0.3, kinds: { rock: 2, herb_patch: 1 } },
  peak: { chance: 0, kinds: {} },
  snowpeak: { chance: 0, kinds: {} },
  mesa: { chance: 0, kinds: {} },
};

/** Open ground for a patch: no water, trees, props, cliffs or road. */
export function openGround(tx: number, ty: number): boolean {
  const c = continentAt(tx, ty);
  return !c.lower && !c.canopy && !c.collide && !c.prop && !c.ground.startsWith("water_") && !c.ground.startsWith("swamp_") && !c.ground.startsWith("deep_") && !(c.upper ?? "").startsWith("path_");
}

/** Forage patches across the continent's wilds: [kind, itemKey, tx, ty]. */
export function forageSpots(): [string, string, number, number][] {
  const out: [string, string, number, number][] = [];
  const CW = 26, CH = 20;
  for (let cy = CONTINENT.ty0; cy + CH <= CONTINENT.ty1; cy += CH) for (let cx = CONTINENT.tx0; cx + CW <= CONTINENT.tx1; cx += CW) {
    const mx = cx + CW / 2, my = cy + CH / 2;
    if (inHeartland(mx, my) || townAt(mx, my)) continue;
    const b = BIOME_FORAGE[biomeAt(mx, my)];
    if (!b.chance || hash(cx, cy, 701) > b.chance) continue;
    const kinds = Object.entries(b.kinds);
    let r = hash(cy, cx, 702) * kinds.reduce((s, [, w]) => s + w, 0);
    let kind = kinds[0][0];
    for (const [k, w] of kinds) { r -= w; if (r < 0) { kind = k; break; } }
    for (let k = 0; k < 8; k++) {
      const tx = cx + 2 + Math.floor(hash(cx, cy, 703 + k) * (CW - 4)), ty = cy + 2 + Math.floor(hash(cy, cx, 713 + k) * (CH - 4));
      if (inHeartland(tx, ty) || townAt(tx, ty)) continue;
      if (!openGround(tx, ty) || !openGround(tx + 1, ty) || !openGround(tx - 1, ty) || !openGround(tx, ty + 1)) continue;
      out.push([kind, ITEM[kind], tx, ty]);
      break;
    }
  }
  return out;
}

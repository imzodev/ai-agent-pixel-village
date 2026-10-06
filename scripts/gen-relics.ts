// Place the hidden relics (src/lib/relics.ts) across the continent.
// Deterministic: same continent, same spots.
//
//   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/gen-relics.ts
//
// Writes src/lib/relicsData.json. Old coins lie a step off the roads,
// fossils in the dry lands, wayfarer cards in each town (and a few at far
// wild edges), rune carvings in snow, darkwood and swamp. Each set is spread
// far apart, and every spot is open, walkable ground.

import fs from "node:fs";
import path from "node:path";
import { CONTINENT, biomeAt, inHeartland, tierAt } from "../src/lib/continent";
import { ROADS, TOWNS, townAt } from "../src/lib/settlements";
import { openGround } from "../src/lib/forage";
import { isWalkableServer } from "../src/lib/chunkCollisionServer";
import { RELIC_SETS, relicKey } from "../src/lib/relics";
import { hash } from "../src/lib/terrain/noise";
import type { Biome } from "../src/types/continent";
import type { RelicSetKey, RelicsData } from "../src/types/treasure";

type Spot = { tx: number; ty: number };

const wild = (tx: number, ty: number) => !inHeartland(tx, ty) && !townAt(tx, ty);
const roomy = (tx: number, ty: number) => openGround(tx, ty) && openGround(tx + 1, ty) && openGround(tx - 1, ty) && openGround(tx, ty + 1) && openGround(tx, ty - 1);
const walkable = (s: Spot) => isWalkableServer(s.tx * 16 + 8, s.ty * 16 + 8);

/** Wild candidates on a coarse lattice whose biome is one of `biomes`. */
function scan(biomes: readonly Biome[], minTier = 1, salt = 0): Spot[] {
  const out: Spot[] = [];
  for (let ty = CONTINENT.ty0 + 8; ty < CONTINENT.ty1 - 8; ty += 9) for (let tx = CONTINENT.tx0 + 8; tx < CONTINENT.tx1 - 8; tx += 11) {
    const s = { tx: tx + Math.floor(hash(tx, ty, 900 + salt) * 6), ty: ty + Math.floor(hash(ty, tx, 910 + salt) * 5) };
    if (!wild(s.tx, s.ty) || !biomes.includes(biomeAt(s.tx, s.ty)) || tierAt(s.tx, s.ty) < minTier || !roomy(s.tx, s.ty)) continue;
    out.push(s);
  }
  return out;
}

/** Off-road spots: two or three tiles beside a road. */
function besideRoads(): Spot[] {
  const out: Spot[] = [];
  for (const road of ROADS) for (let i = 0; i < road.length; i += 7) {
    const [x, y] = road[i];
    for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) {
      const s = { tx: x + dx, ty: y + dy };
      if (wild(s.tx, s.ty) && roomy(s.tx, s.ty)) { out.push(s); break; }
    }
  }
  return out;
}

/** Open ground inside each town box, off the square. */
function inTowns(): Spot[] {
  const out: Spot[] = [];
  for (const t of TOWNS) {
    const b = t.box;
    for (let k = 0; k < 400; k++) {
      const s = { tx: b.tx0 + 2 + Math.floor(hash(k, b.tx0, 920) * (b.tx1 - b.tx0 - 4)), ty: b.ty0 + 2 + Math.floor(hash(b.ty0, k, 921) * (b.ty1 - b.ty0 - 4)) };
      const onSquare = s.tx >= t.sq.tx - 2 && s.tx <= t.sq.tx + 26 && s.ty >= t.sq.ty - 2 && s.ty <= t.sq.ty + 16;
      if (!onSquare) { out.push(s); }
    }
  }
  return out;
}

/** Pick `n` walkable spots from `cands`, each as far as can be from those already picked. */
async function spread(cands: Spot[], n: number, seed: Spot[] = []): Promise<Spot[]> {
  // Walkability loads the spot's chunk, so it's checked only for the spots
  // actually picked (a spot that fails is dropped and the next best tried),
  // not for every candidate on the continent.
  const ok = [...cands];
  const picked = [...seed];
  const out: Spot[] = [];
  while (out.length < n && ok.length) {
    let best = 0, bestD = -1;
    for (let i = 0; i < ok.length; i++) {
      const d = picked.length ? Math.min(...picked.map((p) => Math.hypot(p.tx - ok[i].tx, p.ty - ok[i].ty))) : hash(ok[i].tx, ok[i].ty, 930);
      if (d > bestD) { bestD = d; best = i; }
    }
    const [s] = ok.splice(best, 1);
    if (!(await walkable(s))) continue;
    picked.push(s);
    out.push(s);
  }
  return out;
}

/** One walkable spot per town (cards). */
async function onePerTown(): Promise<Spot[]> {
  const all = inTowns();
  const out: Spot[] = [];
  for (const t of TOWNS) {
    for (const s of all) {
      if (townAt(s.tx, s.ty)?.key !== t.key) continue;
      if (await walkable(s) && await walkable({ tx: s.tx + 1, ty: s.ty }) && await walkable({ tx: s.tx, ty: s.ty + 1 })) { out.push(s); break; }
    }
  }
  return out;
}

async function main() {
  const where: Record<RelicSetKey, Spot[]> = {
    coins: await spread(besideRoads(), 10),
    fossils: await spread(scan(["desert", "badlands", "beach"], 1, 1), 10),
    cards: [],
    carvings: await spread(scan(["snow", "darkwood", "swamp"], 2, 3), 10),
  };
  const towns = await onePerTown();
  where.cards = [...towns, ...(await spread(scan(["meadow", "forest", "snow", "desert", "swamp", "darkwood", "badlands", "beach"], 3, 2), 10 - towns.length, towns))];

  const data: RelicsData = { relics: [] };
  for (const set of RELIC_SETS) {
    const spots = where[set.key];
    if (spots.length < set.names.length) console.warn(`${set.key}: only ${spots.length} spots`);
    spots.forEach((s, n) => data.relics.push({ key: relicKey(set.key, n), tx: s.tx, ty: s.ty }));
  }
  fs.writeFileSync(path.join(process.cwd(), "src/lib/relicsData.json"), JSON.stringify(data, null, 1) + "\n");
  for (const set of RELIC_SETS) console.log(set.key, where[set.key].map((s) => `(${s.tx},${s.ty})`).join(" "));
  process.exit(0);
}

void main();

// The open continent: a 158 × 160-chunk world (3,800 × 2,400 tiles) around the
// hand-made heartland (src/lib/regions.ts: the King's Road, its towns, the
// village, fields and ranches). Every tile outside the heartland is
// generated here from seeded noise — elevation (a ragged coast, islands, a
// north–south Greyspine ridge), temperature (colder north, warmer south,
// colder up high) and moisture — into biomes: meadow, forest, darkwood,
// swamp, desert, badlands, snow, beaches, ocean and mountain terraces.
// Pure and deterministic: every process builds the same world.

import { fbm, hash, noise } from "./terrain/noise";
import { memoXY } from "./terrain/memo";
import { LAIR_CLEARING, LAIR_SPOTS } from "./lairs";
import { isFelled } from "./terrain/felled";
import { ROADS, TOWNS, nearRoad, roadTile, roadV, townAt, townDecorAt, townPathV } from "./settlements";
import type { Biome, GroundKind, ProvinceSeed } from "@/types/continent";
import type { Region, TerrainCell, TileBox } from "@/types/regions";

export type { Biome, GroundKind } from "@/types/continent";

import { CONTINENT } from "./continentBox";
export { CONTINENT };
/** Feature size: the noise wavelengths grew with the world (×2 for a 10×
 *  larger area), so lands, seas and biomes are proportionally bigger. */
const WAVE = 2;
/** The hand-made heartland (src/lib/regions.ts): the King's Road with its
 *  towns, and the village with its fields and ranches. Edges sit on the
 *  tree lattice's parity (odd west/north, even east/south), so no tree is
 *  split between the two generators. */
/** The homesteads (src/lib/lotDistricts.ts): open land south of Hollowmere
 *  and of the village farms, for rows of lots opened as players fill them. */
export const HOMESTEADS: readonly TileBox[] = [
  { tx0: -449, tx1: -126, ty0: 37, ty1: 92 },
  { tx0: -449, tx1: 150, ty0: 93, ty1: 296 },
];
export const HEARTLAND: readonly TileBox[] = [
  { tx0: -809, tx1: 150, ty0: -21, ty1: 36 },
  { tx0: -125, tx1: 150, ty0: -31, ty1: 92 },
  ...HOMESTEADS,
];
export const inHomesteads = (tx: number, ty: number): boolean =>
  HOMESTEADS.some((b) => tx >= b.tx0 && tx <= b.tx1 && ty >= b.ty0 && ty <= b.ty1);
/** Near the heartland the land eases into plain forest and meadow. */
const SEAM = 16;
const SEA = 0.3;
const MOUNTAIN = 0.78;
/** The Greyspine range continues north and south of the pass as a crest. */
const RIDGE = { tx0: -525, tx1: -435 };
/** A second range splits the far west, with saddles to cross. */
const WEST_RIDGE = { tx0: -1960, tx1: -1880 };
/** Passes through the western range: one every this many tiles north–south. */
const WEST_PASS_EVERY = 320;
/** A great inland lake in the south-west. */
const GREAT_LAKE = { x: -1500, y: 520, rx: 150, ry: 95 };
/** The Old Rootking's clearing (BOSS_SPOT, src/lib/progression.ts) stays open. */
const BOSS_TILE = { tx: 36, ty: -45 };
/** Open ground around the Rootking's clearing and every lair (src/lib/lairs.ts): room to fight. */
const CLEARINGS: readonly { tx: number; ty: number; r: number }[] = [{ ...BOSS_TILE, r: 8 }, ...LAIR_SPOTS.map((s) => ({ tx: s.tx, ty: s.ty, r: LAIR_CLEARING }))];
const inClearing = (x: number, y: number, extra = 0): boolean => CLEARINGS.some((c) => Math.hypot(x - c.tx, y - c.ty) < c.r + extra);

export const inHeartland = (tx: number, ty: number): boolean =>
  HEARTLAND.some((b) => tx >= b.tx0 && tx <= b.tx1 && ty >= b.ty0 && ty <= b.ty1);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Tiles outside the heartland (0 inside). */
function heartDist(x: number, y: number): number {
  let best = Infinity;
  for (const b of HEARTLAND) {
    const dx = x < b.tx0 ? b.tx0 - x : x > b.tx1 ? x - b.tx1 : 0;
    const dy = y < b.ty0 ? b.ty0 - y : y > b.ty1 ? y - b.ty1 : 0;
    best = Math.min(best, Math.max(dx, dy));
  }
  return best;
}

// ── The Silverrun (shared with the heartland's bridge stretch) ──────────
export const RIVER_CENTER_TX = -613;
/** Straight stretch for the bridge (road rows) and the pier above it. */
const STRAIGHT = { ty0: -4, ty1: 16 };
export function riverCenter(vy: number): number {
  if (vy >= STRAIGHT.ty0 && vy <= STRAIGHT.ty1) return RIVER_CENTER_TX;
  return RIVER_CENTER_TX + Math.round(3 * Math.sin(vy / 13) + 1.5 * Math.sin(vy / 5.3));
}
/** The snow-melt lake the Silverrun flows out of. */
const SOURCE_LAKE = { x: -613, y: -330, r: 15 };

// ── Land kept for towns and roads ────────────────────────────────────────
/** Coarse cells (8×8 tiles) along every town road: the land stays walkable there. */
const KEEP_CELL = 8;
const ROAD_KEEP: ReadonlySet<string> = (() => {
  const out = new Set<string>();
  for (const road of ROADS) for (const [x, y] of road) {
    const cx = Math.floor(x / KEEP_CELL), cy = Math.floor(y / KEEP_CELL);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.add(`${cx + dx},${cy + dy}`);
  }
  return out;
})();
/** Tiles from the nearest town's box (Infinity when far). */
function townDist(x: number, y: number): number {
  let best = Infinity;
  for (const t of TOWNS) {
    const b = t.box;
    const dx = x < b.tx0 ? b.tx0 - x : x > b.tx1 ? x - b.tx1 : 0;
    const dy = y < b.ty0 ? b.ty0 - y : y > b.ty1 ? y - b.ty1 : 0;
    best = Math.min(best, Math.max(dx, dy));
  }
  return best;
}

// ── Fields ───────────────────────────────────────────────────────────────
/** Land height 0..1: < SEA is sea, > MOUNTAIN is rock. */
export const elevation = memoXY(elevationRaw);
function elevationRaw(x: number, y: number): number {
  if (x < CONTINENT.tx0 || x > CONTINENT.tx1 || y < CONTINENT.ty0 || y > CONTINENT.ty1) return 0;
  const cx = (CONTINENT.tx0 + CONTINENT.tx1) / 2, cy = (CONTINENT.ty0 + CONTINENT.ty1) / 2;
  const nx = Math.abs(x - cx) / ((CONTINENT.tx1 - CONTINENT.tx0) / 2), ny = Math.abs(y - cy) / ((CONTINENT.ty1 - CONTINENT.ty0) / 2);
  const edge = Math.max(nx, ny) ** 3 + Math.min(nx, ny) ** 3 * 0.35;
  const coast = clamp01((0.92 - edge + (fbm(x, y, 70 * WAVE, 3, 701) - 0.5) * 0.5) / 0.25); // ragged shore, bays, islands
  let e = 0.18 + fbm(x, y, 170 * WAVE, 4, 501) * 0.95;
  // the Greyspine: a ridge across the continent, broken by saddles
  const rx = x < RIDGE.tx0 ? RIDGE.tx0 - x : x > RIDGE.tx1 ? x - RIDGE.tx1 : 0;
  e += Math.max(0, 1 - rx / 40) * 0.3 * (0.6 + noise(x, y, 60, 503) * 0.6);
  // the western range, crossed by a pass every WEST_PASS_EVERY tiles (and the odd saddle)
  const wx = x < WEST_RIDGE.tx0 ? WEST_RIDGE.tx0 - x : x > WEST_RIDGE.tx1 ? x - WEST_RIDGE.tx1 : 0;
  const m = ((y % WEST_PASS_EVERY) + WEST_PASS_EVERY) % WEST_PASS_EVERY;
  const toPass = Math.min(m, WEST_PASS_EVERY - m);
  e += Math.max(0, 1 - wx / 50) * 0.24 * Math.max(0, noise(x, y, 90, 505) * 1.6 - 0.35) * clamp01((toPass - 12) / 20);
  // the great lake: a basin in the south-west
  const lake = Math.hypot((x - GREAT_LAKE.x) / GREAT_LAKE.rx, (y - GREAT_LAKE.y) / GREAT_LAKE.ry) + (noise(x, y, 30, 507) - 0.5) * 0.25;
  if (lake < 1.3) e -= Math.max(0, 1.3 - lake) * 0.4;
  e *= coast;
  // ease into the heartland: middling ground, except where the ridge meets it
  const d = heartDist(x, y);
  if (d < SEAM) e = e + (0.55 - e) * (1 - d / SEAM) * (rx === 0 ? 0.2 : 1);
  // towns and their roads always stand on open, walkable land
  const td = townDist(x, y);
  if (td < 24) e = e + (0.55 - e) * (1 - td / 24);
  else if (ROAD_KEEP.has(`${Math.floor(x / KEEP_CELL)},${Math.floor(y / KEEP_CELL)}`)) e = Math.min(0.7, Math.max(0.4, e));
  return e;
}
export function temperature(x: number, y: number, e = elevation(x, y)): number {
  return 0.5 + (y / CONTINENT.ty1) * 0.36 + (fbm(x, y, 220 * WAVE, 2, 801) - 0.5) * 0.4 - Math.max(0, e - 0.66) * 1.4;
}
export const moisture = memoXY((x: number, y: number): number => fbm(x, y, 140 * WAVE, 3, 901));

/** The biome at world tile (x, y) (outside the heartland). */
export const biomeAt = (x: number, y: number): Biome => BIOMES[biomeIndex(x, y)];
const BIOMES: readonly Biome[] = ["ocean", "beach", "meadow", "forest", "darkwood", "swamp", "desert", "badlands", "mesa", "snow", "snowpeak", "peak"];
const biomeIndex = memoXY((x: number, y: number): number => BIOMES.indexOf(biomeRaw(x, y)));
function biomeRaw(x: number, y: number): Biome {
  const e = elevation(x, y);
  if (e < SEA) return "ocean";
  if (e < SEA + 0.022) return "beach";
  const t = temperature(x, y, e), m = moisture(x, y);
  if (e > MOUNTAIN) return t < 0.4 ? "snowpeak" : t > 0.66 ? "mesa" : "peak";
  if (heartDist(x, y) < SEAM) return m > 0.5 ? "forest" : "meadow";
  if (t < 0.3) return "snow";
  if (t > 0.68 && m < 0.44) return "desert";
  if (t > 0.6 && m < 0.52 && e > 0.6) return "badlands";
  if (m > 0.64 && e < 0.5) return "swamp";
  if (m > 0.62 && t < 0.5) return "darkwood";
  if (m > 0.5) return "forest";
  return "meadow";
}

const GROUND: Readonly<Record<Biome, GroundKind>> = {
  ocean: "sand", beach: "sand", desert: "sand", meadow: "grass", forest: "grass", darkwood: "darkgrass",
  swamp: "mud", badlands: "redrock", mesa: "redrock", snow: "snow", snowpeak: "snow", peak: "grass",
};
/** Draw order when corners disagree: the first kind present wins the tile. */
const GROUND_ORDER: readonly GroundKind[] = ["snow", "sand", "redrock", "mud", "darkgrass"];

// ── Vertex fields (tile corners) ─────────────────────────────────────────
const groundV = (vx: number, vy: number): GroundKind => GROUND[biomeAt(vx, vy)];

function riverV(vx: number, vy: number): boolean {
  if (vy < SOURCE_LAKE.y || Math.abs(vx - RIVER_CENTER_TX) > 12) return false;
  const c = riverCenter(vy);
  return vx >= c - 3 && vx <= c + 3;
}
/** Water before towns are cleared (the town generator reads this). */
function rawWaterV(vx: number, vy: number): boolean {
  if (inClearing(vx, vy)) return false;
  const e = elevation(vx, vy);
  if (e < SEA) return true;
  if (riverV(vx, vy)) return true;
  if (Math.hypot(vx - SOURCE_LAKE.x, (vy - SOURCE_LAKE.y) * 1.3) < SOURCE_LAKE.r + (noise(vx, vy, 5, 511) - 0.5) * 4) return true;
  const b = biomeAt(vx, vy);
  if (b === "swamp") return noise(vx, vy, 7, 512) > 0.62; // pools
  if (heartDist(vx, vy) < SEAM + 4) return false;
  // small lakes in low, wet ground
  return e < 0.42 && moisture(vx, vy) > 0.55 && noise(vx, vy, 16, 513) > 0.74;
}

/** Towns are dry and flat. (Cached per corner: pure.) */
const waterV = ((f) => (vx: number, vy: number): boolean => f(vx, vy) === 1)(memoXY((vx: number, vy: number) => (!townAt(vx, vy) && rawWaterV(vx, vy) ? 1 : 0)));
const levelAt = memoXY((tx: number, ty: number): number => (townAt(tx, ty) ? 0 : rawLevelAt(tx, ty)));
/** The untouched terrain, for scripts/gen-settlements.ts. */
export const terrainProbe = { water: (vx: number, vy: number) => rawWaterV(vx, vy), level: (tx: number, ty: number) => rawLevelAt(tx, ty) };

/** Mountain terrace level (0 = flat), on 4×3-tile blocks so faces stay crisp. */
function rawLevelAt(tx: number, ty: number): number {
  const bx = Math.floor(tx / 4), by = Math.floor(ty / 3);
  const e = elevation(bx * 4 + 2, by * 3 + 1);
  return e > MOUNTAIN ? Math.min(4, 1 + Math.floor((e - MOUNTAIN) / 0.045)) : 0;
}
/** Cliff-face row of a terrace tile (0 top, 1 mid, 2 base) or -1. */
function faceRow(tx: number, ty: number): number {
  const h = levelAt(tx, ty);
  if (h === 0) return -1;
  if (levelAt(tx, ty + 1) < h) return 2;
  if (levelAt(tx, ty + 2) < h) return 1;
  if (levelAt(tx, ty + 3) < h) return 0;
  return -1;
}

const TREE_DENSITY: Readonly<Record<Biome, number>> = {
  ocean: 0, beach: 0.08, meadow: 0.05, forest: 0.62, darkwood: 0.78, swamp: 0.2,
  desert: 0.006, badlands: 0.02, snow: 0.18, peak: 0, snowpeak: 0, mesa: 0,
};
/** Forest trails: winding north–south and east–west lanes every TRAIL_EVERY
 *  tiles where no tree grows, so even the deepest woods can be crossed on
 *  foot (and routed through by NPCs) in a world this size. */
const TRAIL_EVERY = 48, TRAIL_HALF = 2;
function onTrail(vx: number, vy: number): boolean {
  const wx = vx + (noise(vy, 0, 40, 541) - 0.5) * 18; // a north–south lane wobbles with y
  const wy = vy + (noise(vx, 0, 40, 542) - 0.5) * 18; // an east–west lane wobbles with x
  const mx = ((wx % TRAIL_EVERY) + TRAIL_EVERY) % TRAIL_EVERY, my = ((wy % TRAIL_EVERY) + TRAIL_EVERY) % TRAIL_EVERY;
  return Math.min(mx, TRAIL_EVERY - mx) <= TRAIL_HALF || Math.min(my, TRAIL_EVERY - my) <= TRAIL_HALF;
}

/** Is there a tree on lattice corner (vx, vy)? */
/** Felled trees change at runtime, so they're checked outside the cache. */
const forestV = (vx: number, vy: number): boolean => !isFelled(vx, vy) && forestCached(vx, vy) === 1;
const forestCached = memoXY((vx: number, vy: number): number => (forestRaw(vx, vy) ? 1 : 0));
function forestRaw(vx: number, vy: number): boolean {
  if (((vx % 2) + 2) % 2 || ((vy % 2) + 2) % 2) return false;
  if (townAt(vx, vy) || townAt(vx - 1, vy - 1) || nearRoad(vx, vy, 2)) return false;
  const b = biomeAt(vx, vy);
  const density = TREE_DENSITY[b];
  if (!density) return false;
  if (inClearing(vx, vy, 1)) return false;
  if (density > 0.15 && onTrail(vx, vy)) return false;
  // clearings break up the woods
  const clear = b === "forest" || b === "darkwood" ? noise(vx, vy, 18, 521) < 0.3 : false;
  if (clear || hash(vx, vy, 522) > density) return false;
  for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1], [1, 0], [0, 1]]) if (waterV(vx + dx, vy + dy)) return false;
  return levelAt(vx, vy) === 0 && levelAt(vx - 1, vy - 1) === 0 && levelAt(vx, vy + 2) === 0;
}
function treeKind(vx: number, vy: number): string {
  const b = biomeAt(vx, vy), h = hash(vx, vy, 523);
  switch (b) {
    case "beach": return temperature(vx, vy) > 0.55 ? "palm" : "pine";
    case "desert": return "palm";
    case "darkwood": return h < 0.85 ? "dark" : "pine";
    case "swamp": return h < 0.6 ? "dead" : "dark";
    case "snow": return "snowpine";
    case "badlands": return "dead";
    default: return h < (temperature(vx, vy) < 0.45 ? 0.7 : 0.25) ? "pine" : "oak";
  }
}
/** The continent tree standing at lattice corner (vx, vy), or null. */
export function continentTreeAt(vx: number, vy: number): string | null {
  return forestV(vx, vy) ? treeKind(vx, vy) : null;
}
function tallV(vx: number, vy: number): boolean {
  const b = biomeAt(vx, vy);
  if (b !== "meadow" && b !== "forest") return false;
  return noise(vx, vy, 5, 531) > 0.8 && !waterV(vx, vy) && !forestV(vx, vy) && !townAt(vx, vy) && !nearRoad(vx, vy, 1);
}

// ── Tiles ────────────────────────────────────────────────────────────────
function mask(f: (vx: number, vy: number) => boolean, tx: number, ty: number): number {
  return (f(tx, ty) ? 1 : 0) | (f(tx + 1, ty) ? 2 : 0) | (f(tx, ty + 1) ? 4 : 0) | (f(tx + 1, ty + 1) ? 8 : 0);
}
const bits = (m: number) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
const auto = (family: string, m: number, tx: number, ty: number) =>
  m === 15 ? `${family}_15_${Math.floor(hash(tx, ty, 49) * 3)}` : `${family}_${m}`;
const grassFor = (tx: number, ty: number) => `grass_${Math.floor(hash(tx, ty, 50) * 4)}`;

/**
 * The ground tile from the four corners' ground kinds: the first kind in
 * GROUND_ORDER wins its corners, drawn over the next kind present
 * (`<top>_on_<base>_<mask>`), or over grass when the rest is grass — so
 * snow meeting a beach's sand shows sand, not a strip of grass.
 */
function groundTile(tx: number, ty: number): string {
  const corners = [groundV(tx, ty), groundV(tx + 1, ty), groundV(tx, ty + 1), groundV(tx + 1, ty + 1)];
  const present = GROUND_ORDER.filter((k) => corners.includes(k));
  if (!present.length) return grassFor(tx, ty);
  const top = present[0];
  const m = (corners[0] === top ? 1 : 0) | (corners[1] === top ? 2 : 0) | (corners[2] === top ? 4 : 0) | (corners[3] === top ? 8 : 0);
  if (m !== 15 && present[1]) return `${top}_on_${present[1]}_${m}`;
  return auto(top, m, tx, ty);
}

/** A swamp pool's corner (murky water), as opposed to the river, lakes and sea. */
const murkyV = (vx: number, vy: number): boolean => waterV(vx, vy) && biomeAt(vx, vy) === "swamp" && !riverV(vx, vy) && elevation(vx, vy) >= SEA;

/** Shore families by the land they meet (grass keeps the original `water_*`). */
const SHORE: Readonly<Partial<Record<GroundKind, string>>> = { sand: "water_sand", mud: "water_mud", darkgrass: "water_darkgrass", snow: "water_snow", redrock: "water_redrock" };

/**
 * The water tile for a cell with water corners `wm`, of which `murky` are
 * swamp pools: a pool's own mud shores, a pool fading into the river, or
 * clear water whose shore matches the ground beside it.
 */
function waterTile(wm: number, murky: number, tx: number, ty: number): string {
  if (murky === wm) return auto("swamp", wm, tx, ty);
  if (wm === 15 && murky) return `swamp_mix_${wm & ~murky}`;
  if (wm === 15) return auto("water", 15, tx, ty);
  // The land's kind, as groundTile would pick it from the dry corners.
  const corners: [number, number, number][] = [[tx, ty, 1], [tx + 1, ty, 2], [tx, ty + 1, 4], [tx + 1, ty + 1, 8]];
  const dry = corners.filter(([, , b]) => !(wm & b)).map(([x, y]) => groundV(x, y));
  const kind = GROUND_ORDER.find((k) => dry.includes(k));
  const family = (kind && SHORE[kind]) ?? "water";
  return `${family}_${wm}`;
}

/** What the continent holds at world tile (tx, ty) (outside the heartland). */
export function continentAt(tx: number, ty: number): TerrainCell {
  const e = elevation(tx, ty);
  // Open sea: deep water, impassable.
  if (e < SEA - 0.05 && !riverV(tx, ty)) return { ground: `deep_${Math.floor(hash(tx, ty, 49) * 3)}`, collide: true };

  // Mountain terraces: cliff faces, lips, and rock / snow / red tops.
  const h = levelAt(tx, ty);
  if (h > 0) {
    const b = biomeAt(tx, ty);
    const row = faceRow(tx, ty);
    if (row >= 0) {
      const name = ["cliff_top", "cliff_mid", "cliff_base"][row];
      const l = faceRow(tx - 1, ty) !== row, r = faceRow(tx + 1, ty) !== row;
      return { ground: grassFor(tx, ty), lower: l && !r ? `${name}_l` : r && !l ? `${name}_r` : name };
    }
    if (levelAt(tx, ty - 1) < h) return { ground: grassFor(tx, ty), lower: "lip_n" };
    if (levelAt(tx - 1, ty) < h) return { ground: grassFor(tx, ty), lower: "lip_w" };
    if (levelAt(tx + 1, ty) < h) return { ground: grassFor(tx, ty), lower: "lip_e" };
    const v = hash(tx, ty, 33);
    const top = b === "snowpeak" ? "snowhigh" : b === "mesa" ? "redhigh" : "highland";
    const cell: TerrainCell = { ground: grassFor(tx, ty), lower: `${top}_${v < 0.8 ? 0 : v < 0.9 ? 1 : 2}` };
    const p = hash(tx, ty, 59);
    if (p < 0.025) cell.prop = b === "snowpeak" ? "snow_rock" : "boulder";
    else if (p < 0.045 && b === "peak") cell.prop = "shrub";
    return cell;
  }

  // Water: sea shallows, lakes, swamp pools, the Silverrun.
  const wm = townAt(tx, ty) ? 0 : mask(waterV, tx, ty); // a town's edge tiles stay dry
  const murky = wm ? mask(murkyV, tx, ty) & wm : 0;
  if (wm && roadTile(tx, ty)) return { ground: waterTile(wm, murky, tx, ty), upper: "bridge_deck" }; // a road's bridge
  if (wm) {
    const swamp = murky === wm; // every wet corner is a swamp pool
    const cell: TerrainCell = { ground: waterTile(wm, murky, tx, ty) };
    if (bits(wm) >= 2) cell.collide = true;
    if (bits(wm) === 1 && hash(tx, ty, 51) < 0.35) cell.upper = "reeds";
    else if (wm === 15 && hash(tx, ty, 52) < (swamp ? 0.08 : 0.02)) cell.upper = "lilypad";
    return cell;
  }

  const cell: TerrainCell = { ground: groundTile(tx, ty) };
  // Roads and town streets.
  const pm = mask((vx, vy) => roadV(vx, vy) || townPathV(vx, vy), tx, ty);
  if (pm) cell.upper = auto("path", pm, tx, ty);
  // Towns: their own dressing, nothing wild.
  if (townAt(tx, ty)) return { ...cell, ...townDecorAt(tx, ty) };
  if (pm) return cell;
  const fm = mask(forestV, tx, ty);
  if (fm) {
    const treeAbove = (fm & 4 && forestV(tx, ty - 1)) || (fm & 8 && forestV(tx + 1, ty - 1));
    const [vx, vy] = fm & 1 ? [tx, ty] : fm & 2 ? [tx + 1, ty] : fm & 4 ? [tx, ty + 1] : [tx + 1, ty + 1];
    const name = `tree_${treeKind(vx, vy)}_${fm}`;
    if (fm & 3 || treeAbove) cell.lower = name;
    else cell.canopy = name;
    return cell;
  }
  if (isFelled(tx, ty)) return { ...cell, upper: "stump" };
  const tm = mask(tallV, tx, ty);
  if (tm) return { ...cell, upper: `tall_${tm}` };
  if (inClearing(tx, ty)) return cell;

  // Decor and props by biome.
  const b = biomeAt(tx, ty);
  const r = hash(tx, ty, 53), pick = hash(tx, ty, 54);
  // a giant mushroom stands on two tiles: its cap overhangs the tile above
  const giant = (x: number, y: number) => biomeAt(x, y) === "darkwood" && hash(x, y, 53) < 0.008 && !mask(forestV, x, y) && !mask(waterV, x, y);
  if (giant(tx, ty + 1)) return { ...cell, canopy: "giant_mushroom_top" };
  switch (b) {
    case "meadow":
    case "forest":
      if (r < 0.01) cell.lower = ["bush", "bush", "boulder", "stump", "rock_small"][Math.floor(pick * 5)];
      else if (r < (b === "meadow" ? 0.05 : 0.02)) cell.upper = ["flowers_red", "flowers_yellow", "flowers_white", "flowers_blue", "flowers_pink"][Math.floor(pick * 5)];
      else if (r < 0.15) cell.upper = ["tuft_0", "tuft_1", "clover", "mushrooms"][Math.floor(pick * 4)];
      break;
    case "darkwood":
      if (giant(tx, ty)) cell.lower = "giant_mushroom_base";
      else if (r < 0.14) cell.upper = pick < 0.75 ? "fern" : "mushrooms";
      break;
    case "swamp":
      if (r < 0.03) cell.upper = "dead_bush";
      else if (r < 0.06) cell.upper = "reeds";
      break;
    case "desert":
      if (r < 0.018) cell.lower = "cactus";
      else if (r < 0.026) cell.lower = "desert_rock";
      else if (r < 0.034) cell.upper = "bones";
      else if (r < 0.05) cell.upper = "dead_bush";
      break;
    case "badlands":
      if (r < 0.02) cell.lower = "desert_rock";
      else if (r < 0.03) cell.upper = "bones";
      else if (r < 0.05) cell.upper = "dead_bush";
      break;
    case "beach":
      if (r < 0.03) cell.upper = "shells";
      else if (r < 0.04) cell.lower = "driftwood";
      break;
    case "snow":
      if (r < 0.012) cell.lower = "snow_rock";
      else if (r < 0.06) cell.upper = "snowdrift";
      break;
  }
  return cell;
}

// ── Danger ───────────────────────────────────────────────────────────────
/** The village plaza: danger grows with distance from here. */
const HOME = { tx: 32, ty: 21 };
/** Tiles of distance per danger tier. */
const TIER_EVERY = 330;
/** Danger tier 1 (safe) … 8 (the deadly far corners) at world tile (x, y):
 *  distance from the village, plus one for peaks, darkwood and swamp. The
 *  first four rings cover the old continent; the far lands go on to 8. */
export function tierAt(x: number, y: number): number {
  const d = Math.hypot(x - HOME.tx, (y - HOME.ty) * 1.6);
  let t = 1 + Math.floor(d / TIER_EVERY);
  if (!inHeartland(x, y)) {
    const b = biomeAt(x, y);
    if (b === "peak" || b === "snowpeak" || b === "mesa" || b === "darkwood" || b === "swamp") t += 1;
  } else t = Math.min(t, 2);
  return Math.max(1, Math.min(8, t));
}

// ── Provinces ────────────────────────────────────────────────────────────
// The land outside the heartland is split into named provinces: seed
// points on a jittered GRID × GRID grid (skipping sea), each tile belonging
// to its nearest seed. The name comes from the biome around the seed.
const GRID = 8;
const PROVINCE_NAMES: Readonly<Record<string, readonly string[]>> = {
  snow: ["the Frostfang Reach", "Whitecap Fells", "the Rimewood", "Hoarfrost Hollow", "the Pale Tundra", "the Glacier Steps", "Snowveil Barrens", "the Howling Wastes"],
  peak: ["the High Crags", "Stormcrown Heights", "the Greyspine Crest", "Eagle's Roost", "the Thunder Spires", "Anvil Peaks", "the Broken Teeth"],
  desert: ["the Ember Sands", "the Sunscald Dunes", "the Glass Waste", "the Scorched Expanse", "the Bonewind Flats", "Mirage Basin", "the Copper Dunes"],
  badlands: ["the Red Mesas", "the Rustcliff Badlands", "Coyote Gulch", "the Cinder Canyons", "Vulture Ridge", "the Ochre Breaks"],
  swamp: ["Mirewood", "the Sunken Fen", "Blackwater Bog", "the Drowned Marches", "Leechwater", "the Rotting Mere"],
  darkwood: ["the Gloamwood", "Nightbriar Forest", "the Hushwood", "the Weeping Thicket", "Ravenhold Wood", "the Umbral Grove"],
  forest: ["Oakhollow Woods", "the Greenmantle", "Fernvale", "the Elderwood", "Mossbrook Forest", "Wren's Wood", "the Ashgrove", "Bramblebank", "the Wildwood", "Hartwood Chase"],
  meadow: ["the Golden Downs", "Thistle Plains", "Brookfield Vale", "the Clover Heath", "Larkspur Fields", "Windmere Meadows", "the Barley Reaches", "Primrose Lea", "the Sunlit Wolds", "Kestrel Downs"],
  beach: ["the Shell Coast", "Gull's Rest Shore", "the Saltwind Strand", "the Amber Shallows", "Driftwood Bay", "the Pearl Coast"],
};
/** Distinctive lands win a province's name over the common ones. */
const NAME_WEIGHT: Readonly<Record<string, number>> = { meadow: 1, forest: 1, beach: 1, snow: 1.6, peak: 1.4, desert: 1.8, badlands: 2, swamp: 2.4, darkwood: 2.2 };
const NAME_GROUP: Readonly<Record<Biome, string>> = {
  ocean: "beach", beach: "beach", meadow: "meadow", forest: "forest", darkwood: "darkwood", swamp: "swamp",
  desert: "desert", badlands: "badlands", mesa: "badlands", snow: "snow", snowpeak: "snow", peak: "peak",
};
const SEEDS: readonly ProvinceSeed[] = (() => {
  const out: ProvinceSeed[] = [];
  const used = new Map<string, number>();
  const cw = (CONTINENT.tx1 - CONTINENT.tx0 + 1) / GRID, ch = (CONTINENT.ty1 - CONTINENT.ty0 + 1) / GRID;
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    // try a few jittered spots in the cell; the first on open land wins
    for (let k = 0; k < 8; k++) {
      const tx = Math.round(CONTINENT.tx0 + cw * (i + 0.2 + hash(i, j, 541 + k) * 0.6));
      const ty = Math.round(CONTINENT.ty0 + ch * (j + 0.2 + hash(j, i, 542 + k) * 0.6));
      if (inHeartland(tx, ty) || elevation(tx, ty) < SEA + 0.03) continue;
      // name it after the most common biome around the spot
      const count = new Map<string, number>();
      for (let dy = -40; dy <= 40; dy += 10) for (let dx = -60; dx <= 60; dx += 10) {
        const g = NAME_GROUP[biomeAt(tx + dx, ty + dy)];
        if (g !== "beach" || elevation(tx + dx, ty + dy) >= SEA) count.set(g, (count.get(g) ?? 0) + NAME_WEIGHT[g]);
      }
      const group = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "meadow";
      const names = PROVINCE_NAMES[group];
      const n = used.get(group) ?? 0;
      used.set(group, n + 1);
      // when a group's names run out, they come round again as the Upper / Far … lands
      const base = names[n % names.length];
      const lap = Math.floor(n / names.length);
      const name = lap === 0 ? base : `the ${["Upper", "Far", "Lower", "Outer", "Old", "High", "Deep", "Wild"][(lap - 1) % 8]} ${base.replace(/^the /, "")}`;
      out.push({ key: `prov_${name.toLowerCase().replace(/^the /, "").replace(/[^a-z]+/g, "_")}_${i}${j}`, name, tx, ty });
      break;
    }
  }
  return out;
})();

/** The provinces as named regions (bounding boxes are approximate; the
 *  true shape comes from provinceAt). */
export const PROVINCES: Region[] = SEEDS.map((s) => ({
  key: s.key, name: s.name,
  tx0: CONTINENT.tx0, tx1: CONTINENT.tx1, ty0: CONTINENT.ty0, ty1: CONTINENT.ty1,
  label: { tx: s.tx, ty: s.ty },
}));

/** The province at world tile (x, y): land outside the heartland only. */
export function provinceAt(x: number, y: number): Region | null {
  if (inHeartland(x, y) || x < CONTINENT.tx0 || x > CONTINENT.tx1 || y < CONTINENT.ty0 || y > CONTINENT.ty1) return null;
  if (elevation(x, y) < SEA) return null;
  let best = -1, bestD = Infinity;
  for (let i = 0; i < SEEDS.length; i++) {
    const d = (SEEDS[i].tx - x) ** 2 + ((SEEDS[i].ty - y) * 1.3) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best >= 0 ? PROVINCES[best] : null;
}

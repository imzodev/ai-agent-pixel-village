// The open continent: a 50 × 50-chunk world (1,200 × 750 tiles) around the
// hand-made heartland (src/lib/regions.ts: the King's Road, its towns, the
// village, fields and ranches). Every tile outside the heartland is
// generated here from seeded noise — elevation (a ragged coast, islands, a
// north–south Greyspine ridge), temperature (colder north, warmer south,
// colder up high) and moisture — into biomes: meadow, forest, darkwood,
// swamp, desert, badlands, snow, beaches, ocean and mountain terraces.
// Pure and deterministic: every process builds the same world.

import { fbm, hash, noise } from "./terrain/noise";
import { isFelled } from "./terrain/felled";
import type { Biome, GroundKind } from "@/types/continent";
import type { TerrainCell, TileBox } from "@/types/regions";

export type { Biome, GroundKind } from "@/types/continent";

/** The continent (tiles, inclusive): chunks cx −40…9, cy −24…25. Ocean beyond. */
export const CONTINENT: TileBox = { tx0: -960, tx1: 239, ty0: -375, ty1: 374 };
/** The hand-made heartland (src/lib/regions.ts): the King's Road with its
 *  towns, and the village with its fields and ranches. Edges sit on the
 *  tree lattice's parity (odd west/north, even east/south), so no tree is
 *  split between the two generators. */
export const HEARTLAND: readonly TileBox[] = [
  { tx0: -809, tx1: 150, ty0: -21, ty1: 36 },
  { tx0: -125, tx1: 150, ty0: -31, ty1: 92 },
];
/** Near the heartland the land eases into plain forest and meadow. */
const SEAM = 16;
const SEA = 0.3;
const MOUNTAIN = 0.78;
/** The Greyspine range continues north and south of the pass as a crest. */
const RIDGE = { tx0: -525, tx1: -435 };
/** The Old Rootking's clearing (BOSS_SPOT, src/lib/progression.ts) stays open. */
const BOSS_TILE = { tx: 36, ty: -45 };

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

// ── Fields ───────────────────────────────────────────────────────────────
/** Land height 0..1: < SEA is sea, > MOUNTAIN is rock. */
export function elevation(x: number, y: number): number {
  if (x < CONTINENT.tx0 || x > CONTINENT.tx1 || y < CONTINENT.ty0 || y > CONTINENT.ty1) return 0;
  const cx = (CONTINENT.tx0 + CONTINENT.tx1) / 2, cy = (CONTINENT.ty0 + CONTINENT.ty1) / 2;
  const nx = Math.abs(x - cx) / ((CONTINENT.tx1 - CONTINENT.tx0) / 2), ny = Math.abs(y - cy) / ((CONTINENT.ty1 - CONTINENT.ty0) / 2);
  const edge = Math.max(nx, ny) ** 3 + Math.min(nx, ny) ** 3 * 0.35;
  const coast = clamp01((0.92 - edge + (fbm(x, y, 70, 3, 701) - 0.5) * 0.5) / 0.25); // ragged shore, bays, islands
  let e = 0.18 + fbm(x, y, 170, 4, 501) * 0.95;
  // the Greyspine: a ridge across the continent, broken by saddles
  const rx = x < RIDGE.tx0 ? RIDGE.tx0 - x : x > RIDGE.tx1 ? x - RIDGE.tx1 : 0;
  e += Math.max(0, 1 - rx / 40) * 0.26 * (0.6 + noise(x, y, 60, 503) * 0.6);
  // ease into the heartland: middling ground, except where the ridge meets it
  const d = heartDist(x, y);
  if (d < SEAM) e = e + (0.55 - e) * (1 - d / SEAM) * (rx === 0 ? 0.2 : 1);
  return e * coast;
}
export function temperature(x: number, y: number, e = elevation(x, y)): number {
  return 0.5 + (y / CONTINENT.ty1) * 0.36 + (fbm(x, y, 220, 2, 801) - 0.5) * 0.4 - Math.max(0, e - 0.66) * 1.4;
}
export function moisture(x: number, y: number): number {
  return fbm(x, y, 140, 3, 901);
}

/** The biome at world tile (x, y) (outside the heartland). */
export function biomeAt(x: number, y: number): Biome {
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
function waterV(vx: number, vy: number): boolean {
  if (Math.hypot(vx - BOSS_TILE.tx, vy - BOSS_TILE.ty) < 8) return false;
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

/** Mountain terrace level (0 = flat), on 4×3-tile blocks so faces stay crisp. */
function levelAt(tx: number, ty: number): number {
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
/** Is there a tree on lattice corner (vx, vy)? */
function forestV(vx: number, vy: number): boolean {
  if (((vx % 2) + 2) % 2 || ((vy % 2) + 2) % 2) return false;
  if (isFelled(vx, vy)) return false;
  const b = biomeAt(vx, vy);
  const density = TREE_DENSITY[b];
  if (!density) return false;
  if (Math.hypot(vx - BOSS_TILE.tx, vy - BOSS_TILE.ty) < 9) return false;
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
  return noise(vx, vy, 5, 531) > 0.8 && !waterV(vx, vy) && !forestV(vx, vy);
}

// ── Tiles ────────────────────────────────────────────────────────────────
function mask(f: (vx: number, vy: number) => boolean, tx: number, ty: number): number {
  return (f(tx, ty) ? 1 : 0) | (f(tx + 1, ty) ? 2 : 0) | (f(tx, ty + 1) ? 4 : 0) | (f(tx + 1, ty + 1) ? 8 : 0);
}
const bits = (m: number) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
const auto = (family: string, m: number, tx: number, ty: number) =>
  m === 15 ? `${family}_15_${Math.floor(hash(tx, ty, 49) * 3)}` : `${family}_${m}`;
const grassFor = (tx: number, ty: number) => `grass_${Math.floor(hash(tx, ty, 50) * 4)}`;

/** The ground tile from the four corners' ground kinds. */
function groundTile(tx: number, ty: number): string {
  const corners = [groundV(tx, ty), groundV(tx + 1, ty), groundV(tx, ty + 1), groundV(tx + 1, ty + 1)];
  for (const k of GROUND_ORDER) {
    const m = (corners[0] === k ? 1 : 0) | (corners[1] === k ? 2 : 0) | (corners[2] === k ? 4 : 0) | (corners[3] === k ? 8 : 0);
    if (m) return auto(k, m, tx, ty);
  }
  return grassFor(tx, ty);
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
  const wm = mask(waterV, tx, ty);
  if (wm) {
    const swamp = biomeAt(tx, ty) === "swamp" && !riverV(tx, ty) && e >= SEA;
    const cell: TerrainCell = { ground: auto(swamp ? "swamp" : "water", wm, tx, ty) };
    if (bits(wm) >= 2) cell.collide = true;
    if (bits(wm) === 1 && hash(tx, ty, 51) < 0.35) cell.upper = "reeds";
    else if (wm === 15 && hash(tx, ty, 52) < (swamp ? 0.08 : 0.02)) cell.upper = "lilypad";
    return cell;
  }

  const cell: TerrainCell = { ground: groundTile(tx, ty) };
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
  if (Math.hypot(tx - BOSS_TILE.tx, ty - BOSS_TILE.ty) < 8) return cell;

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

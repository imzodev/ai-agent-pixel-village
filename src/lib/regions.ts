// The world west of the village, as one deterministic plan. chunkGen turns
// `terrainAt` into tile layers, so the client's art and the server's
// collision always agree. East → west along the King's Road:
//
//   The Grove (village) → Western Meadow → Whisperwood (forest around the
//   oak grove) → Hollowmere (town) → Greyspine (mountains, a pass and a
//   cave) → Silverrun (river, bridge, pier) → Brightwater (town)
//
// The Greyspine Caverns are a separate pocket far north, reached only
// through the cave mouth (a portal, see buildings.json).
//
// Terrain is mostly defined on tile CORNERS ("vertices"): forest, paths,
// water, gravel and tall grass are vertex fields, and each tile picks the
// autotile for its 4-corner mask (scripts/draw-wilds.mjs). Cliffs and cave
// walls are per tile. World tiles are 16 px and ty grows downward; chunk
// (cx, cy) spans tx cx*24 … cx*24+23 and ty -cy*15 … -cy*15+14.

import type { Region, RegionNode, TerrainCell, TileBox } from "@/types/regions";
import { FOREST_TILES } from "./forest";
import { hash, noise } from "./terrain/noise";
import { isFelled, setFelledTrees } from "./terrain/felled";
import { PROVINCES, continentAt, continentTreeAt, inHeartland, provinceAt, riverCenter } from "./continent";
import { TOWN_REGIONS, nearRoad, roadTile, roadV, townAt } from "./settlements";

export type { Region, RegionNode, TerrainCell, TileBox } from "@/types/regions";

/** The King's Road: three full tile rows from the village to Brightwater. */
export const ROAD = { tx0: -770, tx1: -25, ty0: 6, ty1: 8 } as const;

/** Mountains and the river reach this far north/south, so the pass and
 *  the bridge are the only practical ways west. */
const BARRIER_TY0 = -300;
const BARRIER_TY1 = 314;

export const REGIONS: Region[] = [
  { key: "meadow", name: "the Western Meadow", tx0: -120, tx1: -25, ty0: BARRIER_TY0, ty1: BARRIER_TY1 },
  { key: "whisperwood", name: "Whisperwood", tx0: -288, tx1: -121, ty0: BARRIER_TY0, ty1: BARRIER_TY1 },
  { key: "hollowmere", name: "Hollowmere", tx0: -384, tx1: -289, ty0: BARRIER_TY0, ty1: BARRIER_TY1 },
  { key: "greyspine", name: "the Greyspine Mountains", tx0: -576, tx1: -385, ty0: BARRIER_TY0, ty1: BARRIER_TY1 },
  { key: "silverrun", name: "the Silverrun", tx0: -648, tx1: -577, ty0: BARRIER_TY0, ty1: BARRIER_TY1 },
  { key: "brightwater", name: "Brightwater", tx0: -800, tx1: -649, ty0: BARRIER_TY0, ty1: BARRIER_TY1 },
  { key: "caverns", name: "the Greyspine Caverns", tx0: -528, tx1: -409, ty0: -480, ty1: -436 },
];
const regionByKey = (k: string) => REGIONS.find((r) => r.key === k)!;
/** Inside this strip, open ground uses the detailed Wilds grass. */
const STRIP: TileBox = { tx0: -800, tx1: -25, ty0: BARRIER_TY0, ty1: BARRIER_TY1 };

/** Region containing world tile (tx, ty), if any: the caverns, a region of
 *  the heartland, or a province of the continent (src/lib/continent.ts). */
export function regionAtTile(tx: number, ty: number): Region | null {
  const r = REGIONS.find((r) => tx >= r.tx0 && tx <= r.tx1 && ty >= r.ty0 && ty <= r.ty1) ?? null;
  if (r?.key === "caverns") return r;
  const town = townAt(tx, ty);
  if (town) return TOWN_REGIONS.find((t) => t.key === `town_${town.key}`) ?? null;
  if (!inHeartland(tx, ty)) return provinceAt(tx, ty);
  return r;
}

/** Every named place: the heartland's regions and the provinces. */
export const PLACES: readonly Region[] = [...REGIONS, ...TOWN_REGIONS, ...PROVINCES];
export const placeByKey = (key: string): Region | undefined => PLACES.find((p) => p.key === key);

/** Region containing world pixel (x, y), if any. */
export function regionAt(x: number, y: number): Region | null {
  return regionAtTile(Math.floor(x / 16), Math.floor(y / 16));
}

// ── Noise ────────────────────────────────────────────────────────────────

const inBox = (b: TileBox, tx: number, ty: number) => tx >= b.tx0 && tx <= b.tx1 && ty >= b.ty0 && ty <= b.ty1;

// ── Places ───────────────────────────────────────────────────────────────

/** Town squares (scenery stamps, buildings.json): template top-left tiles. */
export const TOWN_SQUARES = [
  { key: "hollowmere_square", tx: -348, ty: 0 },
  { key: "brightwater_square", tx: -720, ty: 0 },
] as const;

/** Town cores: no wild trees, props or tall grass inside. */
const TOWNS: TileBox[] = [
  { tx0: -394, tx1: -284, ty0: -14, ty1: 32 }, // Hollowmere
  { tx0: -778, tx1: -617, ty0: -14, ty1: 32 }, // Brightwater, out to its quay
];

/** House doors in the new towns (template door tiles, see buildings.json):
 *  north-side doors open onto the road, south-side doors onto a back lane. */
const NORTH_DOORS = [-373, -359, -305, -291, -755, -743, -677, -663];
const SOUTH_DOORS = [-373, -305, -755, -663];
/** Back lanes behind the south-side houses, joined to the road. */
const LANES = [
  { tx0: -376, tx1: -302, joinTx: -337 }, // Hollowmere (joins below the square)
  { tx0: -758, tx1: -660, joinTx: -709 }, // Brightwater
];
const LANE_TY = 23; // full lane rows 23..24

/** Rows of trees framing each town: behind the north houses and beyond the
 *  back lane (2-tile lattice corners, see forestV). */
const TOWN_TREE_ROWS = [
  { vy: -12, tx0: -382, tx1: -286 }, { vy: 28, tx0: -382, tx1: -300 },
  { vy: -12, tx0: -774, tx1: -652 }, { vy: 28, tx0: -774, tx1: -652 },
];
function townTree(vx: number, vy: number): boolean {
  if (LANES.some((l) => vx >= l.joinTx - 2 && vx <= l.joinTx + 4)) return false; // keep the lane's way to the road open
  return TOWN_TREE_ROWS.some((r) => vy === r.vy && vx >= r.tx0 && vx <= r.tx1 && vx % 4 === 0);
}

/** Hand-placed town dressing, by tile. Two-row props put their top half in
 *  `canopy` (drawn over you) above a blocking `lower` base. */
const TOWN_DECOR = new Map<string, { upper?: string; lower?: string; canopy?: string }>();
const decor = (tx: number, ty: number, d: { upper?: string; lower?: string; canopy?: string }) => TOWN_DECOR.set(`${tx},${ty}`, d);
const tallProp = (tx: number, ty: number, name: string) => { decor(tx, ty - 1, { canopy: `${name}_top` }); decor(tx, ty, { lower: `${name}_base` }); };
for (const d of NORTH_DOORS) {
  decor(d - 2, 4, { upper: "flowerbed" });
  decor(d + 2, 4, { upper: "flowerbed" });
  decor(d + 3, 5, { lower: "mailbox" });
}
// Notice boards (2×2) at each town's gates, south of the road.
for (const tx of [-383, -292, -768, -641]) {
  decor(tx, 10, { canopy: "board_tl" }); decor(tx + 1, 10, { canopy: "board_tr" });
  decor(tx, 11, { lower: "board_bl" }); decor(tx + 1, 11, { lower: "board_br" });
}
// Statues on each square (a stone traveller with a lantern).
for (const q of TOWN_SQUARES) tallProp(q.tx + 17, 12, "statue");
// Barrels by the smithy, crates and barrels on Brightwater's quay.
for (const [tx, ty] of [[-324, 11], [-323, 11], [-324, 12]]) decor(tx, ty, { lower: "barrel" });
for (const [tx, ty] of [[-621, -3], [-622, -3], [-621, -2], [-621, 13], [-622, 14]]) decor(tx, ty, { lower: "crate_wood" });
for (const [tx, ty] of [[-621, 11], [-621, 15], [-622, -1]]) decor(tx, ty, { lower: "barrel" });
// Lamps along the road through both towns, a bench beside each south lamp.
for (const [x0, x1] of [[-380, -294], [-764, -626]]) {
  for (let tx = x0; tx <= x1; tx += 9) {
    if (NORTH_DOORS.some((d) => Math.abs(tx - d) <= 3) || TOWN_SQUARES.some((q) => tx >= q.tx - 1 && tx <= q.tx + 24)) continue;
    tallProp(tx, 4, "lamp");
    const nearGate = [-383, -292, -768, -641].some((g) => tx >= g - 3 && tx <= g + 4);
    if (nearGate || LANES.some((l) => Math.abs(tx - l.joinTx - 1) <= 4)) continue;
    tallProp(tx, 11, "lamp");
    decor(tx + 1, 11, { lower: "bench_l" });
    decor(tx + 2, 11, { lower: "bench_r" });
  }
}
// Route signs where each stretch of the road begins.
for (const tx of [-118, -286, -390, -574, -646]) decor(tx, 4, { lower: "sign" });

/** Brightwater's quay: a boardwalk along the river's west bank. */
const QUAY: TileBox = { tx0: -620, tx1: -618, ty0: -4, ty1: 16 };

/** The cave mouth: its door tile sits in the pass, below the north cliff. */
export const CAVE_MOUTH_TX = -480;
export const CAVE_MOUTH_AREA = { tx0: CAVE_MOUTH_TX - 2, tx1: CAVE_MOUTH_TX + 2, ty0: -1, ty1: 1 } as const;
/** The ladder out of the caverns: the wall-face tile above the entry hall. */
export const CAVE_EXIT_TILE = { tx: -423, ty: -447 } as const;

/** Resource nodes of the generated regions (seeded by src/lib/seed.ts);
 *  props and trees keep clear of them. */
export const REGION_NODES: RegionNode[] = [
  // Whisperwood, along the road
  { kind: "herb_patch", itemKey: "herb", tx: -200, ty: 4 }, { kind: "herb_patch", itemKey: "herb", tx: -262, ty: 10 },
  { kind: "berry_bush", itemKey: "berry", tx: -230, ty: 4 }, { kind: "berry_bush", itemKey: "berry", tx: -280, ty: 10 },
  { kind: "mushroom_ring", itemKey: "mushroom", tx: -250, ty: 4 },
  // The Greyspine pass
  { kind: "rock", itemKey: "stone", tx: -420, ty: 3 }, { kind: "rock", itemKey: "stone", tx: -455, ty: 11 },
  { kind: "rock", itemKey: "stone", tx: -500, ty: 3 }, { kind: "rock", itemKey: "stone", tx: -530, ty: 11 },
  { kind: "rock", itemKey: "stone", tx: -560, ty: 3 },
  // The Greyspine caverns
  { kind: "rock", itemKey: "stone", tx: -420, ty: -442 }, { kind: "rock", itemKey: "stone", tx: -480, ty: -450 },
  { kind: "rock", itemKey: "stone", tx: -470, ty: -441 }, { kind: "rock", itemKey: "stone", tx: -490, ty: -473 },
  { kind: "rock", itemKey: "stone", tx: -475, ty: -474 }, { kind: "rock", itemKey: "stone", tx: -517, ty: -447 },
  { kind: "mushroom_ring", itemKey: "mushroom", tx: -485, ty: -445 }, { kind: "mushroom_ring", itemKey: "mushroom", tx: -500, ty: -472 },
  { kind: "mushroom_ring", itemKey: "mushroom", tx: -515, ty: -443 },
];
/** Other spots that must stay open: river NPCs and the pier's dock. */
const KEEP_OPEN: [number, number][] = [[-632, 3], [-628, 11], [-615, 2], ...REGION_NODES.map((n): [number, number] => [n.tx, n.ty])];
function nearKeepOpen(tx: number, ty: number, r: number): boolean {
  return KEEP_OPEN.some(([x, y]) => Math.abs(x - tx) <= r && Math.abs(y - ty) <= r);
}

// ── Raised ground on the routes ──────────────────────────────────────────
/** Plateaus: one level up, a 2-row earth cliff facing the road (south),
 *  grassy rims on the other sides, stone stairs up from the road. */
const PLATEAUS = [
  { tx0: -112, tx1: -64, ty0: -7, ty1: 2, stairs: -88 }, // Western Meadow
  { tx0: -606, tx1: -586, ty0: -10, ty1: 2, stairs: -597 }, // east bank of the Silverrun
  { tx0: -800, tx1: -782, ty0: -9, ty1: 2, stairs: -792 }, // west of Brightwater
];
function plateauAt(tx: number, ty: number) {
  return PLATEAUS.find((p) => {
    return tx >= p.tx0 && tx <= p.tx1 && ty >= p.ty0 && ty <= p.ty1;
  }) ?? null;
}
/** Near a plateau's edge (within r tiles of its rim or face, either side). */
const nearPlateau = (tx: number, ty: number, r: number) =>
  PLATEAUS.some((p) => {
    const inOuter = tx >= p.tx0 - r && tx <= p.tx1 + r && ty >= p.ty0 - r && ty <= p.ty1 + r;
    const inInner = tx >= p.tx0 + r + 1 && tx <= p.tx1 - r - 1 && ty >= p.ty0 + r + 1 && ty <= p.ty1 - r - 3;
    return inOuter && !inInner;
  });

// ── Greyspine ────────────────────────────────────────────────────────────
const MOUNTAIN = { tx0: -576, tx1: -385 };
const PASS = { ty0: 2, ty1: 12 };

/** Blocky 0..max offset along one axis (changes every `step` tiles). */
function wobble(t: number, salt: number, max: number, step: number): number {
  return Math.floor(hash(Math.floor(t / step), salt) * (max + 1));
}

function inMountain(tx: number, ty: number): boolean {
  if (ty < BARRIER_TY0 || ty > BARRIER_TY1) return false;
  const west = MOUNTAIN.tx0 + wobble(ty, 11, 3, 4);
  const east = MOUNTAIN.tx1 - wobble(ty, 12, 3, 4);
  if (tx < west || tx > east) return false;
  // The pass: straight walls with a few bays, flat around the cave mouth.
  const flat = Math.abs(tx - CAVE_MOUTH_TX) <= 6;
  const top = PASS.ty0 - (flat ? 0 : wobble(tx, 13, 1, 7));
  const bottom = PASS.ty1 + (flat ? 0 : wobble(tx, 14, 1, 6));
  return !(ty >= top && ty <= bottom);
}

// ── Silverrun ────────────────────────────────────────────────────────────
// Its course (riverCenter) is shared with the continent, which carries it
// on north to its source lake and south to the sea.
/** Brightwater's pier: deck tiles reaching into the river from the west bank. */
export const PIER: TileBox = { tx0: -618, tx1: -614, ty0: 1, ty1: 2 };

// ── Caverns ──────────────────────────────────────────────────────────────
/** Open floor of the caverns: rooms and the tunnels joining them. */
export const CAVERN_FLOOR: ReadonlyArray<TileBox> = [
  { tx0: -432, tx1: -414, ty0: -446, ty1: -439 }, // entry hall (ladder up)
  { tx0: -462, tx1: -433, ty0: -444, ty1: -442 }, // east tunnel (mine rails)
  { tx0: -490, tx1: -463, ty0: -455, ty1: -439 }, // crystal hall
  { tx0: -481, tx1: -477, ty0: -470, ty1: -456 }, // north tunnel (mine rails)
  { tx0: -505, tx1: -466, ty0: -476, ty1: -471 }, // deep gallery
  { tx0: -509, tx1: -491, ty0: -447, ty1: -445 }, // west tunnel
  { tx0: -524, tx1: -510, ty0: -453, ty1: -440 }, // west den
];
const TUNNELS = [CAVERN_FLOOR[1], CAVERN_FLOOR[3], CAVERN_FLOOR[5]];
const CAVERNS = regionByKey("caverns");
const inCaverns = (tx: number, ty: number) => inBox(CAVERNS, tx, ty);

/** Cavern floor: the planned rooms and tunnels, with organic bulges one
 *  tile outside them. Bulges only add floor, so every room stays connected. */
function caveOpen(tx: number, ty: number): boolean {
  if (CAVERN_FLOOR.some((r) => inBox(r, tx, ty))) return true;
  for (const r of CAVERN_FLOOR) {
    const near = tx >= r.tx0 - 1 && tx <= r.tx1 + 1 && ty >= r.ty0 - 1 && ty <= r.ty1 + 1;
    if (near && hash(Math.floor(tx / 2), Math.floor(ty / 2), 37) < 0.4) return true;
  }
  return false;
}
/** Blocking cave props (crystals, stalagmites, crates): never in or beside
 *  tunnels, never next to the exit or a node. */
function caveProp(tx: number, ty: number): string | null {
  const room = CAVERN_FLOOR.find((r) => inBox(r, tx, ty));
  if (!room) return null;
  if (TUNNELS.some((r) => inBox({ tx0: r.tx0 - 1, tx1: r.tx1 + 1, ty0: r.ty0 - 1, ty1: r.ty1 + 1 }, tx, ty))) return null;
  if (Math.abs(tx - CAVE_EXIT_TILE.tx) <= 3 && ty - CAVE_EXIT_TILE.ty <= 4) return null;
  if (nearKeepOpen(tx, ty, 1)) return null;
  const h = hash(tx, ty, 38);
  // Crystals grow against the walls (along a room's top edge).
  if (ty === room.ty0 && !caveOpen(tx, ty - 1) && h < 0.22) return hash(tx, ty, 39) < 0.5 ? "crystal_blue" : "crystal_purple";
  const deep = tx > room.tx0 + 2 && tx < room.tx1 - 2 && ty > room.ty0 + 2 && ty < room.ty1 - 2;
  if (deep && h < 0.035) return "stalagmite";
  if (room === CAVERN_FLOOR[0] && ty === room.ty1 && (tx === room.tx0 || tx === room.tx0 + 1)) return "crate";
  return null;
}

// ── Vertex fields ────────────────────────────────────────────────────────

/** Paths: the road (vertex rows 6..9 → full tile rows 6..8) with worn
 *  edges, short paths to every door, and the back lanes. */
function pathV(vx: number, vy: number): boolean {
  if (roadV(vx, vy)) return true; // roads out to the continent's towns
  if (vx >= ROAD.tx0 && vx <= ROAD.tx1 + 1) {
    if (vy >= 6 && vy <= 9) return true;
    // The road widens gently here and there (a row more on either side).
    if (vy === 5 && noise(vx, 0, 9, 41) > 0.6) return true;
    if (vy === 10 && noise(vx, 0, 9, 61) > 0.6) return true;
  }
  for (const d of NORTH_DOORS) if (vx >= d && vx <= d + 1 && vy >= 3 && vy <= 6) return true;
  for (const d of SOUTH_DOORS) if (vx >= d && vx <= d + 1 && vy >= 22 && vy <= LANE_TY + 1) return true;
  for (const l of LANES) {
    if (vx >= l.tx0 && vx <= l.tx1 + 1 && vy >= LANE_TY && vy <= LANE_TY + 2) return true;
    if (vx >= l.joinTx && vx <= l.joinTx + 2 && vy >= 14 && vy <= LANE_TY + 2) return true;
  }
  return false;
}

/** Water: the Silverrun (7 corners wide → 6 full tiles) and three ponds. */
const PONDS = [
  { x: -292, y: 27, r: 4.2 }, // Hollowmere, behind the lane
  { x: -86, y: 16, r: 3.6 }, // Western Meadow
  { x: -250, y: -14, r: 4 }, // a Whisperwood glade
];
function waterV(vx: number, vy: number): boolean {
  if (vy >= BARRIER_TY0 && vy <= BARRIER_TY1 + 1) {
    const c = riverCenter(vy);
    if (vx >= c - 3 && vx <= c + 3) return true;
  }
  return PONDS.some((p) => Math.hypot(vx - p.x, (vy - p.y) * 1.2) <= p.r + (noise(vx, vy, 3, 42) - 0.5) * 0.6);
}

/** Gravel: the floor of the Greyspine pass, spilling out at both ends. */
function gravelV(vx: number, vy: number): boolean {
  if (vy < -1 || vy > 16) return false;
  const spill = 4 + noise(vx, vy, 3, 43) * 6;
  return vx >= MOUNTAIN.tx0 - spill && vx <= MOUNTAIN.tx1 + spill && Math.abs(vy - 7.5) <= 6.5 + noise(vx, vy, 3, 44) * 2;
}

/** Corridor half-width (tiles from the road's centre line) per stretch;
 *  tree walls stand beyond it. Null = no tree walls there. */
function corridorHalf(vx: number): number | null {
  if (vx > -52) return null; // keep the village edge open
  if (vx >= -120) return 11; // meadow
  if (vx >= -288) return 5; // Whisperwood hugs the road
  if (vx >= -384) return 15; // around Hollowmere
  if (vx >= -648) return null; // mountains, river: lone trees only
  return 15; // around Brightwater
}
/** Glades inside the tree walls (open grass), besides the oak grove. */
const GLADES = [{ x: -250, y: -14, r: 7 }, { x: -270, y: 28, r: 6 }, { x: -140, y: -22, r: 6 }];

function nearField(f: (vx: number, vy: number) => boolean, vx: number, vy: number, r: number): boolean {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (f(vx + dx, vy + dy)) return true;
  return false;
}
const nearPath = (vx: number, vy: number, r: number) => nearField(pathV, vx, vy, r);
const nearWater = (vx: number, vy: number, r: number) => nearField(waterV, vx, vy, r);

/** Lone trees dotted over open ground. */
const scatterTree = (vx: number, vy: number) => hash(vx, vy, 45) < 0.05;
const even = (n: number) => ((n % 2) + 2) % 2 === 0;

// Trees players have chopped down (src/lib/terrain/felled.ts): a felled
// tree is simply absent from the terrain — its tiles become open ground
// with a stump — until it regrows.
export { setFelledTrees };

/** Forest: tree walls framing the road, Whisperwood's woods, lone trees.
 *  Trees stand on corners of a 2-tile lattice, one big 2×2 tree each. */
function forestV(vx: number, vy: number): boolean {
  if (!even(vx) || !even(vy)) return false;
  if (isFelled(vx, vy)) return false;
  if (nearRoad(vx, vy, 1)) return false;
  if (townTree(vx, vy)) return true;
  if (vx < STRIP.tx0 || vx > -50 || vy < BARRIER_TY0 || vy > BARRIER_TY1) return false;
  if (vx >= -578 && vx <= -383) return false; // Greyspine
  if (vx >= -120 && vy >= 48) return false; // land lots and the way to them
  if (TOWNS.some((t) => inBox({ tx0: t.tx0 - 1, tx1: t.tx1 + 1, ty0: t.ty0 - 1, ty1: t.ty1 + 1 }, vx, vy))) return false;
  if (inBox({ tx0: FOREST_TILES.tx0 - 3, tx1: FOREST_TILES.tx1 + 3, ty0: FOREST_TILES.ty0 - 3, ty1: FOREST_TILES.ty1 + 3 }, vx, vy)) return false;
  if (nearKeepOpen(vx, vy, 2) || nearWater(vx, vy, 1) || gravelV(vx, vy) || nearPlateau(vx, vy, 2)) return false;
  const half = corridorHalf(vx);
  if (half !== null && Math.abs(vy - 7.5) > half + Math.floor(noise(vx, vy, 4, 46) * 4)) {
    return !GLADES.some((g) => Math.hypot(vx - g.x, vy - g.y) < g.r + noise(vx, vy, 2, 47) * 2);
  }
  return !nearPath(vx, vy, 2) && scatterTree(vx, vy);
}

/** The generated tree standing at lattice corner (vx, vy), or null. The
 *  heartland box's edges follow the lattice, so a corner's whole tree is
 *  on one side of it. */
export function treeAt(vx: number, vy: number): string | null {
  if (!inHeartland(vx, vy)) return continentTreeAt(vx, vy);
  return forestV(vx, vy) ? treeKind(vx, vy) : null;
}

/** Which tree grows at a forest corner: pines thicken toward the mountains. */
function treeKind(vx: number, vy: number): "oak" | "pine" {
  const pineShare = vx >= -288 && vx <= -121 ? 0.55 : vx >= -648 && vx <= -577 ? 0.35 : 0.12;
  return hash(vx, vy, 60) < pineShare ? "pine" : "oak";
}

/** Tall grass patches in the open stretches of the route. */
function tallV(vx: number, vy: number): boolean {
  if (vx < STRIP.tx0 || vx > -52) return false;
  if (vx >= -578 && vx <= -383) return false;
  if (TOWNS.some((t) => inBox(t, vx, vy))) return false;
  if (noise(vx, vy, 5, 48) < 0.66) return false;
  return !nearPath(vx, vy, 1) && !nearWater(vx, vy, 1) && !forestV(vx, vy) && !nearKeepOpen(vx, vy, 1) && !nearPlateau(vx, vy, 1);
}

/** 4-corner mask of a vertex field for tile (tx, ty): 1 NW, 2 NE, 4 SW, 8 SE. */
function mask(f: (vx: number, vy: number) => boolean, tx: number, ty: number): number {
  return (f(tx, ty) ? 1 : 0) | (f(tx + 1, ty) ? 2 : 0) | (f(tx, ty + 1) ? 4 : 0) | (f(tx + 1, ty + 1) ? 8 : 0);
}
const bits = (m: number) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
const auto = (family: string, m: number, tx: number, ty: number) =>
  m === 15 ? `${family}_15_${Math.floor(hash(tx, ty, 49) * 3)}` : `${family}_${m}`;

// ── Stamped places ───────────────────────────────────────────────────────
// Building stamps draw these areas, so the generator leaves them plain.
function underSquare(tx: number, ty: number): boolean {
  return TOWN_SQUARES.some((q) => tx >= q.tx + 1 && tx <= q.tx + 22 && ty >= q.ty && ty <= q.ty + 14);
}
const underCaveMouth = (tx: number, ty: number) => inBox(CAVE_MOUTH_AREA, tx, ty);
/** The ranch row (public/buildings/buildings.json `ranch_*`): pens stay
 *  free of rocks and bushes so animals and players can move about. */
const RANCH_ROW = { tx0: -120, tx1: 143, ty0: 75, ty1: 89 };

// ── Terrain ──────────────────────────────────────────────────────────────

/** Mountain terrace height: 0 on open ground, rising one tier every ~7
 *  rows away from the pass (north and south), so the north side shows
 *  stacked cliff faces and the south side a staircase of ledges. */
function height(tx: number, ty: number): number {
  if (plateauAt(tx, ty)) return 1;
  if (!inMountain(tx, ty)) return 0;
  const d = ty < PASS.ty0 ? PASS.ty0 - ty : ty - PASS.ty1; // rows into the mountain
  return 1 + Math.floor((Math.max(0, d - 1) + wobble(tx, ty < PASS.ty0 ? 15 : 16, 2, 5)) / 7);
}

/** True where the generated terrain is solid rock (mountain, cave walls). */
function solid(tx: number, ty: number): boolean {
  if (inCaverns(tx, ty)) return !caveOpen(tx, ty);
  return inMountain(tx, ty);
}

/** A plateau's edge tile (its face, stairs or rim), or null on its top or
 *  off it. Stairs are walkable; faces and rims block. */
function plateauEdge(tx: number, ty: number): TerrainCell | null {
  const p = plateauAt(tx, ty);
  if (!p) return null;
  const row = faceRow(tx, ty);
  if (row >= 0) {
    const part = row === 2 ? "base" : "top";
    if (tx === p.stairs || tx === p.stairs + 1) return { ground: grassFor(tx, ty), upper: `stairs_${part}_${tx === p.stairs ? "l" : "r"}` };
    const l = faceRow(tx - 1, ty) !== row || !plateauAt(tx - 1, ty), r = faceRow(tx + 1, ty) !== row || !plateauAt(tx + 1, ty);
    const name = `cliff_${part}`;
    return { ground: grassFor(tx, ty), lower: l && !r ? `${name}_l` : r && !l ? `${name}_r` : name };
  }
  if (!plateauAt(tx, ty - 1)) return { ground: grassFor(tx, ty), lower: "lip_n" };
  if (!plateauAt(tx - 1, ty)) return { ground: grassFor(tx, ty), lower: "lip_w" };
  if (!plateauAt(tx + 1, ty)) return { ground: grassFor(tx, ty), lower: "lip_e" };
  return null;
}

/** Cliff-face row of a mountain tile (0 top, 1 mid, 2 base) or -1: a
 *  three-row face wherever the ground in front (south) is lower. */
function faceRow(tx: number, ty: number): number {
  if (inCaverns(tx, ty)) return -1;
  const h = height(tx, ty);
  if (h === 0) return -1;
  if (height(tx, ty + 1) < h) return 2;
  if (plateauAt(tx, ty)) return height(tx, ty + 2) < h ? 0 : -1; // plateaus: 2-row faces (top, base)
  if (height(tx, ty + 2) < h) return 1;
  if (height(tx, ty + 3) < h) return 0;
  return -1;
}

function grassFor(tx: number, ty: number): string {
  return `grass_${Math.floor(hash(tx, ty, 50) * 4)}`;
}

/** What the generated world holds at world tile (tx, ty). */
export function terrainAt(tx: number, ty: number): TerrainCell {
  // ── Caverns: floor with props and rails; two-row lit wall faces.
  if (inCaverns(tx, ty)) {
    if (tx === CAVE_EXIT_TILE.tx && ty === CAVE_EXIT_TILE.ty) return { ground: "cave_ceiling" }; // the exit stamp
    if (caveOpen(tx, ty)) {
      const cell: TerrainCell = { ground: `cave_floor_${Math.floor(hash(tx, ty, 31) * 3)}` };
      const prop = caveProp(tx, ty);
      if (prop) cell.lower = prop;
      else if (ty === -443 && inBox(CAVERN_FLOOR[1], tx, ty)) cell.upper = "rail_h";
      else if (tx === -479 && inBox(CAVERN_FLOOR[3], tx, ty)) cell.upper = "rail_v";
      else {
        const h = hash(tx, ty, 34);
        if (h < 0.04) cell.upper = "rubble";
        else if (h < 0.06) cell.upper = "puddle";
        else if (h < 0.085) cell.upper = "glowshrooms";
      }
      return cell;
    }
    if (caveOpen(tx, ty + 1)) return { ground: "cave_ceiling", lower: hash(tx, ty, 32) < 0.1 ? "cave_torch" : "cave_face_base" };
    if (caveOpen(tx, ty + 2)) return { ground: "cave_ceiling", lower: "cave_face_top" };
    return { ground: "cave_ceiling", lower: "cave_ceiling" };
  }

  // ── Beyond the heartland: the generated continent (src/lib/continent.ts).
  if (!inHeartland(tx, ty)) return continentAt(tx, ty);

  // ── Greyspine: highland rock, layered faces with end caps, grassy lips.
  if (solid(tx, ty)) {
    if (underCaveMouth(tx, ty)) return { ground: "grass" }; // drawn and blocked by the stamp
    const row = faceRow(tx, ty);
    if (row >= 0) {
      const name = ["cliff_top", "cliff_mid", "cliff_base"][row];
      const l = faceRow(tx - 1, ty) !== row, r = faceRow(tx + 1, ty) !== row;
      return { ground: "grass", lower: l && !r ? `${name}_l` : r && !l ? `${name}_r` : name };
    }
    const h = height(tx, ty);
    if (height(tx, ty - 1) < h) return { ground: "grass", lower: "lip_n" };
    if (height(tx - 1, ty) < h) return { ground: "grass", lower: "lip_w" };
    if (height(tx + 1, ty) < h) return { ground: "grass", lower: "lip_e" };
    // Terrace tops: rock with patches of highland grass, boulders, shrubs.
    // Terrace tops: highland grass with rock showing through, a few
    // boulders, shrubs and pines.
    const v = hash(tx, ty, 33);
    const top: TerrainCell = { ground: "grass", lower: `highland_${v < 0.8 ? 0 : v < 0.9 ? 1 : 2}` };
    const p = hash(tx, ty, 59);
    if (p < 0.03) top.prop = "boulder";
    else if (p < 0.06) top.prop = "shrub";
    else if (p < 0.075) top.prop = "rock_small";
    return top;
  }

  const edge = plateauEdge(tx, ty);
  if (edge) return edge;

  // ── Open ground: water, gravel or grass; then paths, trees, decor.
  const wm = mask(waterV, tx, ty);
  const gm = wm ? 0 : mask(gravelV, tx, ty);
  const cell: TerrainCell = { ground: wm ? auto("water", wm, tx, ty) : gm ? auto("gravel", gm, tx, ty) : grassFor(tx, ty) };
  const pm = underSquare(tx, ty) ? 0 : mask(pathV, tx, ty);
  const onRoadRows = ty >= ROAD.ty0 && ty <= ROAD.ty1 && tx >= ROAD.tx0 && tx <= ROAD.tx1;

  if (wm) {
    // The bridge carries the road; rails on the rows either side.
    if (onRoadRows || roadTile(tx, ty)) return { ...cell, upper: "bridge_deck" };
    if (ty === ROAD.ty0 - 1 && tx >= ROAD.tx0 && tx <= ROAD.tx1) return { ...cell, lower: "bridge_rail_n" };
    if (ty === ROAD.ty1 + 1 && tx >= ROAD.tx0 && tx <= ROAD.tx1) return { ...cell, lower: "bridge_rail_s" };
    if (inBox(PIER, tx, ty)) return { ...cell, upper: tx === PIER.tx0 ? "pier_end" : "pier_deck" };
    if (bits(wm) >= 2) cell.collide = true;
    if (bits(wm) === 1 && hash(tx, ty, 51) < 0.35) cell.upper = "reeds";
    else if (wm === 15 && hash(tx, ty, 52) < 0.03) cell.upper = "lilypad";
    return cell;
  }
  // Posts where the bridge rails meet the banks.
  if ((ty === ROAD.ty0 - 1 || ty === ROAD.ty1 + 1) && tx >= ROAD.tx0 && tx <= ROAD.tx1 && (mask(waterV, tx + 1, ty) || mask(waterV, tx - 1, ty))) {
    return { ...cell, lower: ty === ROAD.ty0 - 1 ? "bridge_post_n" : "bridge_post_s" };
  }
  if (inBox(PIER, tx, ty)) return { ...cell, upper: "pier_deck" };
  if (inBox(QUAY, tx, ty) && !(ty >= ROAD.ty0 - 1 && ty <= ROAD.ty1 + 1)) {
    const deco = TOWN_DECOR.get(`${tx},${ty}`);
    return { ...cell, upper: "pier_deck", ...(deco?.lower ? { lower: deco.lower } : {}) };
  }

  if (pm) cell.upper = auto("path", pm, tx, ty);
  const deco = TOWN_DECOR.get(`${tx},${ty}`);
  if (deco && !pm) return { ...cell, ...deco };
  // A soft shadow cast by a cliff face onto the ground below it.
  if (!pm && faceRow(tx, ty - 1) === 2) cell.upper = "cliff_shadow";
  if (cell.upper === "cliff_shadow") return cell;

  const fm = mask(forestV, tx, ty);
  if (fm) {
    // A tree's lower half (crown bottom + trunk) blocks. Its upper half is
    // walkable and drawn over you — unless another tree stands right above
    // it (inside a wood), where it blocks too so woods can't be walked into.
    const treeAbove = (fm & 4 && forestV(tx, ty - 1)) || (fm & 8 && forestV(tx + 1, ty - 1));
    // The lattice puts exactly one tree corner on a tile.
    const [vx, vy] = fm & 1 ? [tx, ty] : fm & 2 ? [tx + 1, ty] : fm & 4 ? [tx, ty + 1] : [tx + 1, ty + 1];
    const name = `tree_${treeKind(vx, vy)}_${fm}`;
    if (fm & 3 || treeAbove) cell.lower = name;
    else cell.canopy = name;
    return cell;
  }
  // A felled tree leaves its stump (walkable) where the trunk stood.
  if (!cell.upper && isFelled(tx, ty)) return { ...cell, upper: "stump" };
  if (cell.upper) return cell;

  const tm = mask(tallV, tx, ty);
  if (tm) return { ...cell, upper: `tall_${tm}` };

  // Decor: flowers and tufts everywhere (more in town), a few props.
  if (!inBox(STRIP, tx, ty)) return cell;
  const town = TOWNS.some((t) => inBox(t, tx, ty));
  const h = hash(tx, ty, 53);
  if (gm) {
    if (gm === 15 && h < 0.035 && !nearPath(tx, ty, 2) && !nearKeepOpen(tx, ty, 1) && Math.abs(tx - CAVE_MOUTH_TX) > 4) cell.lower = "boulder";
    else if (h < 0.12) cell.upper = "pebbles";
    return cell;
  }
  if (!town && h < 0.012 && !inBox(RANCH_ROW, tx, ty) && !nearPath(tx, ty, 2) && !nearKeepOpen(tx, ty, 1) && !nearWater(tx, ty, 1)) {
    cell.lower = ["bush", "bush", "boulder", "stump", "rock_small"][Math.floor(hash(tx, ty, 54) * 5)];
    return cell;
  }
  const flowerP = town ? 0.07 : 0.035;
  if (h < flowerP) cell.upper = ["flowers_red", "flowers_yellow", "flowers_white", "flowers_blue", "flowers_pink"][Math.floor(hash(tx, ty, 55) * 5)];
  else if (h < flowerP + 0.1) cell.upper = ["tuft_0", "tuft_1", "clover", "tuft_0"][Math.floor(hash(tx, ty, 56) * 4)];
  else if (h < flowerP + 0.115) cell.upper = hash(tx, ty, 57) < 0.5 ? "pebbles" : "mushrooms";
  return cell;
}

/** True when a world tile can be walked on (terrain only; buildings add
 *  their own blocking). */
export function terrainWalkable(tx: number, ty: number): boolean {
  const c = terrainAt(tx, ty);
  return !c.lower && !c.collide;
}

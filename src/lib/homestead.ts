// Homesteads: one plot of land per player that grows, made of square
// parcels. Claiming a site gives you the first 2×2 parcels; every further
// parcel costs the same (PARCEL_PRICE) and must touch one you own, up to a
// cap that rises with your level. Each parcel's use (field, pasture,
// vineyard, orchard, barn, workshop) is the owner's choice and can be
// changed for free; a change clears that parcel. Pastures that touch make
// one pen, and the animals share their space.
//
// Pure rules here (numbers in one place, easy to tune); the server is
// src/lib/homesteadServer.ts.

import type { RanchSpecies } from "@/types/ranch";
import type { HomesteadRefusal, Parcel, ParcelBuilding, ParcelCell, ParcelSpot, ParcelUse, ParcelUseDef, UseChangeCost } from "@/types/homestead";
import type { RanchBuildKey } from "@/types/ranchGrowth";
import type { PlantSpot } from "@/types/garden";

export type { HomesteadRefusal, HomesteadSite, HomesteadView, Parcel, ParcelCell, ParcelUse, ParcelUseDef, UseChangeCost } from "@/types/homestead";

/** A parcel is this many tiles square. */
export const PARCEL_TILES = 10;
/** A site's grid: GRID × GRID parcels (the most anyone can hold). */
export const GRID = 6;
/** Tiles of lane between neighbouring sites. */
export const SITE_LANE = 4;
/** A site with its lane, in tiles. */
export const SITE_PITCH = GRID * PARCEL_TILES + SITE_LANE;
/** The parcels a new homestead starts with, free (the "homestead grant"). */
export const STARTER: readonly ParcelCell[] = [
  { col: 0, row: 0 }, { col: 1, row: 0 },
  { col: 0, row: 1 }, { col: 1, row: 1 },
];
/** Every parcel past the starter ones costs the same, like real land. */
export const PARCEL_PRICE = 60;
/** How many homesteads a player may hold. One for now; see canClaimHomestead. */
export const MAX_HOMESTEADS = 1;
/** Owners away this long lose their homestead (like lots). */
export const HOMESTEAD_INACTIVE_RELEASE_MS = 14 * 24 * 60 * 60 * 1000;

/** Parcels you may hold, by level: [from level, cap]. */
export const CAP_BY_LEVEL: readonly (readonly [number, number])[] = [
  [1, 4], [5, 6], [10, 9], [15, 12], [20, 16], [25, 20], [30, 25], [40, 36],
];

export const PARCEL_USES: Readonly<Record<ParcelUse, ParcelUseDef>> = {
  wild: { use: "wild", icon: "🌿", name: "Wild", blurb: "Bought, not set up yet. Pick what it'll be.", plots: 0, space: 0 },
  field: { use: "field", icon: "🌾", name: "Field", blurb: "16 beds for seeds: wheat, carrots, pumpkins…", plots: 16, space: 0 },
  pasture: { use: "pasture", icon: "🐔", name: "Pasture", blurb: "Room for animals: 8 hens, 4 sheep or 2 cows. Pastures side by side make one pen.", plots: 0, space: 8 },
  vineyard: { use: "vineyard", icon: "🍇", name: "Vineyard", blurb: "16 grapevines in four rows, fruiting again and again.", plots: 16, space: 0 },
  orchard: { use: "orchard", icon: "🍎", name: "Orchard", blurb: "8 fruit trees, close planted, that fruit again and again.", plots: 8, space: 0 },
  barn: { use: "barn", icon: "🏚️", name: "Barn", blurb: "Build your barn here, then a silo and feeder for your pastures, a mill, a cheese press, a loom, hives and a winery around it. Only one.", plots: 0, space: 0 },
  workshop: { use: "workshop", icon: "🪚", name: "Workshop", blurb: "Build your carpenter's workshop here, then its benches, and show your furniture in front. Only one.", plots: 0, space: 0 },
};
export const isParcelUse = (u: string): u is ParcelUse => u in PARCEL_USES;
/** Uses you can pick (wild is only where you start). */
export const SETTABLE_USES: readonly ParcelUse[] = ["field", "pasture", "vineyard", "orchard", "barn", "workshop"];
/** Uses a homestead has at most one parcel of (it has one barn and one workshop building). */
export const ONE_OF: readonly ParcelUse[] = ["barn", "workshop"];

/** Pasture space an animal takes. */
export const SPACE_OF: Readonly<Record<RanchSpecies, number>> = { chicken: 1, sheep: 2, cow: 4 };

/** Parcels allowed at `level`. */
export function capFor(level: number): number {
  let cap = CAP_BY_LEVEL[0][1];
  for (const [lv, c] of CAP_BY_LEVEL) if (level >= lv) cap = c;
  return Math.min(cap, GRID * GRID);
}

/** The next level that raises the cap, or null at the top. */
export function nextCapAt(level: number): { level: number; cap: number } | null {
  const next = CAP_BY_LEVEL.find(([lv]) => lv > level);
  return next ? { level: next[0], cap: next[1] } : null;
}

export const inGrid = (c: ParcelCell): boolean => c.col >= 0 && c.row >= 0 && c.col < GRID && c.row < GRID;
const same = (a: ParcelCell, b: ParcelCell) => a.col === b.col && a.row === b.row;
const touching = (a: ParcelCell, b: ParcelCell) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;

/** Does `c` share an edge with one of `owned`? */
export function adjacent(owned: readonly ParcelCell[], c: ParcelCell): boolean {
  return owned.some((o) => touching(o, c));
}

/** Cells that could be bought next: in the grid, not owned, touching an owned one. */
export function buyableCells(owned: readonly ParcelCell[]): ParcelCell[] {
  const out: ParcelCell[] = [];
  for (let row = 0; row < GRID; row++) for (let col = 0; col < GRID; col++) {
    const c = { col, row };
    if (!owned.some((o) => same(o, c)) && adjacent(owned, c)) out.push(c);
  }
  return out;
}

/** Can a player of `level` with `coins` buy `c` next to `owned`? */
export function canBuyParcel(owned: readonly ParcelCell[], c: ParcelCell, level: number, coins: number): HomesteadRefusal {
  if (!inGrid(c)) return "That's past your homestead's edge.";
  if (owned.some((o) => same(o, c))) return "You already own that parcel.";
  if (!adjacent(owned, c)) return "Buy land next to land you already own.";
  const cap = capFor(level);
  if (owned.length >= cap) {
    const next = nextCapAt(level);
    return next ? `You can hold ${cap} parcels for now. At level ${next.level}, ${next.cap}.` : `Your homestead is as big as it gets (${cap} parcels).`;
  }
  if (coins < PARCEL_PRICE) return `A parcel costs ${PARCEL_PRICE} coins.`;
  return null;
}

/** Pasture space a set of animals takes. */
export function spaceUsed(species: readonly string[]): number {
  return species.reduce((n, s) => n + (SPACE_OF[s as RanchSpecies] ?? 0), 0);
}

/** Pasture space all of a homestead's parcels give. */
export function spaceTotal(parcels: readonly Parcel[]): number {
  return parcels.reduce((n, p) => n + PARCEL_USES[p.use].space, 0);
}

/** Space left for more animals. */
export function spaceFree(parcels: readonly Parcel[], species: readonly string[]): number {
  return Math.max(0, spaceTotal(parcels) - spaceUsed(species));
}

/** Can one more `species` move in? */
export function canAddAnimal(parcels: readonly Parcel[], species: readonly string[], add: RanchSpecies): HomesteadRefusal {
  if (spaceTotal(parcels) === 0) return "Make a parcel a pasture first.";
  if (spaceFree(parcels, species) < SPACE_OF[add]) return "Your pastures are full. Make another parcel a pasture.";
  return null;
}

/**
 * What changing `cell` to `use` would clear: its crops, and any animals that
 * would no longer fit (which blocks the change until they're sold).
 * `cropsOn` = crops growing on that parcel now.
 */
export function changeCost(parcels: readonly Parcel[], cell: ParcelCell, use: ParcelUse, species: readonly string[], cropsOn: number): UseChangeCost {
  const after = parcels.map((p) => (same(p, cell) ? { ...p, use } : p));
  const over = spaceUsed(species) - spaceTotal(after);
  return { crops: cropsOn, animalsOver: Math.max(0, over) };
}

/** May the owner set `cell` to `use`? (The confirm shows changeCost first.) */
export function canSetUse(parcels: readonly Parcel[], cell: ParcelCell, use: ParcelUse, species: readonly string[]): HomesteadRefusal {
  const p = parcels.find((q) => same(q, cell));
  if (!p) return "You don't own that parcel.";
  if (!SETTABLE_USES.includes(use)) return "Pick what the parcel will be.";
  if (p.use === use) return "It's already that.";
  if (ONE_OF.includes(use) && parcels.some((q) => q.use === use)) return `You already have a ${PARCEL_USES[use].name.toLowerCase()} parcel. Change that one first.`;
  const { animalsOver } = changeCost(parcels, cell, use, species, 0);
  if (animalsOver > 0) return "Your animals need that pasture. Sell some or make another pasture first.";
  return null;
}

/** Pastures that touch form one pen: groups of parcels, each a list of cells. */
export function pens(parcels: readonly Parcel[]): Parcel[][] {
  const left = parcels.filter((p) => p.use === "pasture");
  const out: Parcel[][] = [];
  while (left.length) {
    const pen = [left.shift()!];
    for (let i = 0; i < pen.length; i++) {
      for (let j = left.length - 1; j >= 0; j--) if (touching(pen[i], left[j])) pen.push(...left.splice(j, 1));
    }
    out.push(pen);
  }
  return out;
}

/**
 * Can a player who holds `owned` homesteads (each with its parcel count and
 * the cap at their level) claim another? One per player today; when
 * MAX_HOMESTEADS rises, a new one only once every one they hold is full.
 */
export function canClaimHomestead(owned: readonly { parcels: number }[], level: number, max = MAX_HOMESTEADS): HomesteadRefusal {
  if (owned.length === 0) return null;
  if (owned.length >= max) return max === 1 ? "You already have a homestead. Give it up first." : `You already have ${owned.length} homesteads.`;
  const cap = capFor(level);
  if (owned.some((h) => h.parcels < cap)) return "Fill the homestead you have before starting another.";
  return null;
}

/** Top-left tile of a parcel in the world. */
export function parcelOrigin(site: { tx: number; ty: number }, c: ParcelCell): { tx: number; ty: number } {
  return { tx: site.tx + c.col * PARCEL_TILES, ty: site.ty + c.row * PARCEL_TILES };
}

/** The parcel of a site under a world tile, or null outside its grid. */
export function parcelAtTile(site: { tx: number; ty: number }, tx: number, ty: number): ParcelCell | null {
  const c = { col: Math.floor((tx - site.tx) / PARCEL_TILES), row: Math.floor((ty - site.ty) / PARCEL_TILES) };
  return inGrid(c) ? c : null;
}

/** A parcel's rectangle in world pixels. */
export function parcelRect(site: { tx: number; ty: number }, c: ParcelCell): { x: number; y: number; w: number; h: number } {
  const o = parcelOrigin(site, c);
  return { x: o.tx * 16, y: o.ty * 16, w: PARCEL_TILES * 16, h: PARCEL_TILES * 16 };
}

/** Is a world pixel on one of these owned parcels? (Actions need you on your homestead.) */
export function onParcels(site: { tx: number; ty: number }, parcels: readonly ParcelCell[], x: number, y: number): boolean {
  const c = parcelAtTile(site, Math.floor(x / 16), Math.floor(y / 16));
  return !!c && parcels.some((p) => same(p, c));
}

/**
 * Crop plots of a parcel: each one's bottom-centre anchor in pixels from the
 * parcel's top-left (where the crop stands). A field has 4 rows of 4 beds,
 * each bed two tiles wide on tile rows 2, 4, 6 and 8 (scripts/draw-parcels.mjs
 * draws the soil there); a vineyard four rows of four vines (32×40 px each);
 * an orchard eight trees in two staggered rows of four, close planted: the
 * crowns (~83 px wide, the trunk ~118 px below the top) overlap their
 * neighbours and reach a little over the side fences, but never over the
 * fence into the parcel above. Plot numbers are stable per use.
 */
export function plotOffsets(use: ParcelUse): { x: number; y: number }[] {
  if (use === "field") {
    const out: { x: number; y: number }[] = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out.push({ x: 32 + c * 32, y: 48 + r * 32 });
    return out;
  }
  if (use === "vineyard") return VINE_ROWS.flatMap((y) => [30, 62, 94, 126].map((x) => ({ x, y })));
  if (use === "orchard") return [...ORCHARD_BACK.map((x) => ({ x, y: 114 })), ...ORCHARD_FRONT.map((x) => ({ x, y: 158 }))];
  return [];
}

/** What a parcel's plots count as for planting rules (src/lib/vineyard.ts plantRule). */
export const PLANT_SPOT: Partial<Record<ParcelUse, PlantSpot>> = { field: "field", vineyard: "vineyard", orchard: "orchard" };

/** Where a lot's plot is, for planting: a home's garden, or its homestead parcel's use (null: nothing grows there). */
export function spotOfPlot(lot: { kind: string; parcels?: readonly Parcel[] }, plot: number): PlantSpot | null {
  if (lot.kind !== "homestead") return "garden";
  const { cell } = plotCell(plot);
  const p = lot.parcels?.find((q) => q.col === cell.col && q.row === cell.row);
  return p ? PLANT_SPOT[p.use] ?? null : null;
}

/** Base lines of a vineyard's four rows of vines (px from the parcel's top). */
const VINE_ROWS = [40, 80, 120, 160];
/** An orchard's trunks (px from the parcel's left): the back row, and the front row staggered half a gap. */
const ORCHARD_BACK = [7, 47, 87, 127], ORCHARD_FRONT = [27, 67, 107, 147];

/** Global plot number of a parcel's plot `i`: one homestead numbers all its plots. */
export const plotIndex = (c: ParcelCell, i: number): number => (c.row * GRID + c.col) * 64 + i;
/** The parcel and in-parcel index of a global plot number. */
export function plotCell(plot: number): { cell: ParcelCell; i: number } {
  const p = Math.floor(plot / 64);
  return { cell: { col: p % GRID, row: Math.floor(p / GRID) }, i: plot % 64 };
}

// ── Barn and workshop parcels ───────────────────────────────────────────
/** The barn (96×80 px) and the workshop (80×64 px) at the top of their parcels (scripts/draw-parcels.mjs). */
export const PARCEL_BUILDINGS: Readonly<Record<"barn" | "workshop", ParcelBuilding>> = {
  barn: { x: 32, y: 16, solid: { dx: 2, dy: 3, w: 6, h: 3 } },
  workshop: { x: 40, y: 16, solid: { dx: 3, dy: 2, w: 4, h: 3 } },
};
/** The building each use stands for, and the growth key that says it's built. */
export const BUILDING_KEY: Readonly<Record<"barn" | "workshop", RanchBuildKey>> = { barn: "hs_barn", workshop: "hs_workshop" };

/** Where each machine stands, by the parcel it belongs on (bottom-left px; clear of the building). */
export const PARCEL_SPOTS: Readonly<Partial<Record<RanchBuildKey, ParcelSpot & { on: "barn" | "workshop" }>>> = {
  silo: { on: "barn", x: 10, y: 96 }, mill: { on: "barn", x: 134, y: 96 },
  feeder: { on: "barn", x: 8, y: 122 }, press: { on: "barn", x: 26, y: 122 }, loom: { on: "barn", x: 44, y: 122 },
  hives: { on: "barn", x: 68, y: 122 }, fruit_press: { on: "barn", x: 100, y: 122 },
  cellar: { on: "barn", x: 8, y: 154 }, racks: { on: "barn", x: 44, y: 154 }, jam: { on: "barn", x: 74, y: 154 },
  saw: { on: "workshop", x: 6, y: 104 }, lathe: { on: "workshop", x: 40, y: 104 }, upholstery: { on: "workshop", x: 74, y: 104 }, varnish: { on: "workshop", x: 110, y: 104 },
};
/** The workshop's showroom: six spots in front of it (bottom-centre px). */
export const PARCEL_SHOWROOM: readonly ParcelSpot[] = [
  { x: 28, y: 132 }, { x: 80, y: 132 }, { x: 132, y: 132 },
  { x: 28, y: 158 }, { x: 80, y: 158 }, { x: 132, y: 158 },
];

/**
 * World tiles that the homestead's standing buildings block: the barn on its
 * barn parcel once built, the workshop on its workshop parcel. Server and
 * client walkability both read this (src/lib/chunkCollision.ts).
 */
export function buildingTiles(site: { tx: number; ty: number }, parcels: readonly Parcel[], built: readonly string[]): { tx: number; ty: number }[] {
  const out: { tx: number; ty: number }[] = [];
  for (const p of parcels) {
    if (p.use !== "barn" && p.use !== "workshop") continue;
    if (!built.includes(BUILDING_KEY[p.use])) continue;
    const o = parcelOrigin(site, p), s = PARCEL_BUILDINGS[p.use].solid;
    for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) out.push({ tx: o.tx + s.dx + dx, ty: o.ty + s.dy + dy });
  }
  return out;
}

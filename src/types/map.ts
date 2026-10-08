// The world map (src/lib/worldAtlas.ts): map tiles, fog of war, markers,
// waystones. Types only.

/** The part of the world (in chunks) the map renders; outside is blank. */
export type MapBounds = { cx0: number; cx1: number; cy0: number; cy1: number };

/** Seen chunks in one 8×8-chunk block: bit (cx%8) + 8·(cy%8), as a decimal string (64-bit). */
export type SeenBlock = { bx: number; by: number; mask: string };

/** A waystone on the map (world px), and whether you've attuned it. */
export type MapWaystone = { key: string; name: string; x: number; y: number; attuned: boolean };

/** A notable place on the map (world px). */
export type MapPlace = { kind: "inn" | "forge" | "cave" | "lair"; name: string; x: number; y: number };

/** One of your own lots (world px). */
export type MapLot = { kind: "home" | "land" | "ranch" | "vineyard" | "workshop" | "orchard"; name: string; x: number; y: number };

/** A region name and where to print it (world px). */
export type MapRegionLabel = { name: string; x: number; y: number };

/** Everything drawn over the map tiles. `version` busts the tile cache. */
export type MapMarkers = {
  version: string;
  bounds: MapBounds;
  waystones: MapWaystone[];
  places: MapPlace[];
  lots: MapLot[];
  regions: MapRegionLabel[];
};

/** Average colour (alpha-weighted RGB) and coverage (mean alpha 0–1) of each tile in a tileset image. */
export type TilesetColors = { rgb: Uint8Array; cov: Float32Array; columns: number };

/** The parts of a Tiled map / template the map renderer reads. */
export type MapSourceJson = {
  width?: number;
  layers: { name: string; data?: number[]; visible?: boolean }[];
  tilesets: { firstgid: number; image?: string; columns?: number; transparentcolor?: string }[];
};

/** The map viewer's camera: world-px centre and screen px per world tile. */
export type MapCamera = { x: number; y: number; scale: number };

/** The map panel's fog of war (MapPanel buildFog): an image with 1 px per
 *  chunk, and quick "explored?" lookups. */
export type MapFog = {
  canvas: HTMLCanvasElement;
  /** Is any chunk of this world-tile rectangle explored? */
  anySeenIn: (r: { tx: number; ty: number; tw: number; th: number }) => boolean;
  /** Is the chunk at world pixel (x, y) explored? */
  seenAtPx: (x: number, y: number) => boolean;
};

/** A box of world tiles (the map's bounds for zoom and panning). */
export type MapTileBox = { tx0: number; ty0: number; tx1: number; ty1: number };

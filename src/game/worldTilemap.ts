import type Phaser from "phaser";

// 3x3 chunk grid centered around chunk (0,0). The middle chunk lives at the
// center of the camera viewport.
export const CHUNK_COLS = [-1, 0, 1];
export const CHUNK_ROWS = [-1, 0, 1];
export const CHUNK_TILE_W = 24;
export const CHUNK_TILE_H = 15;
export const CHUNK_TILE_PX = 16;
export const CHUNK_PX_W = CHUNK_TILE_W * CHUNK_TILE_PX;
export const CHUNK_PX_H = CHUNK_TILE_H * CHUNK_TILE_PX;
export const WORLD_PX_W = CHUNK_COLS.length * CHUNK_PX_W;
export const WORLD_PX_H = CHUNK_ROWS.length * CHUNK_PX_H;

const TILESET_FILES: Array<{ name: string; file: string }> = [
  { name: "beginnertileset", file: "beginnertileset.png" },
  { name: "Floors", file: "Floors.png" },
  { name: "Props", file: "Props.png" },
  { name: "Roofs", file: "Roofs.png" },
  { name: "Shadows", file: "Shadows.png" },
  { name: "Walls", file: "Walls.png" },
  { name: "Floors_Tiles", file: "Floors_Tiles.png" },
  { name: "Rocks", file: "Rocks.png" },
  { name: "Trees_Size_03", file: "Trees_Size_03.png" },
  { name: "Furniture", file: "Furniture.png" },
];

// Render order matches the JSON layer array order, minus the Collision layer
// (server-side only, visible:false in Tiled, no visual contribution).
const LAYER_RENDER_ORDER: ReadonlyArray<string> = [
  "Ground",
  "GroundUpper",
  "DecorationLowerShadow",
  "DecorationLower",
  "DecorationMiddle",
  "DecorationMiddle1",
  "DecorationMiddle2",
  "DecorationUpperShadow",
  "DecorationUpper",
  "DecorationUpper1",
  "DecorationUpper2",
  "Overlay",
];

// Per-layer depth. All tile layers stay negative so buildings (drawn with
// positive depth at (b.ty + b.th) * TILE - 4) overlay correctly on top.
const LAYER_DEPTH: Readonly<Record<string, number>> = {
  Ground: -100,
  GroundUpper: -99,
  DecorationLowerShadow: -50,
  DecorationLower: -49,
  DecorationMiddle: -40,
  DecorationMiddle1: -39,
  DecorationMiddle2: -38,
  DecorationUpperShadow: -30,
  DecorationUpper: -29,
  DecorationUpper1: -28,
  DecorationUpper2: -27,
  Overlay: -5,
};

const SKIP_LAYERS = new Set(["Collision"]);

export function chunkKey(cx: number, cy: number): string {
  return `tilemap_${cx}_${cy}`;
}

// Shift the chunk grid so it fits inside the camera bounds 0,0..(1152x720)
// and the middle chunk (cx=0,cy=0) is centered on the camera viewport.
export function chunkOrigin(cx: number, cy: number): { x: number; y: number } {
  return {
    x: (cx - CHUNK_COLS[0]) * CHUNK_PX_W,
    y: (cy - CHUNK_ROWS[0]) * CHUNK_PX_H,
  };
}

export function loadTilemapAssets(scene: Phaser.Scene): void {
  for (const ts of TILESET_FILES) {
    scene.load.image(ts.name, `/assets/${ts.file}`);
  }
  for (const cx of CHUNK_COLS) {
    for (const cy of CHUNK_ROWS) {
      scene.load.tilemapTiledJSON(chunkKey(cx, cy), `/assets/maps/map_${cx}_${cy}.json`);
    }
  }
}

export function buildTilemap(scene: Phaser.Scene): void {
  for (const cx of CHUNK_COLS) {
    for (const cy of CHUNK_ROWS) {
      buildChunk(scene, cx, cy);
    }
  }
}

function buildChunk(scene: Phaser.Scene, cx: number, cy: number): void {
  const map = scene.make.tilemap({ key: chunkKey(cx, cy) });
  if (!map) {
    console.warn(`[worldTilemap] missing tilemap ${chunkKey(cx, cy)}`);
    return;
  }

  // Only register the tilesets this particular map references — Phaser warns
  // when addTilesetImage cannot find a matching tileset entry. map_0_0 only
  // uses beginnertileset, the others use the full set.
  const tilesets: Phaser.Tilemaps.Tileset[] = [];
  const referenced = new Set(map.tilesets.map((t) => t.name));
  for (const ts of TILESET_FILES) {
    if (!referenced.has(ts.name)) continue;
    const t = map.addTilesetImage(ts.name);
    if (t) tilesets.push(t);
  }

  const { x: ox, y: oy } = chunkOrigin(cx, cy);
  for (const name of LAYER_RENDER_ORDER) {
    if (SKIP_LAYERS.has(name)) continue;
    const layer = map.createLayer(name, tilesets, ox, oy);
    if (!layer) continue;
    layer.setDepth(LAYER_DEPTH[name] ?? -5);
  }
}

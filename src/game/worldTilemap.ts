import type Phaser from "phaser";
import {
  CHUNK_PX_H,
  CHUNK_PX_W,
  CHUNK_TILE_H,
  CHUNK_TILE_PX,
  CHUNK_TILE_W,
  chunkRegistered,
  registerChunk,
} from "@/lib/chunkCollision";

// Chunk tile geometry. The chunk world is unbounded: cx, cy ∈ ℤ. The
// constants and the cy-negated origin convention live in
// @/lib/chunkCollision so the collision registry and the renderer can never
// drift apart; they are re-exported here for existing importers.
export { CHUNK_TILE_W, CHUNK_TILE_H, CHUNK_TILE_PX, CHUNK_PX_W, CHUNK_PX_H };

// World-pixel origin of a chunk. (0, 0) is the top-left of chunk (0, 0). Y
// is negated because Phaser's screen-y grows downward while the chunk
// convention has cy=+1 pointing up.
export type ChunkOrigin = { x: number; y: number };

// One tile lifted out of a SORTED_LAYERS layer for Y-sort rendering.
// `objectId` is the tile's `objectId` Tiled property (undefined when the
// tile has no such property). Tiles that share an `objectId` belong to the
// same logical object — they're sorted together against the player using
// that object's deepest anchor. Tiles without `objectId` fall back to the
// spatial rule (same-column then chunk-wide max).
export type LiftedTile = {
  layerName: string;
  tileIndex: number;
  gid: number;
  objectId?: string;
};

// Per-objectId anchor: the deepest tile-y (in the chunk's local row
// coordinate) for tiles in ANCHOR_LAYERS that carry the matching
// `objectId`. -1 means "no anchor found for this object in this chunk."
type AnchorByObjectId = Map<string, number>;

// Result of loading a chunk: the parsed tilemap plus the data needed to
// (re-)instantiate Y-sorted sprites from the SORTED_LAYERS layers.
//
// `anchorByObjectId` maps each `objectId` to the deepest ANCHOR_LAYERS
// tile-y in the chunk. Lifted tiles with the same `objectId` sort at
// `(anchor + 1) * TILE_PX`. Tiles without an `objectId` use the
// spatial fallback (see findAnchorYForLiftedTile).
export type ChunkLoadResult = {
  tilemap: Phaser.Tilemaps.Tilemap | null;
  sortedTiles: LiftedTile[];
  anchorGrid: AnchorGrid;
  anchorByObjectId: AnchorByObjectId;
};

// Per-tile depth anchor grid, indexed by `tx + ty * CHUNK_TILE_W`. Each
// cell holds the bottom-most tile-y in ANCHOR_LAYERS for that chunk
// position, or -1 if no anchor tile exists there.
//
// ANCHOR_LAYERS covers DecorationLower* and DecorationMiddle* (see the
// constant's comment for why). The lookup for a lifted DecorationUpper*
// tile (see findAnchorYForLiftedTile) walks down the same column first,
// then falls back to the chunk-wide max y when no same-column anchor
// exists. This handles both authoring conventions:
//
//   - Same-column bodies (rock body+top, tree trunk+canopy,
//     wall+central roof): the same-column anchor is the right depth.
//   - Asymmetric decorations (cabin eaves overhanging past the wall,
//     big container lid wider than its base, banner top overhanging
//     past its post): the lifted tile is in a column with no anchor;
//     the chunk-wide max anchors to the deepest object in the chunk.
//
// No shape inference, no GID/tileset hardcoding, no heuristic radius
// search. New decorations work without code changes.
export type AnchorGrid = Int32Array;

// Layers that should be Y-sorted against the player instead of drawn at a
// fixed depth. Every tile in these layers is lifted out of the static
// tilemap and rendered as an individual GameObject whose depth is
// derived from AnchorGrid — see that type's comment for the rule.
const SORTED_LAYERS: ReadonlySet<string> = new Set([
  "DecorationUpper",
  "DecorationUpper1",
  "DecorationUpper2",
]);

// Layers scanned to compute AnchorGrid. Tiles in these layers are NOT
// lifted; they stay on their static layer rendered behind the character
// band. We just read their y position to find each chunk cell's "base"
// depth anchor.
//
// We include both DecorationMiddle* (wall tier — tree trunks, building
// walls, cabin walls) and DecorationLower* (ground tier — rock bodies,
// low walls, fence posts) so vertically-split decorations at any height
// pair correctly. DecorationLowerShadow is excluded because shadows are
// ground-level effects that don't represent a "base" for any Upper-layer
// object — the shadow is just a visual cue under the player.
const ANCHOR_LAYERS: ReadonlySet<string> = new Set([
  "DecorationLower",
  "DecorationMiddle",
  "DecorationMiddle1",
  "DecorationMiddle2",
]);

// Layers that exist as data-only markers (server-side collision,
// interaction anchors) — never rendered.
const SKIP_LAYERS: ReadonlySet<string> = new Set(["Collision", "Interactive"]);

// Render order matches the JSON layer array order, minus the data-only
// SKIP_LAYERS and minus SORTED_LAYERS (whose tiles are lifted to
// per-tile sprites so they sort with the character band).
const LAYER_RENDER_ORDER: ReadonlyArray<string> = [
  "Ground",
  "GroundUpper",
  "DecorationLowerShadow",
  "DecorationLower",
  "DecorationMiddle",
  "DecorationMiddle1",
  "DecorationMiddle2",
  "DecorationUpperShadow",
  "Overlay",
];

export { LAYER_RENDER_ORDER, SKIP_LAYERS, SORTED_LAYERS };

// Depth bands. Y-sorted objects (characters, critters, items, buildings,
// lifted canopy tiles) use DEPTH_CHAR_BASE + world-y so ground layers
// always sit under them.
export const DEPTH_CHAR_BASE = 100_000;
export const DEPTH_CANOPY = 500_000;

// Fallback depth for any static layer missing from LAYER_DEPTH (defensive
// only — every layer in LAYER_RENDER_ORDER should have an entry).
export const FALLBACK_LAYER_DEPTH = -5;

// Per-layer depth for the static layers. DecorationMiddle* sits BELOW the
// character band so the player always renders in front of trunks and low
// decor. SORTED_LAYERS entries are intentionally absent — see
// instantiateSortedTile for their Y-sort rule.
const LAYER_DEPTH: Readonly<Record<string, number>> = {
  Ground: -100,
  GroundUpper: -99,
  DecorationLowerShadow: -50,
  DecorationLower: -49,
  DecorationMiddle: -40,
  DecorationMiddle1: -39,
  DecorationMiddle2: -38,
  DecorationUpperShadow: -30,
  Overlay: DEPTH_CANOPY,
};

export { LAYER_DEPTH };

const TILESET_FILES: ReadonlyArray<{ name: string; file: string }> = [
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

// 5×5 chunk window centered on (cx, cy). Unbounded — no includes() filter,
// because the chunk world extends to ±Infinity. Radius 2 (not 1) so the
// loaded area always overflows the camera viewport at the minimum allowed
// zoom.
const WINDOW_RADIUS = 2;

export function chunkKey(cx: number, cy: number): string {
  return `tilemap_${cx}_${cy}`;
}

export function chunkOrigin(cx: number, cy: number): ChunkOrigin {
  return { x: cx * CHUNK_PX_W, y: -cy * CHUNK_PX_H };
}

export function chunkCenter(cx: number, cy: number): ChunkOrigin {
  const { x, y } = chunkOrigin(cx, cy);
  return { x: x + CHUNK_PX_W / 2, y: y + CHUNK_PX_H / 2 };
}

// Convert world pixel coords into a chunk coord. Unbounded: any (x, y) maps
// to a unique (cx, cy) ∈ ℤ×ℤ.
export function chunkAtPixel(x: number, y: number): { cx: number; cy: number } {
  return {
    cx: Math.floor(x / CHUNK_PX_W),
    cy: -Math.floor(y / CHUNK_PX_H),
  };
}

// Camera bounds are clamped only when a caller wants a finite view;
// recenterCamera deliberately does not, so the world grows with the player.
export function worldExtent(): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  return {
    minX: Number.NEGATIVE_INFINITY,
    minY: Number.NEGATIVE_INFINITY,
    maxX: Number.POSITIVE_INFINITY,
    maxY: Number.POSITIVE_INFINITY,
  };
}

export function getActiveWindow(
  _scene: Phaser.Scene,
  { cx, cy }: { cx: number; cy: number },
): { chunks: Array<{ cx: number; cy: number }> } {
  const chunks: Array<{ cx: number; cy: number }> = [];
  for (let dx = -WINDOW_RADIUS; dx <= WINDOW_RADIUS; dx++) {
    for (let dy = -WINDOW_RADIUS; dy <= WINDOW_RADIUS; dy++) {
      chunks.push({ cx: cx + dx, cy: cy + dy });
    }
  }
  return { chunks };
}

// Preload the tileset PNGs. Chunk JSONs are streamed lazily via loadChunk
// so any (cx, cy) can be added without changing the preload queue.
export function loadTilemapAssets(scene: Phaser.Scene): void {
  for (const ts of TILESET_FILES) {
    scene.load.image(ts.name, `/assets/${ts.file}`);
  }
}

// Streaming state. The tilemap + tilesets are kept cached per chunk so
// re-entry only re-creates the layers (cheap), not the tileset registration
// (which warns on duplicate adds).
type ChunkState = {
  tilemap: Phaser.Tilemaps.Tilemap;
  tilesets: Phaser.Tilemaps.Tileset[];
  layers: Map<string, Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer>;
  sortedSprites: Phaser.GameObjects.Image[];
  sortedTiles: LiftedTile[];
  anchorGrid: AnchorGrid;
  anchorByObjectId: AnchorByObjectId;
};

const chunkStates = new Map<string, ChunkState>();

// In-flight lazy loads keyed by cache key. Concurrent callers awaiting the
// same chunk share one Promise and one network request.
const inFlightLoads = new Map<string, Promise<ChunkLoadResult>>();

/**
 * Drop all module-global chunk/render state. These maps outlive a Phaser
 * scene instance, so when the scene is destroyed and recreated (React
 * StrictMode double-mount, HMR, "restart scene") they would otherwise
 * still hold tilemaps and sprites owned by the DEAD scene. Reusing those
 * throws inside Phaser ("Cannot read properties of null"). Call this on
 * scene shutdown and at the top of create().
 */
export function resetChunkState(): void {
  chunkStates.clear();
  inFlightLoads.clear();
  sortedTextureCache.clear();
}

// Phaser scene status values (src/scene/const.js). SHUTDOWN and above mean
// the scene must not be drawn to.
const SCENE_SHUTDOWN = 8;

/**
 * True when a scene can still be attached to.
 *
 * Note we do NOT use `sys.isActive()` — that is only true for RUNNING (5),
 * but the initial map build runs inside `create()`, when the status is
 * CREATING (4). Using isActive() there made the first chunk load bail and
 * the map only appeared after login drove a later re-render. Anything below
 * SHUTDOWN (8) is usable; SHUTDOWN/DESTROYED (9) are not.
 */
function sceneAlive(scene: Phaser.Scene): boolean {
  const sys = scene?.sys as Phaser.Scenes.Systems | undefined;
  const status = sys?.settings?.status;
  return typeof status === "number" && status < SCENE_SHUTDOWN;
}

// Run the one-pass extractor on a cached JSON. The pass:
//   - lifts every non-zero tile from a SORTED_LAYERS entry (recording it
//     and zeroing the GID in the JSON so the static layer draws nothing),
//   - records the bottom-most tile-y in ANCHOR_LAYERS at each chunk
//     cell, producing the AnchorGrid each lifted tile uses to find its
//     sort anchor.
//
// We work on the raw JSON rather than parsed LayerData because Phaser 4's
// LayerData.data is a Tile[][] — by the time the Tilemap exists, the
// original GID array is gone. Mutating the JSON before
// scene.make.tilemap({ key }) is the only window where we still have it.
//
// Idempotent: the second call sees all-zero SORTED_LAYERS GIDs (because
// we zeroed them on the first call) and produces an empty sortedTiles list,
// so a cache-hit loadChunk behaves like the network path on re-entry.
//
// Exported so buildingStamps.ts can apply the same lift/anchor pass to
// building template JSONs (which use the same layer schema as chunks).
export function parseCachedTilemap(scene: Phaser.Scene, key: string): ChunkLoadResult {
  const entry = scene.sys.cache.tilemap.get(key) as { data?: unknown } | undefined;
  const json = entry?.data ?? entry;
  if (!json) {
    return {
      tilemap: null,
      sortedTiles: [],
      anchorGrid: emptyAnchorGrid(),
      anchorByObjectId: new Map(),
    };
  }
  const { sortedTiles, anchorGrid, anchorByObjectId } = extractFromChunkJson(json);
  const tilemap = scene.make.tilemap({ key }) ?? null;
  return { tilemap, sortedTiles, anchorGrid, anchorByObjectId };
}

function emptyAnchorGrid(): AnchorGrid {
  return new Int32Array(CHUNK_TILE_W * CHUNK_TILE_H).fill(-1);
}

// Stream a single chunk's Tiled JSON via the on-demand API. The API serves a
// hand-authored file when present and otherwise generates a default empty
// chunk, so every (cx, cy) is reachable without a static asset on disk.
// Idempotent: a chunk already in the tilemap cache short-circuits and
// re-uses the cached JSON.
export function loadChunk(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
): Promise<ChunkLoadResult> {
  const key = chunkKey(cx, cy);
  if (scene.sys.cache.tilemap.exists(key)) {
    return Promise.resolve(parseCachedTilemap(scene, key));
  }
  const inflight = inFlightLoads.get(key);
  if (inflight) return inflight;

  const promise = new Promise<ChunkLoadResult>((resolve) => {
    const onComplete = (loadedKey: string) => {
      if (loadedKey !== key) return;
      cleanup();
      resolve(parseCachedTilemap(scene, key));
    };
    const onError = (file: { key?: string } | undefined) => {
      if (!file || file.key !== key) return;
      cleanup();
      console.warn(`[worldTilemap] failed to load chunk ${key} (url=${`/api/chunks/${cx}/${cy}`})`);
      resolve({ tilemap: null, sortedTiles: [], anchorGrid: emptyAnchorGrid(), anchorByObjectId: new Map() });
    };
    const cleanup = () => {
      scene.load.off("filecomplete", onComplete);
      scene.load.off("loaderror", onError);
    };
    scene.load.on("filecomplete", onComplete);
    scene.load.on("loaderror", onError);
    scene.load.tilemapTiledJSON(key, `/api/chunks/${cx}/${cy}`);
    if (!scene.load.isLoading()) scene.load.start();
  });
  inFlightLoads.set(key, promise);
  void promise.finally(() => inFlightLoads.delete(key));
  return promise;
}

function extractFromChunkJson(
  json: unknown,
): {
  sortedTiles: LiftedTile[];
  anchorGrid: AnchorGrid;
  anchorByObjectId: AnchorByObjectId;
} {
  const layers = (json as { layers?: unknown })?.layers;
  const sortedTiles: LiftedTile[] = [];
  const anchorGrid = emptyAnchorGrid();
  const anchorByObjectId = new Map<string, number>();
  if (!Array.isArray(layers)) {
    return { sortedTiles, anchorGrid, anchorByObjectId };
  }
  // Build a per-tileset "tile-id → objectId" lookup from the JSON's
  // tilesets array. We support two layouts: the `tiles: [{id, properties}]`
  // shape Tiled writes when per-tile properties exist, and the
  // `tileproperties: {"<id>": {objectId: "..."}}` legacy shape.
  const objectIdByTile = buildObjectIdLookup(json);
  for (const layer of layers) {
    const typed = layer as { name?: unknown; type?: unknown; data?: unknown };
    if (typeof typed.name !== "string" || typed.type !== "tilelayer") continue;
    const lift = SORTED_LAYERS.has(typed.name);
    const anchor = ANCHOR_LAYERS.has(typed.name);
    if (!lift && !anchor) continue;
    const data = typed.data;
    if (!Array.isArray(data)) continue;
    for (let i = 0; i < data.length; i++) {
      const gid = data[i] & 0x1fffffff; // strip Tiled flip/rotate flags
      if (gid <= 0) continue;
      const ty = tyFromIndex(i);
      const tileId = gidToTileId(gid, json);
      const objectId = tileId !== undefined ? objectIdByTile.get(tileId) : undefined;
      if (anchor && (anchorGrid[i] < 0 || ty > anchorGrid[i])) {
        anchorGrid[i] = ty;
      }
      if (anchor && objectId) {
        const prev = anchorByObjectId.get(objectId);
        if (prev === undefined || ty > prev) anchorByObjectId.set(objectId, ty);
      }
      if (lift) {
        sortedTiles.push({
          layerName: typed.name,
          tileIndex: i,
          gid,
          objectId,
        });
        // Zero so Phaser's parse produces an empty cell there.
        data[i] = 0;
      }
    }
  }
  return { sortedTiles, anchorGrid, anchorByObjectId };
}

// Resolve a chunk-local GID to a tileset-relative tile-id by finding
// the tileset with the largest firstgid ≤ gid. Returns undefined if no
// tileset matches (an unknown GID — should not happen for tiles lifted
// from a known layer, but we guard against it rather than throw).
function gidToTileId(gid: number, json: unknown): number | undefined {
  const tilesets = (json as { tilesets?: unknown })?.tilesets;
  if (!Array.isArray(tilesets)) return undefined;
  let best: { firstgid: number; tileid: number } | null = null;
  for (const ts of tilesets) {
    const typed = ts as { firstgid?: unknown };
    if (typeof typed.firstgid !== "number") continue;
    if (typed.firstgid <= gid && (!best || typed.firstgid > best.firstgid)) {
      best = { firstgid: typed.firstgid, tileid: gid - typed.firstgid };
    }
  }
  return best?.tileid;
}

// Build a tile-id → objectId lookup from the JSON's tilesets array.
// Supports both modern (`tiles[].properties`) and legacy
// (`tileproperties[id]`) Tiled shapes.
function buildObjectIdLookup(json: unknown): Map<number, string> {
  const out = new Map<number, string>();
  const tilesets = (json as { tilesets?: unknown })?.tilesets;
  if (!Array.isArray(tilesets)) return out;
  for (const ts of tilesets) {
    const typed = ts as {
      firstgid?: unknown;
      tiles?: unknown;
      tileproperties?: unknown;
    };
    const firstgid = typeof typed.firstgid === "number" ? typed.firstgid : 0;
    // Modern: tiles[] array on each tileset entry.
    if (Array.isArray(typed.tiles)) {
      for (const tile of typed.tiles) {
        const t = tile as { id?: unknown; properties?: unknown };
        if (typeof t.id !== "number" || !Array.isArray(t.properties)) continue;
        for (const prop of t.properties) {
          const p = prop as { name?: unknown; value?: unknown };
          if (p.name === "objectId" && typeof p.value === "string") {
            out.set(firstgid + t.id, p.value);
          }
        }
      }
    }
    // Legacy: tileproperties map at the tileset level.
    if (typed.tileproperties && typeof typed.tileproperties === "object") {
      const tp = typed.tileproperties as Record<string, { objectId?: unknown }>;
      for (const [k, v] of Object.entries(tp)) {
        const id = Number.parseInt(k, 10);
        if (Number.isFinite(id) && typeof v?.objectId === "string") {
          out.set(firstgid + id, v.objectId);
        }
      }
    }
  }
  return out;
}

function tyFromIndex(i: number): number {
  return (i - (i % CHUNK_TILE_W)) / CHUNK_TILE_W;
}

function buildChunkState(
  tilemap: Phaser.Tilemaps.Tilemap,
  sortedTiles: LiftedTile[],
  anchorGrid: AnchorGrid,
  anchorByObjectId: AnchorByObjectId,
): ChunkState {
  return {
    tilemap,
    tilesets: registerReferencedTilesets(tilemap, PRELOADED_TILESET_NAMES),
    layers: new Map(),
    sortedSprites: [],
    sortedTiles,
    anchorGrid,
    anchorByObjectId,
  };
}

// Register the tilesets this particular map references. Phaser warns on
// addTilesetImage when the named tileset isn't already loaded, so we
// only register the ones the map actually uses. Chunks filter against
// the preload-time TILESET_FILES list (so we never try to register a
// tileset that wasn't preloaded); buildings register whatever the
// template references directly.
export function registerReferencedTilesets(
  tilemap: Phaser.Tilemaps.Tilemap,
  allow?: ReadonlySet<string>,
): Phaser.Tilemaps.Tileset[] {
  const referenced = new Set(tilemap.tilesets.map((t) => t.name));
  const names = allow ? [...referenced].filter((n) => allow.has(n)) : [...referenced];
  const tilesets: Phaser.Tilemaps.Tileset[] = [];
  for (const name of names) {
    const t = tilemap.addTilesetImage(name);
    if (t) tilesets.push(t);
  }
  return tilesets;
}

const PRELOADED_TILESET_NAMES = new Set(TILESET_FILES.map((ts) => ts.name));

function buildChunkLayers(state: ChunkState, origin: ChunkOrigin): void {
  createStaticLayers(
    state.tilemap,
    state.tilesets,
    origin,
    "chunk",
    state.layers,
  );
  instantiateSortedSprites(
    state.tilemap.scene as Phaser.Scene,
    state.tilesets,
    state.sortedTiles,
    state.anchorGrid,
    state.anchorByObjectId,
    origin,
    state.sortedSprites,
  );
}

// Create the static layers from LAYER_RENDER_ORDER, skipping layers whose
// GIDs were already zeroed (SORTED_LAYERS) or marked data-only
// (SKIP_LAYERS). Exported so buildingStamps.ts can render templates with
// the same depth scheme as chunks.
export function createStaticLayers(
  tilemap: Phaser.Tilemaps.Tilemap,
  tilesets: Phaser.Tilemaps.Tileset[],
  origin: ChunkOrigin,
  layerNamePrefix: string,
  out?: Map<string, Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer>,
): void {
  for (const name of LAYER_RENDER_ORDER) {
    if (SKIP_LAYERS.has(name)) continue;
    if (out?.has(name)) continue;
    if (tilemap.getLayerIndex(name) === null) continue;
    const layer = tilemap.createLayer(name, tilesets, origin.x, origin.y);
    if (!layer) continue;
    layer.setDepth(LAYER_DEPTH[name] ?? FALLBACK_LAYER_DEPTH);
    layer.name = `${layerNamePrefix}_${name}`;
    out?.set(name, layer);
  }
}

// Instantiate one Y-sorted sprite per lifted upper-layer tile at `origin`.
// Sprites are appended to `out`. Exported so buildingStamps.ts can render
// template roofs / awnings with the same depth rule as chunk canopies.
//
// Sort depth for each lifted tile:
//   1. If the lifted tile has an `objectId` AND `anchorByObjectId` has an
//      entry for it, use that object-anchor's bottom edge. Every tile in
//      the same object sorts at the same depth.
//   2. Otherwise, fall back to the spatial rule (same-column anchor,
//      chunk-wide max) via the per-cell anchorGrid.
export function instantiateSortedSprites(
  scene: Phaser.Scene,
  tilesets: ReadonlyArray<Phaser.Tilemaps.Tileset>,
  liftedTiles: ReadonlyArray<LiftedTile>,
  anchorGrid: AnchorGrid,
  anchorByObjectId: AnchorByObjectId,
  origin: ChunkOrigin,
  out: Phaser.GameObjects.Image[],
): void {
  for (const tile of liftedTiles) {
    const sprite = instantiateSortedTile(scene, tile, tilesets, anchorGrid, anchorByObjectId, origin);
    if (sprite) out.push(sprite);
  }
}

// Convert a (tx, ty) tile-grid coordinate into world-pixel origin. Used by
// building stamping, which places templates at (tx, ty) tile positions
// expressed in a flat world tile grid (not chunk indices). Distinct from
// chunkOrigin, which converts chunk indices into the world chunk grid.
export function tileOrigin(tx: number, ty: number): ChunkOrigin {
  return { x: tx * CHUNK_TILE_PX, y: ty * CHUNK_TILE_PX };
}

// Find the tileset that owns a given GID. Tiled packs GIDs as
// firstgid + localId, so the owner is the tileset with the largest
// firstgid ≤ gid. Returns null when no tileset matches (an unknown GID —
// should not happen for tiles lifted from a known layer, but we guard
// against it rather than throw).
function findTilesetForGid(
  gid: number,
  tilesets: ReadonlyArray<Phaser.Tilemaps.Tileset>,
): Phaser.Tilemaps.Tileset | null {
  let owner: Phaser.Tilemaps.Tileset | null = null;
  for (const ts of tilesets) {
    if (ts.firstgid <= gid && (!owner || ts.firstgid > owner.firstgid)) owner = ts;
  }
  return owner;
}

// Cache of one canvas-texture per unique source-tile. Two lifted tiles that
// reference the same (tileset, sourceX, sourceY) share the canvas.
const sortedTextureCache = new Map<string, Phaser.Textures.Texture>();

function getOrCreateTileTexture(
  scene: Phaser.Scene,
  owner: Phaser.Tilemaps.Tileset,
  srcX: number,
  srcY: number,
): Phaser.Textures.Texture | null {
  const texKey = `lifted_${owner.name}_${srcX}_${srcY}`;
  const cached = sortedTextureCache.get(texKey);
  if (cached) return cached;
  const srcTex = scene.textures.get(owner.name);
  if (!srcTex) return null;
  const tileW = owner.tileWidth;
  const tileH = owner.tileHeight;
  const canvas = document.createElement("canvas");
  canvas.width = tileW;
  canvas.height = tileH;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(srcTex.getSourceImage() as HTMLImageElement, srcX, srcY, tileW, tileH, 0, 0, tileW, tileH);
  // addCanvas returns null when the key is already taken (e.g. a prior
  // scene restart). Fall back to the existing texture so we never crash.
  const tex = scene.textures.addCanvas(texKey, canvas) ?? scene.textures.get(texKey) ?? null;
  if (tex) sortedTextureCache.set(texKey, tex);
  return tex;
}

// Find the lifted tile's sort anchor y, in two passes:
//
//   1. SAME-COLUMN anchor at or BELOW the lifted tile's row. The
//      vertically-split decoration convention puts the body's
//      DecorationLower*/Middle* tile directly below the lifted Upper
//      tile in the same column (rock body + top, tree trunk + canopy,
//      wall + central roof). When the column has such an anchor, it's
//      the right depth — every tile in the same column belongs to the
//      same object and sorts at the object's base.
//
//   2. CHUNK-WIDE MAX y (fallback for orphaned lifted tiles — e.g.,
//      cabin eaves overhanging past the wall into columns with no
//      Middle tile, or trees whose canopy extends past the trunk in
//      some direction). The deepest anchor in the chunk is treated as
//      "this object's base" because a lifted tile without its own
//      column anchor is geometrically part of an adjacent object that
//      does have one.
//
// Pass 1 prevents a small object (rock, single-tree) inside a chunk
// with deeper anchors (cabin walls, big trees) from inheriting that
// deep depth and occluding wrongly. Pass 2 keeps the rule universal:
// every lifted tile gets an anchor, and the chunk's natural "deepest
// thing" provides the depth for tiles that don't have one locally.
//
// Returns -1 only when the chunk has no anchor at all (orphan decor on
// empty ground); callers fall back to the lifted tile's own row.
function findAnchorYForLiftedTile(tx: number, ty: number, grid: AnchorGrid): number {
  // Pass 1: same-column anchor at or below ty.
  for (let row = ty; row < grid.length / CHUNK_TILE_W; row++) {
    const idx = row * CHUNK_TILE_W + tx;
    if (grid[idx] >= 0) return grid[idx];
  }
  // Pass 2: chunk-wide max y. Skip if it's the lifted tile's own row
  // (would be the same as the fallback below).
  let max = -1;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] > max) max = grid[i];
  }
  return max;
}

// Instantiate one Y-sorted tile as a 16×16 Image. Display position =
// the tile's own center (so the sprite shows up where Tiled painted
// it). Depth = DEPTH_CHAR_BASE + sortY, where sortY is the bottom
// edge of the anchor found by findAnchorYForLiftedTile (same-column
// first, chunk-wide fallback). When the chunk has no anchor at all,
// fall back to the tile's own row.
//
// GID → source rect: standard Tiled math. Pick the tileset with the
// largest firstgid ≤ gid, then localId = gid - firstgid, srcX =
// (localId % columns) * tileWidth, srcY = floor(localId / columns) *
// tileHeight.
function instantiateSortedTile(
  scene: Phaser.Scene,
  tile: LiftedTile,
  tilesets: ReadonlyArray<Phaser.Tilemaps.Tileset>,
  anchorGrid: AnchorGrid,
  anchorByObjectId: AnchorByObjectId,
  origin: ChunkOrigin,
): Phaser.GameObjects.Image | null {
  if (tilesets.length === 0) return null;
  const owner = findTilesetForGid(tile.gid, tilesets);
  if (!owner) return null;
  const localId = tile.gid - owner.firstgid;
  const cols = owner.columns || 1;
  const srcX = (localId % cols) * owner.tileWidth;
  const srcY = Math.floor(localId / cols) * owner.tileHeight;
  const tex = getOrCreateTileTexture(scene, owner, srcX, srcY);
  if (!tex) return null;
  const tx = tile.tileIndex % CHUNK_TILE_W;
  const ty = (tile.tileIndex - tx) / CHUNK_TILE_W;
  const worldX = origin.x + tx * CHUNK_TILE_PX + CHUNK_TILE_PX / 2;
  const displayY = origin.y + ty * CHUNK_TILE_PX + CHUNK_TILE_PX / 2;
  // Sort-anchor lookup: prefer objectId (groups every tile in the same
  // logical object together regardless of column placement); fall back to
  // the spatial rule (same-column then chunk-wide max) for orphan tiles
  // that don't carry an objectId.
  let baseY: number;
  if (tile.objectId) {
    const objAnchor = anchorByObjectId.get(tile.objectId);
    baseY = objAnchor !== undefined ? objAnchor : findAnchorYForLiftedTile(tx, ty, anchorGrid);
  } else {
    baseY = findAnchorYForLiftedTile(tx, ty, anchorGrid);
  }
  const sortTy = baseY >= 0 ? baseY : ty;
  const sortY = origin.y + (sortTy + 1) * CHUNK_TILE_PX;
  const img = scene.add.image(worldX, displayY, tex.key);
  img.setOrigin(0.5, 0.5);
  img.setDepth(DEPTH_CHAR_BASE + sortY);
  img.disableInteractive();
  return img;
}

// Make sure every chunk in the active window around (cx, cy) is loaded and
// rendered. Chunks already in `chunkStates` re-create layers only; chunks
// not yet seen are streamed via loadChunk. A chunk whose JSON fails to
// load (e.g. 404) is silently skipped so the camera can keep streaming the
// remaining ones.
export async function ensureChunks(
  scene: Phaser.Scene,
  { cx, cy }: { cx: number; cy: number },
): Promise<void> {
  if (!sceneAlive(scene)) return;
  const { chunks } = getActiveWindow(scene, { cx, cy });
  for (const c of chunks) {
    // The scene can be shut down at any await boundary (StrictMode remount,
    // HMR, scene restart). Bail before touching Phaser with a dead scene.
    if (!sceneAlive(scene)) return;
    const state = chunkStates.get(chunkKey(c.cx, c.cy));
    if (state) {
      // Guard against a state entry left over from a previous scene
      // instance (its tilemap belongs to a destroyed scene).
      if (state.tilemap.scene !== scene) continue;
      buildChunkLayers(state, chunkOrigin(c.cx, c.cy));
      continue;
    }
    const { tilemap, sortedTiles, anchorGrid, anchorByObjectId } = await loadChunk(scene, c.cx, c.cy);
    if (!sceneAlive(scene)) return;
    if (!tilemap) continue;
    registerCollisionIfNeeded(scene, c.cx, c.cy);
    const fresh = buildChunkState(tilemap, sortedTiles, anchorGrid, anchorByObjectId);
    chunkStates.set(chunkKey(c.cx, c.cy), fresh);
    buildChunkLayers(fresh, chunkOrigin(c.cx, c.cy));
  }
}

// Register the chunk's DecorationLower tiles as the collision source so
// isWalkable picks them up. Skipped if already registered.
// NOTE: the Tilemap cache (scene.sys.cache.tilemap) stores a
// { format, data } wrapper — the Tiled JSON lives under `.data`, not at
// the top level, and NOT in cache.json (tilemapTiledJSON never touches it).
function registerCollisionIfNeeded(scene: Phaser.Scene, cx: number, cy: number): void {
  if (chunkRegistered(cx, cy)) return;
  const key = chunkKey(cx, cy);
  const entry = scene.sys.cache.tilemap.get(key) as { data?: unknown } | undefined;
  const json = entry?.data ?? entry;
  if (json) registerChunk(cx, cy, json);
}

export function releaseOutside(
  scene: Phaser.Scene,
  { cx, cy }: { cx: number; cy: number },
): void {
  const active = new Set(getActiveWindow(scene, { cx, cy }).chunks.map((c) => chunkKey(c.cx, c.cy)));
  for (const [key, state] of chunkStates) {
    if (active.has(key)) continue;
    destroyChunkLayers(state);
    destroySortedSprites(state);
    // Keep state.tilemap + state.tilesets cached — re-entry only needs to
    // re-call createLayer, not re-register tilesets.
  }
}

function destroyChunkLayers(state: ChunkState): void {
  for (const layer of state.layers.values()) layer.destroy(false);
  state.layers.clear();
}

function destroySortedSprites(state: ChunkState): void {
  for (const sprite of state.sortedSprites) sprite.destroy();
  state.sortedSprites = [];
}

// Clamp the camera to the loaded 5×5 chunk window centered on (cx, cy) so
// panning can never reveal the background. Zoom is deliberately NOT
// touched here — WorldScene.fitCameraToCanvas owns it; resetting it on
// every chunk crossing would stomp the user's wheel zoom and break the
// cover fit.
//
// centerOn defaults to true for the initial framing (spectator / first
// load). During streaming the camera MUST NOT recenter: the player just
// crossed the chunk edge, so snapping toward the chunk center teleports
// the view and then the follow-lerp glides it back — the "refocus glitch".
// The camera-follow keeps framing the player; only the bounds change.
export function recenterCamera(
  scene: Phaser.Scene,
  { cx, cy }: { cx: number; cy: number },
  centerOn = true,
): void {
  const cam = scene.cameras.main;
  const { x: ox, y: oy } = chunkOrigin(cx, cy);
  const bx = ox - WINDOW_RADIUS * CHUNK_PX_W;
  const by = oy - WINDOW_RADIUS * CHUNK_PX_H;
  const bw = (2 * WINDOW_RADIUS + 1) * CHUNK_PX_W;
  const bh = (2 * WINDOW_RADIUS + 1) * CHUNK_PX_H;
  cam.setBounds(bx, by, bw, bh);
  if (centerOn) cam.centerOn(ox + CHUNK_PX_W / 2, oy + CHUNK_PX_H / 2);
}

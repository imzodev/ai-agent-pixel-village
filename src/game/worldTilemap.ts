import type Phaser from "phaser";
import { CHUNK_PX_H, CHUNK_PX_W, CHUNK_TILE_H, CHUNK_TILE_PX, CHUNK_TILE_W, chunkRegistered, registerChunk } from "@/lib/chunkCollision";

// Chunk tile geometry. The chunk world is unbounded: cx, cy ∈ ℤ. The
// constants and the cy-negated origin convention live in
// @/lib/chunkCollision so the collision registry and the renderer can never
// drift apart; they are re-exported here for existing importers.
export { CHUNK_TILE_W, CHUNK_TILE_H, CHUNK_TILE_PX, CHUNK_PX_W, CHUNK_PX_H };

// Layers that should be Y-sorted against the player instead of drawn at a
// fixed depth. Every tile in these layers is lifted out of the static
// tilemap and rendered as an individual GameObject with depth
// DEPTH_CHAR_BASE + baseAnchorY.
//
// baseAnchorY is the bottom tile-y in the same chunk column across the
// MIDDLE layer (the "base" layer). For a tree with its trunk in
// DecorationMiddle and canopy in DecorationUpper, every canopy tile in
// the same column sorts at the trunk's bottom y — so the player walking
// south of the trunk stays behind the entire tree, and walking north of
// the trunk stays in front. For a light post / banner / signpost placed
// in just DecorationUpper with no DecorationMiddle base, baseAnchorY
// falls back to the tile's own y.
//
// The rule is purely layer-driven: every tile in DecorationUpper* is
// sorted against the player; the depth is "DEPTH_CHAR_BASE + the bottom
// of the column in DecorationMiddle, or the tile's own y if no Middle
// tile exists." Trees happen to use it naturally (canopy follows trunk),
// but the rule doesn't depend on knowing that the layer contains trees.
const SORTED_LAYERS: ReadonlySet<string> = new Set([
  "DecorationUpper",
  "DecorationUpper1",
  "DecorationUpper2",
]);

// Layers scanned only to compute the per-column anchor for SORTED_LAYERS
// tiles. Tiles in these layers are NOT lifted — they stay on their static
// layer rendered behind the character band. We just read their y position
// to find each column's "base" depth anchor.
const ANCHOR_LAYERS: ReadonlySet<string> = new Set([
  "DecorationMiddle",
  "DecorationMiddle1",
  "DecorationMiddle2",
]);

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

// Render order matches the JSON layer array order, minus data-only layers:
// Collision (server-side blocking, invisible) and Interactive (door/interaction
// markers, invisible). The Y-sorted canopy layers (DecorationUpper*) are
// skipped here — they are lifted into per-tile sprites in buildChunkLayers
// so they sort with the character band. DecorationMiddle* stays in this
// list: those tiles are pinned behind the character band (see LAYER_DEPTH)
// and never Y-sort, matching the standard top-down RPG convention.
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

const SKIP_LAYERS = new Set(["Collision", "Interactive"]);

export { LAYER_RENDER_ORDER, SKIP_LAYERS, SORTED_LAYERS };

// Depth bands. Y-sorted objects (characters, critters, items, buildings,
// lifted canopy tiles) use DEPTH_CHAR_BASE + world-y so ground layers always
// sit under them. The canopies no longer pin to a static depth band — they
// sort per-tile instead.
export const DEPTH_CHAR_BASE = 100_000;
export const DEPTH_CANOPY = 500_000;

// Per-layer depth for the static layers. DecorationMiddle* sits BELOW the
// character band so the player always renders in front of trunks and low
// decor. DecorationUpper* is intentionally absent — those layers are
// Y-sorted, see SORTED_LAYERS / instantiateSortedTile.
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

export function chunkKey(cx: number, cy: number): string {
  return `tilemap_${cx}_${cy}`;
}

// Pixel origin (top-left) of chunk (cx, cy). World (0, 0) is the top-left of
// chunk (0, 0). cx / cy are unbounded integers, so this function works for
// any (cx, cy) — no clamp, no lookup table.
//
// Y is NEGATED on purpose: Phaser's screen y grows downward, but the chunk
// convention is cy=+1 → up (top of screen), cy=-1 → down. The old bounded
// renderer did this via a CHUNK_ROWS = [1, 0, -1] index lookup; the unbounded
// refactor must keep the same visual result with arithmetic instead.
export function chunkOrigin(cx: number, cy: number): { x: number; y: number } {
  return { x: cx * CHUNK_PX_W, y: -cy * CHUNK_PX_H };
}

export function chunkCenter(cx: number, cy: number): { x: number; y: number } {
  const { x, y } = chunkOrigin(cx, cy);
  return { x: x + CHUNK_PX_W / 2, y: y + CHUNK_PX_H / 2 };
}

// Convert world pixel coords into a chunk coord. Unbounded: any (x, y) maps
// to a unique (cx, cy) ∈ ℤ×ℤ. cy is negated to match chunkOrigin (cy=+1 is
// up, i.e. negative y on screen).
export function chunkAtPixel(x: number, y: number): { cx: number; cy: number } {
  return {
    cx: Math.floor(x / CHUNK_PX_W),
    cy: -Math.floor(y / CHUNK_PX_H),
  };
}

// Infinite extent — the chunk world has no edges. Camera bounds are clamped
// here only when a caller wants a finite view; recenterCamera deliberately
// does not, so it grows with the player.
export function worldExtent(): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: Number.NEGATIVE_INFINITY,
    minY: Number.NEGATIVE_INFINITY,
    maxX: Number.POSITIVE_INFINITY,
    maxY: Number.POSITIVE_INFINITY,
  };
}

// Preload the tileset PNGs. Chunk JSONs are streamed lazily via loadChunk so
// any (cx, cy) can be added without changing the preload queue.
export function loadTilemapAssets(scene: Phaser.Scene): void {
  for (const ts of TILESET_FILES) {
    scene.load.image(ts.name, `/assets/${ts.file}`);
  }
}

// Streaming state. The tilemap + tilesets are kept cached per chunk so that
// re-entering a chunk only re-creates the layers (cheap), not the tileset
// registration (which warns on duplicate adds). Layers are destroyed on
// releaseOutside and re-created on ensureChunks.
//
// `sortedSprites` holds the Y-sorted GameObjects for the SORTED_LAYERS tiles
// of this chunk. Each tile becomes one Image; the lifecycle matches the
// static layers (created in buildChunkLayers, destroyed in releaseOutside).
//
// `baseAnchorY` is the bottom-most tile-y per chunk column in ANCHOR_LAYERS
// (DecorationMiddle*). Every lifted upper-layer tile in column `tx` sorts
// at baseAnchorY[tx] (or its own y if that column has no Middle tile).
type ChunkState = {
  tilemap: Phaser.Tilemaps.Tilemap;
  tilesets: Phaser.Tilemaps.Tileset[];
  layers: Map<string, Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer>;
  sortedSprites: Phaser.GameObjects.Image[];
  sortedTiles: Array<{ layerName: string; tileIndex: number; gid: number }>;
  baseAnchorY: Int32Array;
};

const chunkStates = new Map<string, ChunkState>();

// In-flight lazy loads keyed by cache key. Concurrent callers awaiting the same
// chunk share one Promise and one network request.
const inFlightLoads = new Map<
  string,
  Promise<{
    tilemap: Phaser.Tilemaps.Tilemap | null;
    sortedTiles: Array<{ layerName: string; tileIndex: number; gid: number }>;
    baseAnchorY: Int32Array;
  }>
>();

// Stream a single chunk's Tiled JSON via the on-demand API. The API serves a
// hand-authored file when present and otherwise generates a default empty
// chunk, so every (cx, cy) is reachable without a static asset on disk.
// Idempotent: a chunk already in the tilemap cache short-circuits and re-uses
// the cached JSON (the lift pass is idempotent because GIDs are zeroed on
// first run).
//
// Returns the parsed Tilemap, the lifted-tile list, AND the per-column
// base anchor (bottom-most Middle tile-y per column) used by every lifted
// upper-layer tile's sort depth.
export function loadChunk(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
): Promise<{
  tilemap: Phaser.Tilemaps.Tilemap | null;
  sortedTiles: Array<{ layerName: string; tileIndex: number; gid: number }>;
  baseAnchorY: Int32Array;
}> {
  const key = chunkKey(cx, cy);
  const emptyAnchor = new Int32Array(CHUNK_TILE_W).fill(-1);
  if (scene.sys.cache.tilemap.exists(key)) {
    const { sortedTiles, baseAnchorY } = extractFromCachedJson(scene, cx, cy);
    const tm = scene.make.tilemap({ key });
    return Promise.resolve({ tilemap: tm ?? null, sortedTiles, baseAnchorY });
  }
  const existing = inFlightLoads.get(key);
  if (existing) return existing;

  const url = `/api/chunks/${cx}/${cy}`;
  const promise = new Promise<{
    tilemap: Phaser.Tilemaps.Tilemap | null;
    sortedTiles: Array<{ layerName: string; tileIndex: number; gid: number }>;
    baseAnchorY: Int32Array;
  }>((resolve) => {
    const cleanup = () => {
      scene.load.off("filecomplete", onComplete);
      scene.load.off("loaderror", onError);
    };
    const onComplete = (loadedKey: string) => {
      if (loadedKey !== key) return;
      cleanup();
      const { sortedTiles, baseAnchorY } = extractFromCachedJson(scene, cx, cy);
      const tm = scene.make.tilemap({ key });
      resolve({ tilemap: tm ?? null, sortedTiles, baseAnchorY });
    };
    const onError = (file: { key?: string } | undefined) => {
      if (!file || file.key !== key) return;
      cleanup();
      console.warn(`[worldTilemap] failed to load chunk ${key} (url=${url})`);
      resolve({ tilemap: null, sortedTiles: [], baseAnchorY: emptyAnchor });
    };
    scene.load.on("filecomplete", onComplete);
    scene.load.on("loaderror", onError);
    scene.load.tilemapTiledJSON(key, url);
    if (!scene.load.isLoading()) scene.load.start();
  });
  inFlightLoads.set(key, promise);
  void promise.finally(() => inFlightLoads.delete(key));
  return promise;
}

// Pull the cached chunk JSON and run the one-pass extractor (lift SORTED
// tiles + scan ANCHOR layers). Two effects from a single JSON walk:
//   1. SORTED_LAYERS tiles are recorded + their GIDs zeroed so the static
//      layer won't draw them.
//   2. ANCHOR_LAYERS tiles contribute their y to per-column baseAnchorY,
//      used by every lifted upper-layer tile's sort depth.
//
// We work on the raw JSON rather than parsed LayerData because Phaser 4's
// LayerData.data is a Tile[][] — by the time the Tilemap exists, the
// original GID array is gone. Mutating the JSON before
// scene.make.tilemap({ key }) is the only window where we still have it.
function extractFromCachedJson(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
): {
  sortedTiles: Array<{ layerName: string; tileIndex: number; gid: number }>;
  baseAnchorY: Int32Array;
} {
  const key = chunkKey(cx, cy);
  const entry = scene.sys.cache.tilemap.get(key) as { data?: unknown } | undefined;
  const json = entry?.data ?? entry;
  if (!json) return { sortedTiles: [], baseAnchorY: new Int32Array(CHUNK_TILE_W).fill(-1) };
  return extractFromJson(json, CHUNK_TILE_W);
}

// 5×5 chunk window centered on (cx, cy). Unbounded — no includes() filter,
// because the chunk world extends to ±Infinity. The radius is 2 (not 1) so the
// loaded area always overflows the camera viewport at the minimum allowed
// zoom: the camera can pan anywhere inside the window without ever revealing
// the background, and the window only shifts (invisibly, while the player is
// ≥ 2 chunks from its edges) when the player crosses a chunk boundary.
const WINDOW_RADIUS = 2;

export function getActiveWindow(
  _scene: Phaser.Scene,
  { cx, cy }: { cx: number; cy: number },
): { chunks: Array<{ cx: number; cy: number }> } {
  const list: Array<{ cx: number; cy: number }> = [];
  for (let dx = -WINDOW_RADIUS; dx <= WINDOW_RADIUS; dx++) {
    for (let dy = -WINDOW_RADIUS; dy <= WINDOW_RADIUS; dy++) {
      list.push({ cx: cx + dx, cy: cy + dy });
    }
  }
  return { chunks: list };
}

function buildChunkState(scene: Phaser.Scene, tilemap: Phaser.Tilemaps.Tilemap, sortedTiles: ChunkState["sortedTiles"], baseAnchorY: Int32Array): ChunkState {
  // Only register the tilesets this particular map references — Phaser warns
  // when addTilesetImage cannot find a matching tileset entry. Default
  // generated chunks only use beginnertileset.
  const tilesets: Phaser.Tilemaps.Tileset[] = [];
  const referenced = new Set(tilemap.tilesets.map((t) => t.name));
  for (const ts of TILESET_FILES) {
    if (!referenced.has(ts.name)) continue;
    const t = tilemap.addTilesetImage(ts.name);
    if (t) tilesets.push(t);
  }
  return { tilemap, tilesets, layers: new Map(), sortedSprites: [], sortedTiles, baseAnchorY };
}

function buildChunkLayers(state: ChunkState, cx: number, cy: number): void {
  const { x: ox, y: oy } = chunkOrigin(cx, cy);
  // Static layers first — SORTED_LAYERS entries are skipped because their
  // tiles were zeroed in the JSON before Tilemap parsed it, so createLayer
  // produces empty layers for them anyway. We keep them out of
  // LAYER_RENDER_ORDER so they don't even appear as keys.
  for (const name of LAYER_RENDER_ORDER) {
    if (SKIP_LAYERS.has(name)) continue;
    if (state.layers.has(name)) continue;
    if (state.tilemap.getLayerIndex(name) === null) continue;
    const layer = state.tilemap.createLayer(name, state.tilesets, ox, oy);
    if (!layer) continue;
    layer.setDepth(LAYER_DEPTH[name] ?? -5);
    layer.name = `chunk_${cx}_${cy}_${name}`;
    state.layers.set(name, layer);
  }
  // Y-sorted upper-layer sprites — one Image per lifted tile. Every tile
  // sorts at DEPTH_CHAR_BASE + baseAnchorY[tx], where baseAnchorY[tx] is the
  // bottom-most tile-y in the same chunk column across ANCHOR_LAYERS (the
  // "base" layer). This is the standard top-down RPG convention: every tile
  // in the upper layer shares one depth anchor = the base of its column.
  // Trees get the right behavior because their trunks live in
  // DecorationMiddle and their canopies in DecorationUpper; light posts /
  // banners / walls / signposts get the same treatment for free, with no
  // code change needed when those are added.
  const scene = state.tilemap.scene as Phaser.Scene;
  for (const lifted of state.sortedTiles) {
    const sprite = instantiateSortedTile(scene, lifted, ox, oy, state.tilesets, state.baseAnchorY);
    if (sprite) state.sortedSprites.push(sprite);
  }
}

// Walk the raw chunk JSON once. For each layer:
//   - If it's a SORTED_LAYERS entry, lift every non-zero tile (record it
//     and zero the GID in the JSON so the static layer draws nothing).
//   - If it's an ANCHOR_LAYERS entry, scan its tile y positions and update
//     baseAnchorY[tx] = max(baseAnchorY[tx], ty) for each filled cell.
//   - Otherwise, leave it alone (it'll be rendered as a normal static layer).
//
// ANCHOR_LAYERS tiles are NOT lifted — they stay on their static layer
// rendered behind the character band. We only read their y positions to
// give every upper-layer sprite in the same column a consistent sort depth.
function extractFromJson(
  json: unknown,
  chunkTileW: number,
): {
  sortedTiles: Array<{ layerName: string; tileIndex: number; gid: number }>;
  baseAnchorY: Int32Array;
} {
  const layers = (json as { layers?: unknown })?.layers;
  const sortedTiles: Array<{ layerName: string; tileIndex: number; gid: number }> = [];
  const baseAnchorY = new Int32Array(chunkTileW).fill(-1);
  if (!Array.isArray(layers)) return { sortedTiles, baseAnchorY };
  for (const layer of layers) {
    const typed = layer as { name?: unknown; type?: unknown; data?: unknown };
    if (typeof typed.name !== "string" || typed.type !== "tilelayer") continue;
    const isSorted = SORTED_LAYERS.has(typed.name);
    const isAnchor = ANCHOR_LAYERS.has(typed.name);
    if (!isSorted && !isAnchor) continue;
    const data = typed.data;
    if (!Array.isArray(data)) continue;
    for (let i = 0; i < data.length; i++) {
      const raw = data[i] | 0;
      const gid = raw & 0x1fffffff; // strip Tiled flip/rotate flags
      if (gid <= 0) continue;
      const tx = i % chunkTileW;
      const ty = Math.floor(i / chunkTileW);
      if (isAnchor && ty > baseAnchorY[tx]) baseAnchorY[tx] = ty;
      if (isSorted) {
        sortedTiles.push({ layerName: typed.name, tileIndex: i, gid });
        data[i] = 0;
      }
    }
  }
  return { sortedTiles, baseAnchorY };
}

// Instantiate one Y-sorted tile. Every lifted tile is rendered as a 16×16
// Image. The display position is the tile's own center (so the sprite shows
// up where Tiled painted it). The depth is DEPTH_CHAR_BASE +
// (baseAnchorY[tx] + 1) * TILE_PX — i.e. the bottom of the base tile in the
// same column. When the column has no base (no ANCHOR_LAYERS tile), we fall
// back to the tile's own bottom.
//
// GID → source rect: standard Tiled math. Pick the tileset with the
// largest firstgid ≤ gid, then localId = gid - firstgid, srcX = (localId %
// columns) * tileWidth, srcY = floor(localId / columns) * tileHeight.
const sortedTextureCache = new Map<string, Phaser.Textures.Texture>();
function instantiateSortedTile(
  scene: Phaser.Scene,
  lifted: { layerName: string; tileIndex: number; gid: number },
  ox: number,
  oy: number,
  tilesets: ReadonlyArray<Phaser.Tilemaps.Tileset>,
  baseAnchorY: Int32Array,
): Phaser.GameObjects.Image | null {
  if (tilesets.length === 0) return null;
  let owner: Phaser.Tilemaps.Tileset | null = null;
  for (const ts of tilesets) {
    if (ts.firstgid <= lifted.gid && (!owner || ts.firstgid > owner.firstgid)) owner = ts;
  }
  if (!owner) return null;
  const localId = lifted.gid - owner.firstgid;
  const cols = owner.columns || 1;
  const tileW = owner.tileWidth;
  const tileH = owner.tileHeight;
  const srcX = (localId % cols) * tileW;
  const srcY = Math.floor(localId / cols) * tileH;
  const texKey = `lifted_${owner.name}_${srcX}_${srcY}`;
  let tex = sortedTextureCache.get(texKey);
  if (!tex) {
    const srcTex = scene.textures.get(owner.name);
    if (!srcTex) return null;
    const canvas = document.createElement("canvas");
    canvas.width = tileW;
    canvas.height = tileH;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const srcCanvas = srcTex.getSourceImage() as HTMLImageElement;
    ctx.drawImage(srcCanvas, srcX, srcY, tileW, tileH, 0, 0, tileW, tileH);
    const added = scene.textures.addCanvas(texKey, canvas);
    // addCanvas returns null when the key is already taken (e.g. a prior
    // scene restart). Fall back to the existing texture so we never crash.
    tex = added ?? scene.textures.get(texKey) ?? null;
    if (tex) sortedTextureCache.set(texKey, tex);
  }
  if (!tex) return null;
  const tx = lifted.tileIndex % CHUNK_TILE_W;
  const ty = Math.floor(lifted.tileIndex / CHUNK_TILE_W);
  const worldX = ox + tx * CHUNK_TILE_PX + CHUNK_TILE_PX / 2;
  // Display: tile's own center.
  const worldY = oy + ty * CHUNK_TILE_PX + CHUNK_TILE_PX / 2;
  // Depth: bottom of the column's base tile (DecorationMiddle*), or the
  // tile's own bottom if no base tile exists in the column.
  const anchorTy = baseAnchorY[tx];
  const sortTy = anchorTy >= 0 ? anchorTy : ty;
  const sortY = oy + (sortTy + 1) * CHUNK_TILE_PX;
  const img = scene.add.image(worldX, worldY, texKey);
  img.setOrigin(0.5, 0.5);
  img.setDepth(DEPTH_CHAR_BASE + sortY);
  img.disableInteractive();
  return img;
}

// Make sure every chunk in the active window around (cx, cy) is loaded and
// rendered. Chunks already in `chunkStates` re-create layers only; chunks not
// yet seen are streamed via loadChunk. If a chunk's JSON is missing (e.g.
// 404) the chunk is silently skipped so the camera can keep streaming the
// remaining ones.
export async function ensureChunks(scene: Phaser.Scene, { cx, cy }: { cx: number; cy: number }): Promise<void> {
  const { chunks } = getActiveWindow(scene, { cx, cy });
  for (const c of chunks) {
    const key = chunkKey(c.cx, c.cy);
    let state = chunkStates.get(key);
    if (state) {
      buildChunkLayers(state, c.cx, c.cy);
      continue;
    }
    const { tilemap, sortedTiles, baseAnchorY } = await loadChunk(scene, c.cx, c.cy);
    if (!tilemap) continue;
    // Register the chunk's DecorationLower tiles as the collision source so
    // isWalkable picks them up. Skipped if already registered (cache hit).
    // NOTE: the Tilemap cache (scene.sys.cache.tilemap) stores a
    // { format, data } wrapper — the Tiled JSON lives under `.data`, not at
    // the top level, and NOT in cache.json (tilemapTiledJSON never touches it).
    if (!chunkRegistered(c.cx, c.cy)) {
      const entry = scene.sys.cache.tilemap.get(key) as { data?: unknown } | undefined;
      const json = entry?.data ?? entry;
      if (json) registerChunk(c.cx, c.cy, json);
    }
    // loadChunk already lifted the SORTED_LAYERS tiles out of the cached
    // JSON (they're zeroed there now) and computed the per-column base
    // anchor from ANCHOR_LAYERS. buildChunkState stores both so
    // buildChunkLayers can reinstantiate sprites on chunk re-entry.
    state = buildChunkState(scene, tilemap, sortedTiles, baseAnchorY);
    chunkStates.set(key, state);
    buildChunkLayers(state, c.cx, c.cy);
  }
}

export function releaseOutside(scene: Phaser.Scene, { cx, cy }: { cx: number; cy: number }): void {
  const { chunks } = getActiveWindow(scene, { cx, cy });
  const active = new Set(chunks.map((c) => chunkKey(c.cx, c.cy)));
  for (const [key, state] of chunkStates) {
    if (active.has(key)) continue;
    for (const layer of state.layers.values()) layer.destroy(false);
    state.layers.clear();
    for (const sprite of state.sortedSprites) sprite.destroy();
    state.sortedSprites = [];
    // Keep state.tilemap + state.tilesets cached — re-entry only needs to
    // re-call createLayer, not re-register tilesets.
    //
    // destroy(false) is load-bearing: the default destroy() removes the
    // LayerData from the tilemap's layers array, so a later createLayer(name)
    // fails with "Invalid Tilemap Layer ID" and the chunk comes back empty.
    // destroy(false) keeps the LayerData registered and only clears the
    // installed tilemapLayer reference, which createLayer requires free.
  }
}

// Clamp the camera to the loaded 5×5 chunk window centered on (cx, cy) so
// panning can never reveal the background. Zoom is deliberately NOT touched
// here — WorldScene.fitCameraToCanvas owns it; resetting it on every chunk
// crossing would stomp the user's wheel zoom and break the cover fit.
//
// centerOn defaults to true for the initial framing (spectator / first load).
// During streaming the camera MUST NOT recenter: the player just crossed the
// chunk edge, so snapping toward the chunk center teleports the view and then
// the follow-lerp glides it back — the "refocus glitch". The camera-follow
// keeps framing the player; only the bounds change here.
export function recenterCamera(scene: Phaser.Scene, { cx, cy }: { cx: number; cy: number }, centerOn = true): void {
  const cam = scene.cameras.main;
  const { x: ox, y: oy } = chunkOrigin(cx, cy);
  const bx = ox - WINDOW_RADIUS * CHUNK_PX_W;
  const by = oy - WINDOW_RADIUS * CHUNK_PX_H;
  const bw = (2 * WINDOW_RADIUS + 1) * CHUNK_PX_W;
  const bh = (2 * WINDOW_RADIUS + 1) * CHUNK_PX_H;
  cam.setBounds(bx, by, bw, bh);
  if (centerOn) cam.centerOn(ox + CHUNK_PX_W / 2, oy + CHUNK_PX_H / 2);
}
import type Phaser from "phaser";
import { CHUNK_PX_H, CHUNK_PX_W, CHUNK_TILE_H, CHUNK_TILE_PX, CHUNK_TILE_W, chunkRegistered, registerChunk } from "@/lib/chunkCollision";

// Chunk tile geometry. The chunk world is unbounded: cx, cy ∈ ℤ. The
// constants and the cy-negated origin convention live in
// @/lib/chunkCollision so the collision registry and the renderer can never
// drift apart; they are re-exported here for existing importers.
export { CHUNK_TILE_W, CHUNK_TILE_H, CHUNK_TILE_PX, CHUNK_PX_W, CHUNK_PX_H };

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
type ChunkState = {
  tilemap: Phaser.Tilemaps.Tilemap;
  tilesets: Phaser.Tilemaps.Tileset[];
  layers: Map<string, Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer>;
};

const chunkStates = new Map<string, ChunkState>();

// In-flight lazy loads keyed by cache key. Concurrent callers awaiting the same
// chunk share one Promise and one network request.
const inFlightLoads = new Map<string, Promise<Phaser.Tilemaps.Tilemap | null>>();

// Stream a single chunk's Tiled JSON via the on-demand API. The API serves a
// hand-authored file when present and otherwise generates a default empty
// chunk, so every (cx, cy) is reachable without a static asset on disk.
// Idempotent: a chunk already in `scene.cache.json` short-circuits and
// re-uses the cached tilemap data.
export function loadChunk(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
): Promise<Phaser.Tilemaps.Tilemap | null> {
  const key = chunkKey(cx, cy);
  if (scene.cache.json.has(key)) {
    const tm = scene.make.tilemap({ key });
    return Promise.resolve(tm ?? null);
  }
  const existing = inFlightLoads.get(key);
  if (existing) return existing;

  const url = `/api/chunks/${cx}/${cy}`;
  const promise = new Promise<Phaser.Tilemaps.Tilemap | null>((resolve) => {
    const cleanup = () => {
      scene.load.off("filecomplete", onComplete);
      scene.load.off("loaderror", onError);
    };
    const onComplete = (loadedKey: string) => {
      if (loadedKey !== key) return;
      cleanup();
      const tm = scene.make.tilemap({ key });
      resolve(tm ?? null);
    };
    const onError = (file: { key?: string } | undefined) => {
      if (!file || file.key !== key) return;
      cleanup();
      console.warn(`[worldTilemap] failed to load chunk ${key} (url=${url})`);
      resolve(null);
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

function buildChunkState(scene: Phaser.Scene, tilemap: Phaser.Tilemaps.Tilemap): ChunkState {
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
  return { tilemap, tilesets, layers: new Map() };
}

function buildChunkLayers(state: ChunkState, cx: number, cy: number): void {
  const { x: ox, y: oy } = chunkOrigin(cx, cy);
  for (const name of LAYER_RENDER_ORDER) {
    if (SKIP_LAYERS.has(name)) continue;
    if (state.layers.has(name)) continue;
    // Skip layer names this map doesn't define (generated chunks only carry
    // Ground + DecorationUpper) — createLayer would warn on each miss.
    // getLayerIndex returns null (not -1) for unknown names.
    if (state.tilemap.getLayerIndex(name) === null) continue;
    const layer = state.tilemap.createLayer(name, state.tilesets, ox, oy);
    if (!layer) continue;
    layer.setDepth(LAYER_DEPTH[name] ?? -5);
    layer.name = `chunk_${cx}_${cy}_${name}`;
    state.layers.set(name, layer);
  }
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
    const tilemap = await loadChunk(scene, c.cx, c.cy);
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
    state = buildChunkState(scene, tilemap);
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
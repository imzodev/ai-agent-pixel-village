// The world map's server side: map tiles rendered on demand from the real
// world (authored chunks, generated terrain, building stamps), cached in
// memory and on disk; the fog-of-war store; the markers.
//
// A zoom-0 tile is 8×8 chunks at 1 px per world tile, each pixel the
// colour of that tile as drawn: every visible layer blended in by its
// tile's average colour and coverage. Zoom z is four z−1 tiles shrunk 2×.
// Nothing is rendered until someone looks, so a huge world costs only
// what players visit.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { characterMapSeen, characterWaystones, lots } from "@/db/schema";
import { PLACES } from "./regions";
import { defaultChunk } from "./chunkGen";
import { readAuthored, restyleAuthored } from "./villageRestyle";
import { getBuildingDoor, getBuildingsManifest, getTemplate } from "./buildingsServer";
import { CHUNK_TILE_H, CHUNK_TILE_W } from "./chunkCollision";
import { MAP_BOUNDS, MAP_MAX_ZOOM, MAP_TILE_CHUNKS, MAP_TILE_H, MAP_TILE_W, chunkInBounds, mapTileInBounds, mapTileRect, seenMasks } from "./worldAtlas";
import type { MapMarkers, MapPlace, MapSourceJson, MapWaystone, SeenBlock, TilesetColors } from "@/types/map";

/** Bump when the renderer changes, so cached tiles re-render. */
const RENDER_VERSION = 1;
const DATA_LAYERS = new Set(["Collision", "Interactive", "Garden"]);
const CACHE_DIR = path.join(process.cwd(), ".cache", "map");

// ── Tileset colours ──────────────────────────────────────────────────────
const colorCache = new Map<string, Promise<TilesetColors | null>>();
function tilesetColors(image: string, transparentBlack: boolean): Promise<TilesetColors | null> {
  const file = path.join(process.cwd(), "public", "assets", path.basename(image));
  const key = `${file}|${transparentBlack}`;
  let p = colorCache.get(key);
  if (!p) {
    p = (async () => {
      try {
        const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const columns = Math.floor(info.width / 16), rows = Math.floor(info.height / 16);
        const rgb = new Uint8Array(columns * rows * 3), cov = new Float32Array(columns * rows);
        for (let t = 0; t < columns * rows; t++) {
          const x0 = (t % columns) * 16, y0 = Math.floor(t / columns) * 16;
          let r = 0, g = 0, b = 0, a = 0;
          for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
            const o = ((y0 + y) * info.width + x0 + x) * 4;
            let al = data[o + 3];
            if (transparentBlack && data[o] === 0 && data[o + 1] === 0 && data[o + 2] === 0) al = 0;
            r += data[o] * al; g += data[o + 1] * al; b += data[o + 2] * al; a += al;
          }
          if (a > 0) { rgb[t * 3] = r / a; rgb[t * 3 + 1] = g / a; rgb[t * 3 + 2] = b / a; }
          cov[t] = a / (256 * 255);
        }
        return { rgb, cov, columns };
      } catch {
        return null;
      }
    })();
    colorCache.set(key, p);
  }
  return p;
}

/** Composite a map's visible layers onto `px` (RGBA, `pw` px wide) at (ox, oy). */
async function paint(src: MapSourceJson, px: Buffer, pw: number, ph: number, ox: number, oy: number, width: number): Promise<void> {
  const sets = [...src.tilesets].sort((a, b) => b.firstgid - a.firstgid);
  const colors = await Promise.all(sets.map((t) => (t.image ? tilesetColors(t.image, (t.transparentcolor ?? "").toLowerCase() === "#000000") : Promise.resolve(null))));
  for (const layer of src.layers) {
    if (!layer.data || DATA_LAYERS.has(layer.name) || layer.visible === false) continue;
    for (let i = 0; i < layer.data.length; i++) {
      const gid = layer.data[i] & 0x1fffffff;
      if (!gid) continue;
      const x = ox + (i % width), y = oy + Math.floor(i / width);
      if (x < 0 || y < 0 || x >= pw || y >= ph) continue;
      const k = sets.findIndex((t) => t.firstgid <= gid);
      const c = k >= 0 ? colors[k] : null;
      if (!c) continue;
      const t = gid - sets[k].firstgid;
      const a = c.cov[t];
      if (!a) continue;
      const o = (y * pw + x) * 4;
      px[o] = px[o] * (1 - a) + c.rgb[t * 3] * a;
      px[o + 1] = px[o + 1] * (1 - a) + c.rgb[t * 3 + 1] * a;
      px[o + 2] = px[o + 2] * (1 - a) + c.rgb[t * 3 + 2] * a;
      px[o + 3] = 255;
    }
  }
}

async function chunkSource(cx: number, cy: number): Promise<MapSourceJson> {
  const authored = await readAuthored(cx, cy);
  return (authored ? await restyleAuthored(cx, cy, authored) : defaultChunk(cx, cy)) as unknown as MapSourceJson;
}

/** A zoom-0 tile: 8×8 chunks, then the building stamps over them. */
async function renderBase(mx: number, my: number): Promise<Buffer> {
  const W = MAP_TILE_W, H = MAP_TILE_H;
  const px = Buffer.alloc(W * H * 4);
  const r = mapTileRect(0, mx, my);
  const cx0 = Math.floor(r.tx / CHUNK_TILE_W), cyTop = -Math.floor(r.ty / CHUNK_TILE_H);
  for (let j = 0; j < MAP_TILE_CHUNKS; j++) for (let i = 0; i < MAP_TILE_CHUNKS; i++) {
    const cx = cx0 + i, cy = cyTop - j;
    if (!chunkInBounds(cx, cy)) continue;
    await paint(await chunkSource(cx, cy), px, W, H, i * CHUNK_TILE_W, j * CHUNK_TILE_H, CHUNK_TILE_W);
  }
  for (const entry of (await getBuildingsManifest()).buildings) {
    if (entry.tx + 24 <= r.tx || entry.tx >= r.tx + W || entry.ty + 15 <= r.ty || entry.ty >= r.ty + H) continue;
    await paint((await getTemplate(entry)) as MapSourceJson, px, W, H, entry.tx - r.tx, entry.ty - r.ty, 24);
  }
  return px;
}

/** Zoom z: the four zoom z−1 tiles below, averaged 2×2. */
async function renderZoom(z: number, mx: number, my: number): Promise<Buffer> {
  const W = MAP_TILE_W, H = MAP_TILE_H;
  const px = Buffer.alloc(W * H * 4);
  for (let q = 0; q < 4; q++) {
    const sx = q % 2, sy = Math.floor(q / 2);
    if (!mapTileInBounds(z - 1, mx * 2 + sx, my * 2 + sy)) continue;
    const child = await tileRaw(z - 1, mx * 2 + sx, my * 2 + sy);
    for (let y = 0; y < H / 2; y++) for (let x = 0; x < W / 2; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const o = ((y * 2 + dy) * W + x * 2 + dx) * 4, al = child[o + 3];
        r += child[o] * al; g += child[o + 1] * al; b += child[o + 2] * al; a += al;
      }
      const o = ((sy * H / 2 + y) * W + sx * W / 2 + x) * 4;
      if (a > 0) { px[o] = r / a; px[o + 1] = g / a; px[o + 2] = b / a; px[o + 3] = Math.round(a / 4); }
    }
  }
  return px;
}

// ── Cache ────────────────────────────────────────────────────────────────
let versionMemo: Promise<string> | null = null;
/** Changes when the manifest, the authored maps or the renderer change. */
export function mapVersion(): Promise<string> {
  versionMemo ??= (async () => {
    const h = crypto.createHash("sha1").update(String(RENDER_VERSION));
    h.update(JSON.stringify((await getBuildingsManifest()).buildings));
    // the terrain generators themselves: a world change re-renders the map
    for (const f of ["src/lib/regions.ts", "src/lib/continent.ts", "src/lib/terrain/noise.ts", "src/lib/terrain/wildsTiles.json"]) {
      try { h.update(fs.readFileSync(path.join(process.cwd(), f))); } catch { /* not shipped: fine */ }
    }
    const dir = path.join(process.cwd(), "public", "assets", "maps");
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) h.update(f + fs.statSync(path.join(dir, f)).mtimeMs);
    return h.digest("hex").slice(0, 12);
  })();
  return versionMemo;
}

const raw = new Map<string, Promise<Buffer>>(); // in-memory RGBA (bounded below)
const RAW_CAP = 400;
function tileRaw(z: number, mx: number, my: number): Promise<Buffer> {
  const key = `${z}/${mx}/${my}`;
  let p = raw.get(key);
  if (p) { raw.delete(key); raw.set(key, p); return p; }
  p = z === 0 ? renderBase(mx, my) : renderZoom(z, mx, my);
  raw.set(key, p);
  p.catch(() => raw.delete(key));
  if (raw.size > RAW_CAP) raw.delete(raw.keys().next().value!);
  return p;
}

const EMPTY = sharp({ create: { width: MAP_TILE_W, height: MAP_TILE_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();

/** The PNG of map tile (z, mx, my): from disk if rendered before. */
export async function mapTilePng(z: number, mx: number, my: number): Promise<Buffer> {
  if (!Number.isInteger(z) || z < 0 || z > MAP_MAX_ZOOM || !Number.isInteger(mx) || !Number.isInteger(my) || !mapTileInBounds(z, mx, my)) return EMPTY;
  const file = path.join(CACHE_DIR, await mapVersion(), String(z), `${mx}_${my}.png`);
  try {
    return await fs.promises.readFile(file);
  } catch { /* not rendered yet */ }
  const png = await sharp(await tileRaw(z, mx, my), { raw: { width: MAP_TILE_W, height: MAP_TILE_H, channels: 4 } }).png().toBuffer();
  await fs.promises.mkdir(path.dirname(file), { recursive: true }).then(() => fs.promises.writeFile(file, png)).catch(() => {});
  return png;
}

// ── Fog of war ───────────────────────────────────────────────────────────
/** OR newly seen chunks into the character's blocks. */
export async function markSeen(characterId: number, chunks: ReadonlyArray<{ cx: number; cy: number }>): Promise<void> {
  for (const m of seenMasks(chunks)) {
    await db.insert(characterMapSeen).values({ characterId, bx: m.bx, by: m.by, mask: m.mask })
      .onConflictDoUpdate({ target: [characterMapSeen.characterId, characterMapSeen.bx, characterMapSeen.by], set: { mask: sql`${characterMapSeen.mask} | excluded.mask` } });
  }
}

/** The character's seen blocks overlapping a chunk box. */
export async function seenIn(characterId: number, box: { cx0: number; cx1: number; cy0: number; cy1: number }): Promise<SeenBlock[]> {
  const rows = await db.select().from(characterMapSeen).where(and(
    eq(characterMapSeen.characterId, characterId),
    gte(characterMapSeen.bx, Math.floor(box.cx0 / 8)), lte(characterMapSeen.bx, Math.floor(box.cx1 / 8)),
    gte(characterMapSeen.by, Math.floor(box.cy0 / 8)), lte(characterMapSeen.by, Math.floor(box.cy1 / 8)),
  ));
  return rows.map((r) => ({ bx: r.bx, by: r.by, mask: r.mask.toString() }));
}

// ── Markers ──────────────────────────────────────────────────────────────
/** Every waystone (manifest kind "waystone"): key, name, and its door (world px). */
export async function waystoneList(): Promise<{ key: string; name: string; x: number; y: number }[]> {
  const out: { key: string; name: string; x: number; y: number }[] = [];
  for (const e of (await getBuildingsManifest()).buildings) {
    if (e.kind !== "waystone") continue;
    const d = await getBuildingDoor(e.key);
    if (d) out.push({ key: e.key, name: e.name, x: d.x + 8, y: d.y });
  }
  return out;
}

const PLACE_KIND: Readonly<Record<string, MapPlace["kind"]>> = { inn: "inn", forge: "forge" };

/** What the map draws over its tiles, for one character. */
export async function mapMarkers(characterId: number): Promise<MapMarkers> {
  const manifest = (await getBuildingsManifest()).buildings;
  const [attuned, mine, stones] = await Promise.all([
    db.select({ key: characterWaystones.key }).from(characterWaystones).where(eq(characterWaystones.characterId, characterId)),
    db.select({ kind: lots.kind, buildingKey: lots.buildingKey }).from(lots).where(eq(lots.ownerId, characterId)),
    waystoneList(),
  ]);
  const have = new Set(attuned.map((a) => a.key));
  const waystones: MapWaystone[] = stones.map((w) => ({ ...w, attuned: have.has(w.key) }));
  const places: MapPlace[] = [];
  for (const e of manifest) {
    const kind = PLACE_KIND[e.kind] ?? (e.key === "cave_mouth" ? "cave" : null);
    if (!kind) continue;
    const d = await getBuildingDoor(e.key);
    if (d) places.push({ kind, name: e.name, x: d.x, y: d.y });
  }
  const myLots = [];
  for (const l of mine) {
    if (!l.buildingKey) continue;
    const d = await getBuildingDoor(l.buildingKey);
    const e = manifest.find((b) => b.key === l.buildingKey);
    if (d) myLots.push({ kind: l.kind, name: e?.name ?? l.buildingKey, x: d.x, y: d.y });
  }
  // Heartland names sit just above the King's Road, the caverns at their
  // middle, provinces at their seed points.
  const regions = PLACES.map((r) => ({
    name: r.name.charAt(0).toUpperCase() + r.name.slice(1),
    x: (r.label ? r.label.tx : (r.tx0 + r.tx1 + 1) / 2) * 16,
    y: (r.label ? r.label.ty : r.key === "caverns" ? (r.ty0 + r.ty1) / 2 : -2) * 16,
  }));
  regions.push({ name: "The Village", x: 32 * 16, y: 12 * 16 });
  return { version: await mapVersion(), bounds: MAP_BOUNDS, waystones, places, lots: myLots, regions };
}

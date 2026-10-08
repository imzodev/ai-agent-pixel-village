// Drawing the world map's pictures. Runs only in the background map workers
// (scripts/map-tile-worker.ts, at the lowest CPU priority) and the deploy
// script, never on the game server: each piece is drawn once per version and
// kept on disk, where the server serves it from (src/lib/worldAtlasServer.ts).
//
//   overview block  the terrain sampled every OVERVIEW_STEP tiles (src/lib/mapOverview.ts)
//   zoom 0 tile     8×8 chunks as drawn, then the buildings (renderBase)
//   zoom 1 tile     cut from the blocks it covers, buildings painted on
//   zoom z ≥ 2      the four zoom z−1 tiles below, shrunk 2×

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { terrainAt } from "./regions";
import { fullTilesets } from "./chunkGen";
import { WILDS_FIRSTGID, wildsGid } from "./terrain/wilds";
import { ensureFelledLoaded } from "./treesServer";
import { getBuildingsManifest, getTemplate } from "./buildingsServer";
import { CACHE_DIR, paint, renderBase, tilesetColors } from "./worldAtlasServer";
import { BLOCK_PH, BLOCK_PW, BLOCK_TH, BLOCK_TW, OVERVIEW_STEP, blockFile, blocksIn, overviewFrame, tileFile } from "./mapOverview";
import { MAP_TILE_H, MAP_TILE_W, mapTileInBounds, mapTileRect } from "./worldAtlas";
import type { MapSourceJson } from "@/types/map";

/** Write a file atomically (never a half-written picture). */
async function writeAtomic(file: string, data: Buffer): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, data);
  await fs.promises.rename(tmp, file);
}

// ── Overview blocks ─────────────────────────────────────────────────────
/** Draw an overview block (terrain only) and save it. */
export async function buildBlock(mapV: string, bx: number, by: number): Promise<void> {
  const file = blockFile(CACHE_DIR, mapV, bx, by);
  if (fs.existsSync(file)) return;
  await ensureFelledLoaded().catch(() => {});
  const wilds = fullTilesets().find((t) => t.firstgid === WILDS_FIRSTGID);
  const colors = wilds?.image ? await tilesetColors(wilds.image, false) : null;
  if (!colors) throw new Error("no Wilds tileset colours");
  const f = overviewFrame();
  const rgba = Buffer.alloc(BLOCK_PW * BLOCK_PH * 4);
  const over = (o: number, name: string | undefined) => {
    if (!name) return;
    const t = wildsGid(name) - WILDS_FIRSTGID, a = colors.cov[t];
    if (!a) return;
    rgba[o] = rgba[o] * (1 - a) + colors.rgb[t * 3] * a;
    rgba[o + 1] = rgba[o + 1] * (1 - a) + colors.rgb[t * 3 + 1] * a;
    rgba[o + 2] = rgba[o + 2] * (1 - a) + colors.rgb[t * 3 + 2] * a;
    rgba[o + 3] = 255;
  };
  for (let y = 0; y < BLOCK_PH; y++) for (let x = 0; x < BLOCK_PW; x++) {
    const tx = f.tx0 + bx * BLOCK_TW + x * OVERVIEW_STEP, ty = f.ty0 + by * BLOCK_TH + y * OVERVIEW_STEP;
    const c = terrainAt(tx, ty), o = (y * BLOCK_PW + x) * 4;
    over(o, c.ground === "grass" ? "grass_0" : c.ground);
    over(o, c.upper); over(o, c.lower); over(o, c.prop); over(o, c.canopy);
  }
  await writeAtomic(file, rgba);
}

/** Recently read blocks (bounded). */
const blockCache = new Map<string, Buffer>();
const BLOCK_CACHE = 64;
async function readBlock(mapV: string, bx: number, by: number): Promise<Buffer> {
  const file = blockFile(CACHE_DIR, mapV, bx, by);
  const hit = blockCache.get(file);
  if (hit) { blockCache.delete(file); blockCache.set(file, hit); return hit; }
  await buildBlock(mapV, bx, by);
  const buf = await fs.promises.readFile(file);
  blockCache.set(file, buf);
  if (blockCache.size > BLOCK_CACHE) blockCache.delete(blockCache.keys().next().value!);
  return buf;
}

// ── Tiles ───────────────────────────────────────────────────────────────
/** Zoom 1: the blocks' pixels 1:1, then the buildings painted on (sampled like the terrain). */
async function renderZoom1(mapV: string, mx: number, my: number): Promise<Buffer> {
  const W = MAP_TILE_W, H = MAP_TILE_H, f = overviewFrame();
  const rect = mapTileRect(1, mx, my);
  const px = Buffer.alloc(W * H * 4);
  for (const { bx, by } of blocksIn(rect, f)) {
    const block = await readBlock(mapV, bx, by);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const tx = rect.tx + x * OVERVIEW_STEP, ty = rect.ty + y * OVERVIEW_STEP;
      const lx = Math.floor((tx - f.tx0 - bx * BLOCK_TW) / OVERVIEW_STEP), ly = Math.floor((ty - f.ty0 - by * BLOCK_TH) / OVERVIEW_STEP);
      if (lx < 0 || ly < 0 || lx >= BLOCK_PW || ly >= BLOCK_PH) continue;
      block.copy(px, (y * W + x) * 4, (ly * BLOCK_PW + lx) * 4, (ly * BLOCK_PW + lx) * 4 + 4);
    }
  }
  for (const entry of (await getBuildingsManifest()).buildings) {
    if (entry.tx + 24 <= rect.tx || entry.tx >= rect.tx + rect.tw || entry.ty + 15 <= rect.ty || entry.ty >= rect.ty + rect.th) continue;
    const buf = Buffer.alloc(24 * 15 * 4);
    await paint((await getTemplate(entry)) as MapSourceJson, buf, 24, 15, 0, 0, 24);
    // every tile pixel over the building takes the building tile it samples
    const ox0 = Math.max(0, Math.floor((entry.tx - rect.tx) / OVERVIEW_STEP)), ox1 = Math.min(W - 1, Math.floor((entry.tx + 23 - rect.tx) / OVERVIEW_STEP));
    const oy0 = Math.max(0, Math.floor((entry.ty - rect.ty) / OVERVIEW_STEP)), oy1 = Math.min(H - 1, Math.floor((entry.ty + 14 - rect.ty) / OVERVIEW_STEP));
    for (let oy = oy0; oy <= oy1; oy++) for (let ox = ox0; ox <= ox1; ox++) {
      const x = rect.tx + ox * OVERVIEW_STEP - entry.tx, y = rect.ty + oy * OVERVIEW_STEP - entry.ty;
      if (x < 0 || y < 0 || x >= 24 || y >= 15) continue;
      const s = (y * 24 + x) * 4;
      if (buf[s + 3]) buf.copy(px, (oy * W + ox) * 4, s, s + 4);
    }
  }
  return px;
}

/** Zoom z ≥ 2: the four zoom z−1 tiles below, averaged 2×2. */
async function renderShrunk(mapV: string, tilesV: string, z: number, mx: number, my: number): Promise<Buffer> {
  const W = MAP_TILE_W, H = MAP_TILE_H;
  const px = Buffer.alloc(W * H * 4);
  for (let q = 0; q < 4; q++) {
    const sx = q % 2, sy = Math.floor(q / 2), cmx = mx * 2 + sx, cmy = my * 2 + sy;
    if (!mapTileInBounds(z - 1, cmx, cmy)) continue;
    await renderTile(mapV, tilesV, z - 1, cmx, cmy);
    const child = await sharp(tileFile(CACHE_DIR, tilesV, z - 1, cmx, cmy)).ensureAlpha().raw().toBuffer();
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

/** Draw map tile (z, mx, my) and save it as a PNG (no-op when it's there). */
export async function renderTile(mapV: string, tilesV: string, z: number, mx: number, my: number): Promise<void> {
  const file = tileFile(CACHE_DIR, tilesV, z, mx, my);
  if (fs.existsSync(file)) return;
  if (z === 0) await ensureFelledLoaded().catch(() => {});
  const px = z === 0 ? await renderBase(mx, my) : z === 1 ? await renderZoom1(mapV, mx, my) : await renderShrunk(mapV, tilesV, z, mx, my);
  await writeAtomic(file, await sharp(px, { raw: { width: MAP_TILE_W, height: MAP_TILE_H, channels: 4 } }).png().toBuffer());
}

// The whole-world map overview: the map at one pixel per OVERVIEW_STEP tiles,
// sampled once per map version from the terrain generators and saved under
// .cache/map/<version>/. Map tiles at zoom ≥ 1 are cut from it, so zooming
// out costs the same however big the world is (no chunk is generated).
// Built by scripts/build-map-overview.ts in its own process (started here on
// first need, or at deploy), so the game server never stalls on it.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { CHUNK_TILE_H, CHUNK_TILE_W } from "./chunkCollision";
import { MAP_BOUNDS } from "./worldAtlas";
import type { MapOverview } from "@/types/worldAtlas";

/** Tiles per overview pixel: zoom 1 is 1:1 with it. */
export const OVERVIEW_STEP = 2;

/** The overview's extent: the map bounds, in tiles. */
export function overviewFrame(): Omit<MapOverview, "rgba"> {
  const tx0 = MAP_BOUNDS.cx0 * CHUNK_TILE_W, ty0 = -MAP_BOUNDS.cy1 * CHUNK_TILE_H;
  const tw = (MAP_BOUNDS.cx1 - MAP_BOUNDS.cx0 + 1) * CHUNK_TILE_W, th = (MAP_BOUNDS.cy1 - MAP_BOUNDS.cy0 + 1) * CHUNK_TILE_H;
  return { tx0, ty0, step: OVERVIEW_STEP, width: Math.ceil(tw / OVERVIEW_STEP), height: Math.ceil(th / OVERVIEW_STEP) };
}

export const overviewFile = (cacheDir: string, version: string) => path.join(cacheDir, version, `overview_${OVERVIEW_STEP}.rgba`);

const g = globalThis as typeof globalThis & { __mapOverview?: { version: string; data: MapOverview | null; building: boolean } };

/**
 * The overview for this map version, or null while it's being built (the
 * build is started in the background the first time it's missing).
 */
export function mapOverview(cacheDir: string, version: string): MapOverview | null {
  let s = g.__mapOverview;
  if (!s || s.version !== version) s = g.__mapOverview = { version, data: null, building: false };
  if (s.data) return s.data;
  const file = overviewFile(cacheDir, version);
  if (fs.existsSync(file)) {
    s.data = { ...overviewFrame(), rgba: fs.readFileSync(file) };
    return s.data;
  }
  if (!s.building) {
    s.building = true;
    const state = s;
    // Its own process: sampling the world takes a minute or two of CPU.
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/build-map-overview.ts"], { stdio: "inherit", env: process.env, cwd: process.cwd() });
    child.on("exit", () => { state.building = false; });
    child.on("error", () => { state.building = false; });
  }
  return null;
}

/** Map tile (z ≥ 1) cut from the overview: each tile pixel averages its block. */
export function tileFromOverview(o: MapOverview, rect: { tx: number; ty: number }, z: number, w: number, h: number): Buffer {
  const px = Buffer.alloc(w * h * 4);
  const k = 2 ** z / o.step; // overview pixels per tile pixel, per side
  const ox = (rect.tx - o.tx0) / o.step, oy = (rect.ty - o.ty0) / o.step;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, gr = 0, b = 0, a = 0, n = 0;
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
      const sx = ox + x * k + dx, sy = oy + y * k + dy;
      if (sx < 0 || sy < 0 || sx >= o.width || sy >= o.height) continue;
      const s = (sy * o.width + sx) * 4, al = o.rgba[s + 3];
      r += o.rgba[s] * al; gr += o.rgba[s + 1] * al; b += o.rgba[s + 2] * al; a += al; n++;
    }
    if (a > 0) { const d = (y * w + x) * 4; px[d] = r / a; px[d + 1] = gr / a; px[d + 2] = b / a; px[d + 3] = Math.round(a / Math.max(1, n)); }
  }
  return px;
}

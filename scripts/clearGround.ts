// Which tiles are clear ground, for things placed in the world by a script
// (billboards: gen-billboard-spots.ts; Whistle's sheepfold: gen-sheepfold.ts).
// Loads the hand-made maps and the buildings once, on import.
import fs from "node:fs";
import path from "node:path";
import { CHUNK_TILE_H, CHUNK_TILE_W } from "../src/lib/chunkCollision";
import { roadTile, townDecorAt, townPathV } from "../src/lib/settlements";
import { terrainAt } from "../src/lib/regions";
import { onSiteGrid } from "../src/lib/homesteadSites";

// ── Which tiles are taken: anything but the ground in a hand-made map (the
// village's, which paint their grass on GroundUpper) or a building; for the
// generated land, whatever the terrain puts there (trees, rocks, water, paths;
// flowers and grass tufts are fine).
type Layer = { name?: string; type?: string; data?: number[] };
const AUTHORED_GROUND = new Set(["Ground", "GroundUpper"]);
const taken = new Set<string>();
const authored = new Set<string>();
const markLayers = (layers: Layer[] | undefined, ox: number, oy: number, w: number) => {
  for (const l of layers ?? []) {
    if (l.type !== "tilelayer" || AUTHORED_GROUND.has(l.name ?? "") || !Array.isArray(l.data)) continue;
    l.data.forEach((gid, i) => { if (gid > 0) taken.add(`${ox + (i % w)},${oy + Math.floor(i / w)}`); });
  }
};
for (const f of fs.readdirSync(path.join(process.cwd(), "public/assets/maps"))) {
  const m = f.match(/^map_(-?\d+)_(-?\d+)\.json$/);
  if (!m) continue;
  const cx = Number(m[1]), cy = Number(m[2]);
  authored.add(`${cx},${cy}`);
  const json = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/assets/maps", f), "utf8")) as { layers?: Layer[] };
  markLayers(json.layers, cx * CHUNK_TILE_W, -cy * CHUNK_TILE_H, CHUNK_TILE_W); // chunk cy points up
}
const openTerrain = (tx: number, ty: number): boolean => {
  const c = terrainAt(tx, ty);
  return !c.lower && !c.canopy && !c.collide && !c.prop && !/^(water_|swamp_|deep_|cave_)/.test(c.ground) && !(c.upper ?? "").startsWith("path_");
};
const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/buildings/buildings.json"), "utf8")) as { buildings: { file: string; tx: number; ty: number }[] };
for (const b of manifest.buildings) {
  const t = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", b.file.replace(/^\//, "")), "utf8")) as { layers?: Layer[]; width: number };
  markLayers(t.layers, b.tx, b.ty, t.width);
}

/** Nothing on it and nothing planned for it: no building, decor, path, road, water or homestead site. */
export function clearTile(tx: number, ty: number): boolean {
  const hand = authored.has(`${Math.floor(tx / CHUNK_TILE_W)},${-Math.floor(ty / CHUNK_TILE_H)}`);
  return !taken.has(`${tx},${ty}`) && (hand || openTerrain(tx, ty)) && !roadTile(tx, ty) && !townPathV(tx, ty) && !townPathV(tx + 1, ty + 1)
    && !townDecorAt(tx, ty) && !onSiteGrid(tx, ty);
}

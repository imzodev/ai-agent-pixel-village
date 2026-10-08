// Draw the whole world map (every zoom, src/lib/mapRender.ts) for the current
// version, so players never meet an undrawn map. Run at deploy; the server
// also does it by itself in the background at start (spare CPU only).
//
//   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/build-map.ts

import fs from "node:fs";
import path from "node:path";
import { renderTile } from "../src/lib/mapRender";
import { CACHE_DIR, mapVersion, tilesVersion } from "../src/lib/worldAtlasServer";
import { tilesAt } from "../src/lib/mapOverview";
import { MAP_MAX_ZOOM } from "../src/lib/worldAtlas";
import { pool } from "../src/db";

async function main() {
  const t0 = Date.now();
  const mapV = await mapVersion(), tilesV = await tilesVersion();
  let n = 0;
  for (const z of [...Array.from({ length: MAP_MAX_ZOOM }, (_, i) => i + 1), 0]) {
    const tiles = tilesAt(z);
    const tz = Date.now();
    for (const t of tiles) await renderTile(mapV, tilesV, t.z, t.mx, t.my);
    n += tiles.length;
    console.log(`[map] zoom ${z}: ${tiles.length} pictures in ${Math.round((Date.now() - tz) / 1000)} s`);
  }
  let bytes = 0;
  const walk = (d: string) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { if (f.isDirectory()) walk(path.join(d, f.name)); else bytes += fs.statSync(path.join(d, f.name)).size; } };
  walk(path.join(CACHE_DIR, tilesV));
  console.log(`[map] ${tilesV}: ${n} pictures, ${(bytes / 1e6).toFixed(1)} MB, in ${Math.round((Date.now() - t0) / 1000)} s`);
}

main().then(async () => { await pool.end(); process.exit(0); }, (e) => { console.error("[map] failed:", e); process.exit(1); });

// Build the whole-world map overview (src/lib/mapOverview.ts) for the current
// map version: one pixel per OVERVIEW_STEP tiles, coloured like the zoomed-in
// map (the average colour of each Wilds tile, then the building stamps).
// The server starts this by itself when the overview is missing; run it at
// deploy to have the map ready from the first request:
//
//   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/build-map-overview.ts

import fs from "node:fs";
import path from "node:path";
import { terrainAt } from "../src/lib/regions";
import { ensureFelledLoaded } from "../src/lib/treesServer";
import { fullTilesets } from "../src/lib/chunkGen";
import { WILDS_FIRSTGID, wildsGid } from "../src/lib/terrain/wilds";
import { CACHE_DIR, paint, tilesVersion, tilesetColors } from "../src/lib/worldAtlasServer";
import { getBuildingsManifest, getTemplate } from "../src/lib/buildingsServer";
import { overviewFile, overviewFrame } from "../src/lib/mapOverview";

type MapSource = Parameters<typeof paint>[0];

async function main() {
  const t0 = Date.now();
  const version = await tilesVersion(); // the open homestead rows are drawn too
  const file = overviewFile(CACHE_DIR, version);
  if (fs.existsSync(file)) { console.log(`[overview] ${version} already built`); return; }
  await ensureFelledLoaded().catch(() => {});
  const f = overviewFrame();
  const wilds = fullTilesets().find((t) => t.firstgid === WILDS_FIRSTGID);
  const colors = wilds?.image ? await tilesetColors(wilds.image, false) : null;
  if (!colors) throw new Error("no Wilds tileset colours");
  const rgba = Buffer.alloc(f.width * f.height * 4);
  const over = (o: number, name: string | undefined) => {
    if (!name) return;
    const t = wildsGid(name) - WILDS_FIRSTGID, a = colors.cov[t];
    if (!a) return;
    rgba[o] = rgba[o] * (1 - a) + colors.rgb[t * 3] * a;
    rgba[o + 1] = rgba[o + 1] * (1 - a) + colors.rgb[t * 3 + 1] * a;
    rgba[o + 2] = rgba[o + 2] * (1 - a) + colors.rgb[t * 3 + 2] * a;
    rgba[o + 3] = 255;
  };
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      const tx = f.tx0 + x * f.step, ty = f.ty0 + y * f.step;
      const c = terrainAt(tx, ty), o = (y * f.width + x) * 4;
      over(o, c.ground === "grass" ? "grass_0" : c.ground);
      over(o, c.upper); over(o, c.lower); over(o, c.prop); over(o, c.canopy);
    }
    if (y % 200 === 0) console.log(`[overview] ${Math.round((100 * y) / f.height)}%`);
  }
  // Building stamps (towns' lots, homes, inns…): painted at full size, then sampled.
  for (const entry of (await getBuildingsManifest()).buildings) {
    const W = 24, H = 15, buf = Buffer.alloc(W * H * 4);
    await paint((await getTemplate(entry)) as MapSource, buf, W, H, 0, 0, W);
    for (let y = 0; y < H; y += f.step) for (let x = 0; x < W; x += f.step) {
      const s = (y * W + x) * 4;
      if (!buf[s + 3]) continue;
      const ox = Math.floor((entry.tx + x - f.tx0) / f.step), oy = Math.floor((entry.ty + y - f.ty0) / f.step);
      if (ox < 0 || oy < 0 || ox >= f.width || oy >= f.height) continue;
      buf.copy(rgba, (oy * f.width + ox) * 4, s, s + 4);
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + ".tmp", rgba);
  fs.renameSync(file + ".tmp", file); // never a half-written overview
  console.log(`[overview] ${version}: ${f.width}×${f.height} in ${Math.round((Date.now() - t0) / 1000)} s`);
}

main().then(() => process.exit(0), (e) => { console.error("[overview] failed:", e); process.exit(1); });

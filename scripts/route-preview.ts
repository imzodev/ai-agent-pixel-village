// Draw a planned route over the world map, to check it by eye: it should
// keep to roads, cross bridges and go around lakes and cliffs.
//
//   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/route-preview.ts <fromTx,fromTy> <placeKey|toTx,toTy> [out.png]
//   e.g. scripts/route-preview.ts 45,10 building:inn_hollowmere /tmp/route.png
import sharp from "sharp";
import { worldRouter } from "../src/lib/nav/walkGrid";
import { placeByKey } from "../src/lib/nav/places";
import { mapPatchRaw } from "../src/lib/worldAtlasServer";

async function main() {
  const [fromArg, toArg, out = "route.png"] = process.argv.slice(2);
  const [fx, fy] = (fromArg ?? "").split(",").map(Number);
  let to: { tx: number; ty: number } | null = null;
  if (/^-?\d+,-?\d+$/.test(toArg ?? "")) { const [tx, ty] = toArg.split(",").map(Number); to = { tx, ty }; }
  else { const p = await placeByKey(toArg ?? ""); if (p) to = { tx: Math.floor(p.x / 16), ty: Math.floor(p.y / 16) }; }
  if (!Number.isFinite(fx) || !Number.isFinite(fy) || !to) { console.error("usage: route-preview.ts <fromTx,fromTy> <placeKey|toTx,toTy> [out.png]"); process.exit(1); }
  const t = performance.now();
  const r = await worldRouter.plan({ tx: fx, ty: fy }, to);
  if (!r) { console.error("no route"); process.exit(1); }
  console.log(`${r.tiles.length} tiles, ${r.legs.length - 1} legs, cost ${r.cost}, planned in ${(performance.now() - t).toFixed(0)}ms`);
  const xs = r.tiles.map((p) => p.tx), ys = r.tiles.map((p) => p.ty);
  const tx0 = Math.min(...xs) - 12, ty0 = Math.min(...ys) - 12, w = Math.max(...xs) - tx0 + 12, h = Math.max(...ys) - ty0 + 12;
  const px = await mapPatchRaw(tx0, ty0, w, h);
  for (const p of r.tiles) { const o = ((p.ty - ty0) * w + (p.tx - tx0)) * 4; px.set([255, 30, 30, 255], o); }
  await sharp(px, { raw: { width: w, height: h, channels: 4 } }).resize(w * 3, h * 3, { kernel: "nearest" }).png().toFile(out);
  console.log(`wrote ${out}`);
  process.exit(0);
}
void main();

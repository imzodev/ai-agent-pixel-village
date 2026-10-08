// Place the lair bosses' lairs (src/lib/lairs.ts) in the far lands: for each
// boss, open walkable ground in one of its lands at its danger tier, as far
// as can be from the towns and the other lairs. Deterministic.
//
//   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/gen-lairs.ts
//
// Writes src/lib/lairsData.json. The continent keeps a clearing around each
// (continent.ts CLEARINGS), so re-run gen-relics afterwards.
import fs from "node:fs";
import path from "node:path";
import { CONTINENT, biomeAt, inHeartland, tierAt } from "../src/lib/continent";
import { TOWNS, townAt } from "../src/lib/settlements";
import { openGround } from "../src/lib/forage";
import { LAIR_BOSSES } from "../src/lib/lairs";
import type { LairSpot } from "../src/types/lairs";

const spots: LairSpot[] = [];
const awayFrom = (tx: number, ty: number) => Math.min(
  ...TOWNS.map((t) => Math.hypot(t.sq.tx + 12 - tx, t.sq.ty + 7 - ty)),
  ...spots.map((s) => Math.hypot(s.tx - tx, s.ty - ty)),
);
for (const b of LAIR_BOSSES) {
  let best: { tx: number; ty: number; score: number } | null = null;
  for (let ty = CONTINENT.ty0 + 30; ty < CONTINENT.ty1 - 30; ty += 12) for (let tx = CONTINENT.tx0 + 30; tx < CONTINENT.tx1 - 30; tx += 12) {
    if (inHeartland(tx, ty) || townAt(tx, ty) || !b.biomes.includes(biomeAt(tx, ty)) || tierAt(tx, ty) < b.tier) continue;
    // a roomy patch of its own land: open ground all around
    let ok = true;
    for (let dy = -6; dy <= 6 && ok; dy += 3) for (let dx = -6; dx <= 6 && ok; dx += 3) if (!b.biomes.includes(biomeAt(tx + dx, ty + dy)) || !openGround(tx + dx, ty + dy)) ok = false;
    if (!ok) continue;
    const score = Math.min(awayFrom(tx, ty), 400) - Math.abs(tierAt(tx, ty) - b.tier) * 200;
    if (!best || score > best.score) best = { tx, ty, score };
  }
  if (!best) { console.warn(`no lair for the ${b.name}`); continue; }
  spots.push({ kind: b.kind, tx: best.tx, ty: best.ty });
  console.log(`${b.name.padEnd(12)} ${b.lair.padEnd(18)} at (${best.tx}, ${best.ty}), tier ${tierAt(best.tx, best.ty)}, ${biomeAt(best.tx, best.ty)}`);
}
fs.writeFileSync(path.join(process.cwd(), "src/lib/lairsData.json"), JSON.stringify(spots, null, 1) + "\n");
process.exit(0);

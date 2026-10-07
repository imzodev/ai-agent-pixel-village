// Write the homesteads' planned lots (src/lib/lotDistricts.ts) into
// public/buildings/buildings.json, and give every lot its `row`.
//
//   npx tsx --tsconfig tsconfig.json scripts/gen-lot-districts.ts
//
// The original lots are row 0 of their kind (always open). Planned lots are
// keyed `<kind>_r<row>_<n>` and stay closed (unstamped, unclaimable) until
// their row opens (src/lib/lotRowsServer.ts). A planned lot that would
// stand on a road, a town or another building is left out. Idempotent:
// re-running replaces the planned lots.

import fs from "node:fs";
import path from "node:path";
import { plannedLots, rowIndex } from "../src/lib/lotDistricts";
import { ROADS, townAt } from "../src/lib/settlements";

const W = 24, H = 15;
const file = path.join(process.cwd(), "public/buildings/buildings.json");
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
const LOT_KINDS = new Set(["land", "ranch", "vineyard", "workshop"]);
const TEMPLATE: Record<string, string> = { land: "/buildings/land_lot.json", ranch: "/buildings/ranch_lot.json", vineyard: "/buildings/vineyard_lot.json", workshop: "/buildings/workshop_lot.json" };
const NAME: Record<string, string> = { land: "Homestead Plot", ranch: "Homestead Ranch", vineyard: "Homestead Vineyard", workshop: "Hollowmere Workshop" };

// Keep everything but the old planned lots; the originals become row 0.
manifest.buildings = manifest.buildings.filter((b: { key: string }) => !/_r\d+_\d+$/.test(b.key));
const template = (kind: string) => manifest.buildings.find((b: { kind: string }) => b.kind === kind);
for (const b of manifest.buildings) if (LOT_KINDS.has(b.kind)) b.row = `${b.kind}_0`;

const taken = manifest.buildings.map((b: { tx: number; ty: number }) => ({ x0: b.tx, y0: b.ty, x1: b.tx + W - 1, y1: b.ty + H - 1 }));
const roadTiles = new Set(ROADS.flatMap((r) => r.map(([x, y]) => `${x},${y}`)));
const clear = (tx: number, ty: number) => {
  if (taken.some((r: { x0: number; y0: number; x1: number; y1: number }) => tx <= r.x1 && tx + W - 1 >= r.x0 && ty <= r.y1 && ty + H - 1 >= r.y0)) return false;
  for (let y = ty - 1; y <= ty + H; y++) for (let x = tx - 1; x <= tx + W; x++) if (roadTiles.has(`${x},${y}`) || townAt(x, y)) return false;
  return true;
};

const perRow = new Map<string, number>();
let added = 0, skipped = 0;
for (const lot of plannedLots()) {
  if (!clear(lot.tx, lot.ty)) { skipped++; continue; }
  const base = template(lot.kind);
  const n = (perRow.get(lot.row) ?? 0) + 1;
  perRow.set(lot.row, n);
  manifest.buildings.push({
    key: `${lot.kind}_r${rowIndex(lot.row)}_${n}`, file: TEMPLATE[lot.kind], name: `${NAME[lot.kind]} ${rowIndex(lot.row)}-${n}`,
    kind: lot.kind, description: base?.description ?? "", color: base?.color ?? "#a07850", menu: [], reservable: false,
    price: base?.price ?? 0, row: lot.row, tx: lot.tx, ty: lot.ty,
  });
  taken.push({ x0: lot.tx, y0: lot.ty, x1: lot.tx + W - 1, y1: lot.ty + H - 1 });
  added++;
}
fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
const byKind: Record<string, number> = {};
for (const b of manifest.buildings) if (LOT_KINDS.has(b.kind)) byKind[b.kind] = (byKind[b.kind] ?? 0) + 1;
console.log(`planned ${added} lots in ${perRow.size} rows (${skipped} left out: road, town or building); capacity by kind:`, byKind);

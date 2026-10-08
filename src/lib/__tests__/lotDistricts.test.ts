// The homesteads: where the planned lot rows stand, and when they open.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { LANE_TX, LANE_W, onLane, plannedLots, rowIndex } from "@/lib/lotDistricts";
import { OPEN_AT, entryIsOpen, nextRowToOpen } from "@/lib/lotRows";
import { inHomesteads } from "@/lib/continent";
import { ROADS } from "@/lib/settlements";

type Entry = { key: string; kind: string; tx: number; ty: number; row?: string };
const manifest = JSON.parse(fs.readFileSync("public/buildings/buildings.json", "utf8")) as { buildings: Entry[] };
const LOT_KINDS = ["land", "ranch", "vineyard", "workshop", "orchard"];
const lotsOf = (kind: string) => manifest.buildings.filter((b) => b.kind === kind);
const overlap = (a: Entry, b: Entry) => a.tx < b.tx + 24 && b.tx < a.tx + 24 && a.ty < b.ty + 15 && b.ty < a.ty + 15;

describe("the homestead plan", () => {
  it("every planned lot stands in the homesteads, on the grid, off the lanes", () => {
    for (const l of plannedLots()) {
      for (const [x, y] of [[l.tx, l.ty], [l.tx + 23, l.ty + 14]]) expect(inHomesteads(x, y), `${l.row} ${l.tx},${l.ty}`).toBe(true);
      for (const x of LANE_TX) expect(l.tx + 23 < x || l.tx >= x + LANE_W, `${l.row} at ${l.tx} on the lane at ${x}`).toBe(true);
    }
  });
  it("a row is one kind on one line; rows are numbered from 1 (orchards, newer, from 0)", () => {
    const rows = new Map<string, Set<string>>();
    for (const l of plannedLots()) rows.set(l.row, (rows.get(l.row) ?? new Set()).add(`${l.kind}@${l.ty}`));
    for (const [row, s] of rows) { expect(s.size, row).toBe(1); expect(rowIndex(row)).toBeGreaterThanOrEqual(row.startsWith("orchard_") ? 0 : 1); }
  });
  it("in the manifest: every lot has a row, keys are unique, nothing overlaps, no lot on a road", () => {
    const lots = manifest.buildings.filter((b) => LOT_KINDS.includes(b.kind));
    expect(lots.every((b) => b.row?.startsWith(`${b.kind}_`))).toBe(true);
    expect(new Set(manifest.buildings.map((b) => b.key)).size).toBe(manifest.buildings.length);
    const planned = lots.filter((b) => rowIndex(b.row!) > 0);
    for (const p of planned) for (const o of manifest.buildings) if (o !== p) expect(overlap(p, o), `${p.key} × ${o.key}`).toBe(false);
    const road = new Set(ROADS.flatMap((r) => r.map(([x, y]) => `${x},${y}`)));
    for (const p of planned) for (let y = p.ty; y < p.ty + 15; y++) for (let x = p.tx; x < p.tx + 24; x++) expect(road.has(`${x},${y}`), `${p.key} on a road`).toBe(false);
  }, 30_000);
  it("holds about 5–8× today's lots of each kind, and orchards", () => {
    for (const k of ["land", "ranch", "vineyard"]) expect(lotsOf(k).length).toBeGreaterThanOrEqual(50);
    expect(lotsOf("orchard").length).toBeGreaterThanOrEqual(40);
    expect(lotsOf("workshop").length).toBeGreaterThanOrEqual(110);
  });
  it("lanes are paths through the district, not over the village farms", () => {
    expect(onLane(-227, 150)).toBe(true);
    expect(onLane(21, 60)).toBe(false); // the vineyards' row stands there
    expect(onLane(21, 150)).toBe(true);
    expect(onLane(-227, 20)).toBe(false); // the heartland above is untouched
  });
});

describe("rows opening", () => {
  const entries: { key: string; kind: string; row?: string }[] = [
    ...[1, 2, 3, 4, 5].map((n) => ({ key: `ranch_${n}`, kind: "ranch", row: "ranch_0" })),
    ...[1, 2, 3].map((n) => ({ key: `ranch_r1_${n}`, kind: "ranch", row: "ranch_1" })),
    ...[1, 2, 3].map((n) => ({ key: `ranch_r2_${n}`, kind: "ranch", row: "ranch_2" })),
    { key: "village_house", kind: "home" },
  ];
  it("row 0 and non-lots are always in the world; others once opened", () => {
    expect(entryIsOpen({ row: "ranch_0" }, new Set())).toBe(true);
    expect(entryIsOpen({}, new Set())).toBe(true);
    expect(entryIsOpen({ row: "ranch_1" }, new Set())).toBe(false);
    expect(entryIsOpen({ row: "ranch_1" }, new Set(["ranch_1"]))).toBe(true);
  });
  it(`opens the next row once ${OPEN_AT * 100}% of the open lots are owned, lowest first`, () => {
    const owned = (n: number) => new Set(entries.filter((e) => e.row === "ranch_0").slice(0, n).map((e) => e.key));
    expect(nextRowToOpen("ranch", entries, new Set(), owned(3))).toBeNull(); // 3/5
    expect(nextRowToOpen("ranch", entries, new Set(), owned(4))).toBe("ranch_1"); // 4/5
    // with row 1 open there are 8 open lots: 4 owned isn't enough
    expect(nextRowToOpen("ranch", entries, new Set(["ranch_1"]), owned(4))).toBeNull();
    const all = new Set(entries.filter((e) => e.kind === "ranch").map((e) => e.key));
    expect(nextRowToOpen("ranch", entries, new Set(["ranch_1"]), all)).toBe("ranch_2");
    expect(nextRowToOpen("ranch", entries, new Set(["ranch_1", "ranch_2"]), all)).toBeNull(); // none left
    expect(nextRowToOpen("vineyard", entries, new Set(), all)).toBeNull();
  });
});

describe("lots stand on clear ground", () => {
  it("no rock, bush, cliff or tree inside any lot's yard (the lot art would hide it)", async () => {
    const { terrainWalkable } = await import("@/lib/regions");
    for (const b of manifest.buildings.filter((x) => LOT_KINDS.includes(x.kind))) {
      for (let ty = b.ty + 2; ty < b.ty + 15; ty += 2) for (let tx = b.tx; tx < b.tx + 24; tx += 2) expect(terrainWalkable(tx, ty), `${b.key} at ${tx},${ty}`).toBe(true);
    }
  }, 60_000);
});

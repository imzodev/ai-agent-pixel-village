// The Village Ranch: its art, paddocks and gates line up, on cleared land
// east of the village, away from the enemies (the east field moved past it).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import LAYOUT from "@/lib/villageRanch.json";
import { FOX_DEN, VILLAGE_RANCH, VILLAGE_RANCH_STAMPS, paddock, paddockTiles, ranchPickSpots } from "@/lib/villageRanch";
import { RANCH_PICKS } from "@/lib/ranchPicks";
import { FORAGE_COOLDOWN_MS, isForage } from "@/lib/forage";
import { CROP_KINDS } from "@/lib/crops";
import { inHeartland } from "@/lib/continent";
import { regionAtTile, terrainWalkable } from "@/lib/regions";
import { ENEMY_ZONES } from "@/lib/progression";
import { WILD_ZONES } from "@/lib/worldmap";
import { blockedFromChunk } from "@/lib/chunkCollision";
import type { Rect } from "@/lib/worldmap";
import type { RanchSpecies } from "@/types/villageRanch";

const ITEM_SOURCE = fs.readFileSync("src/lib/seed.ts", "utf8"); // ITEM_DEFS (importing seed.ts needs a database)
const manifest = JSON.parse(fs.readFileSync("public/buildings/buildings.json", "utf8"));
const entries: { key: string; tx: number; ty: number; file: string }[] = Array.isArray(manifest) ? manifest : manifest.buildings;
const templates = new Map<string, { layers: { name: string; data: number[] }[] }>();
const templateOf = (file: string) => {
  if (!templates.has(file)) templates.set(file, JSON.parse(fs.readFileSync(`public${file}`, "utf8")));
  return templates.get(file)!;
};
/** Solid the way movement sees it: Collision or any DecorationLower art (chunkCollision.ts). */
const blocked = (tx: number, ty: number): boolean => {
  const s = VILLAGE_RANCH_STAMPS.find((st) => tx >= st.tx && tx < st.tx + 24 && ty >= st.ty && ty < st.ty + 15)!;
  return blockedFromChunk(templateOf(s.file)).has((ty - s.ty) * 24 + (tx - s.tx));
};
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const RANCH_PX: Rect = { x: VILLAGE_RANCH.tx * 16, y: VILLAGE_RANCH.ty * 16, w: VILLAGE_RANCH.w * 16, h: VILLAGE_RANCH.h * 16 };
const SPECIES = Object.keys(LAYOUT.paddocks) as RanchSpecies[];
const { origin: o, fence } = LAYOUT;

describe("the Village Ranch", () => {
  it("is 72×75 tiles of stamps east of the village, each in the buildings manifest", () => {
    expect([VILLAGE_RANCH.w, VILLAGE_RANCH.h]).toEqual([72, 75]);
    expect(VILLAGE_RANCH.tx).toBeGreaterThan(121); // past the village's last cabins
    const covered = new Set<string>();
    for (const s of VILLAGE_RANCH_STAMPS) {
      expect(entries.find((e) => e.key === s.key)).toMatchObject({ tx: s.tx, ty: s.ty, file: s.file });
      for (let r = 0; r < 15; r++) for (let c = 0; c < 24; c++) covered.add(`${s.tx + c},${s.ty + r}`);
    }
    expect(covered.size).toBe(72 * 75);
  });

  it("is cleared land: heartland with no trees, inside the fence and in a margin around it", () => {
    for (let ty = VILLAGE_RANCH.ty - 3; ty < VILLAGE_RANCH.ty + VILLAGE_RANCH.h + 3; ty += 2) {
      for (let tx = VILLAGE_RANCH.tx; tx < VILLAGE_RANCH.tx + VILLAGE_RANCH.w + 6; tx += 2) {
        expect(inHeartland(tx, ty), `${tx},${ty}`).toBe(true);
        expect(terrainWalkable(tx, ty), `${tx},${ty}`).toBe(true);
      }
    }
  });

  it("keeps each kind in its own paddock, inside the fence, apart from the others", () => {
    for (const sp of SPECIES) {
      const [tx, ty, w, h] = paddockTiles(sp);
      expect(tx > o.tx + fence.left && tx + w - 1 < o.tx + fence.right && ty > o.ty + fence.top && ty + h - 1 < o.ty + fence.bottom, sp).toBe(true);
      // where the animals stand when they're (re)zoned: the paddock's middle
      expect(blocked(tx + Math.floor(w / 2), ty + Math.floor(h / 2)), `${sp}'s middle`).toBe(false);
      // mostly open ground to wander on
      let open = 0;
      for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (!blocked(tx + c, ty + r)) open++;
      expect(open / (w * h), sp).toBeGreaterThan(0.8);
      for (const other of SPECIES) if (other !== sp) expect(overlaps(paddock(sp), paddock(other)), `${sp} / ${other}`).toBe(false);
    }
  });

  it("blocks only where it means to: no lower-layer art on open tiles", () => {
    for (const s of VILLAGE_RANCH_STAMPS) {
      const t = templateOf(s.file);
      const collision = t.layers.find((l) => l.name === "Collision")!.data;
      const lower = t.layers.find((l) => l.name === "DecorationLower")!.data;
      lower.forEach((g, i) => expect(g === 0 || collision[i] === 1, `${s.key} tile ${i % 24},${Math.floor(i / 24)}`).toBe(true));
    }
  });

  it("opens every gate and every gap between the paddocks across its whole width", () => {
    const open = (c: number, r: number) => expect(blocked(o.tx + c, o.ty + r), `${o.tx + c},${o.ty + r}`).toBe(false);
    for (const [a, b] of LAYOUT.gates.south) for (let c = a; c <= b; c++) for (const r of [fence.bottom - 1, fence.bottom, fence.bottom + 1]) open(c, r);
    for (const [a, b] of LAYOUT.gates.west) for (let r = a; r <= b; r++) for (const c of [fence.left - 1, fence.left, fence.left + 1]) open(c, r);
    for (const [a, b] of LAYOUT.gates.east) for (let r = a; r <= b; r++) for (const c of [fence.right - 1, fence.right, fence.right + 1]) open(c, r);
    for (const [row, , , gaps] of LAYOUT.inner.h as [number, number, number, number[][]][]) for (const [a, b] of gaps) for (let c = a; c <= b; c++) for (const r of [row - 1, row, row + 1]) open(c, r);
    for (const [col, , , gaps] of LAYOUT.inner.v as [number, number, number, number[][]][]) for (const [a, b] of gaps) for (let r = a; r <= b; r++) for (const c of [col - 1, col, col + 1]) open(c, r);
  });

  it("leaves the fox a wide way in: the east gap lines up with a gap into the hen yard", () => {
    // Goal walks plan with a doubled foot box and a greedy search, so a
    // narrow gap is as good as a wall: keep both openings 4+ rows and shared.
    const hen = LAYOUT.paddocks.chicken; // local columns, like the fences
    const henCol = (LAYOUT.inner.v as [number, number, number, number[][]][]).find(([col]) => col === hen[0] + hen[2] + 1)!;
    const shared = (a: number[], b: number[]) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]) + 1;
    expect(LAYOUT.gates.east.some((g) => henCol[3].some((h) => shared(g, h) >= 4))).toBe(true);
    const denRows = [FOX_DEN.y / 16, (FOX_DEN.y + FOX_DEN.h) / 16 - 1];
    expect(LAYOUT.gates.east.some(([a, b]) => o.ty + a <= denRows[1] && o.ty + b >= denRows[0])).toBe(true); // the den is beside it
  });

  it("keeps enemies off the ranch, and the fox's den just outside it on open ground", () => {
    for (const z of ENEMY_ZONES) expect(overlaps(z.rect, RANCH_PX), z.name).toBe(false);
    for (const z of WILD_ZONES) expect(overlaps(z, RANCH_PX)).toBe(false);
    expect(overlaps(FOX_DEN, RANCH_PX)).toBe(false);
    for (let y = FOX_DEN.y; y < FOX_DEN.y + FOX_DEN.h; y += 16) for (let x = FOX_DEN.x; x < FOX_DEN.x + FOX_DEN.w; x += 16) {
      const tx = Math.floor(x / 16), ty = Math.floor(y / 16);
      expect(inHeartland(tx, ty) && terrainWalkable(tx, ty), `fox den ${tx},${ty}`).toBe(true);
    }
  });

  it("lets anyone pick its garden and honey, each spot within reach of a path", () => {
    const spots = ranchPickSpots();
    expect(new Set(spots.map(([k]) => k))).toEqual(new Set(Object.keys(RANCH_PICKS)));
    for (const [kind, item, tx, ty] of spots) {
      expect(RANCH_PICKS[kind].item).toBe(item);
      expect(isForage(kind) && FORAGE_COOLDOWN_MS[kind] > 0, kind).toBe(true); // personal, with a cooldown
      expect(CROP_KINDS[kind]?.yield, kind).toBeGreaterThan(0);
      expect(ITEM_SOURCE.includes(`key: "${item}"`), `${item} is an item (src/lib/seed.ts ITEM_DEFS)`).toBe(true);
      expect(tx > o.tx + fence.left && tx < o.tx + fence.right && ty > o.ty + fence.top && ty < o.ty + fence.bottom).toBe(true);
      // a walkable tile next to it, so it's within the 90 px gather reach
      const near = [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => !blocked(tx + dx, ty + dy));
      expect(near, `${kind} at ${tx},${ty}`).toBe(true);
    }
  });

  it("is a named place you walk into", () => {
    expect(regionAtTile(VILLAGE_RANCH.tx + 20, VILLAGE_RANCH.ty + 30)?.key).toBe("village_ranch");
    expect(regionAtTile(VILLAGE_RANCH.tx - 10, VILLAGE_RANCH.ty + 30)?.key).not.toBe("village_ranch");
  });
});

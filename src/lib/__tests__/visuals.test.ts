// The aesthetic pass: the village is served restyled (no old grass / sand
// tiles left, no GID clashes), the redrawn house templates keep their door
// and footprint, and the water tiles animate.

import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { readAuthored, restyleAuthored } from "@/lib/villageRestyle";
import { doorTileOf, footprintOf } from "@/lib/buildingManifest";
import { WILDS_FIRSTGID, WILDS_TILE_ANIMATIONS } from "@/lib/terrain/wilds";

const OLD_GRASS = [4952, 4953, 4954];
const isOldPath = (g: number) => {
  const l = g - 4701, r = Math.floor(l / 25), c = l % 25;
  return g >= 4701 && r >= 12 && r <= 16 && c >= 5 && c <= 9;
};

describe("village restyle", () => {
  for (const [cx, cy] of [[0, 0], [1, -1], [-1, 1], [-2, -1]]) {
    it(`chunk ${cx},${cy}: Wilds grass and paths, nothing else changed`, async () => {
      const src = await readAuthored(cx, cy);
      expect(src, "authored chunk exists").not.toBeNull();
      const out = await restyleAuthored(cx, cy, src!);
      const layer = (m: typeof out, n: string) => m.layers.find((l) => l.name === n)?.data ?? [];
      expect(layer(out, "Ground").some((g) => OLD_GRASS.includes(g))).toBe(false);
      expect(layer(out, "GroundUpper").some(isOldPath)).toBe(false);
      // collision layers untouched
      expect(layer(out, "DecorationLower")).toEqual(layer(src!, "DecorationLower"));
      expect(layer(out, "Collision")).toEqual(layer(src!, "Collision"));
      // Wilds sits past every other tileset's range
      const wilds = out.tilesets.find((t) => t.name === "Wilds")!;
      for (const t of out.tilesets) if (t !== wilds) expect(t.firstgid + (t.tilecount ?? 0)).toBeLessThanOrEqual(wilds.firstgid);
    });
  }
});

describe("house templates", () => {
  for (const [file, top] of [["cabin_1", 8], ["cabin_2", 8], ["house_1", 5], ["house_2", 5]] as const) {
    it(`${file} keeps its door and footprint`, () => {
      const t = JSON.parse(fs.readFileSync(`public/buildings/${file}.json`, "utf8"));
      expect(doorTileOf(t)).toEqual({ dx: 17, dy: 12 });
      expect(footprintOf(t)).toEqual({ x: 10, y: top, tw: 10, th: 13 - top });
    });
  }
});

describe("water animation", () => {
  it("every animated tile has 4 frames inside the Wilds sheet", () => {
    expect(WILDS_TILE_ANIMATIONS.length).toBeGreaterThan(10);
    for (const a of WILDS_TILE_ANIMATIONS) {
      expect(a.animation).toHaveLength(4);
      expect(a.id + WILDS_FIRSTGID).toBeGreaterThanOrEqual(WILDS_FIRSTGID);
    }
  });
});

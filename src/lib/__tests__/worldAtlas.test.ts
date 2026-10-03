// The world map: tile / chunk / block geometry (anywhere in a huge world),
// fog-of-war masks, travel cost, and the waystones in the manifest.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAP_BOUNDS, MAP_TILE_H, MAP_TILE_W, TRAVEL_COST, chunkInBounds, chunkOfTile, chunkTile, chunksAround,
  mapTileInBounds, mapTileRect, seenBit, seenChunks, seenMasks, travelCost,
} from "@/lib/worldAtlas";

describe("geometry", () => {
  it("chunks and tiles round-trip, including far away and negative", () => {
    for (const [cx, cy] of [[0, 0], [-1, 1], [4000, -5000], [-4000, 5000], [-35, 32]]) {
      const t = chunkTile(cx, cy);
      expect(chunkOfTile(t.tx, t.ty)).toEqual({ cx, cy });
      expect(chunkOfTile(t.tx + 23, t.ty + 14)).toEqual({ cx, cy });
    }
  });
  it("a zoom-0 map tile is 8×8 chunks; each zoom doubles it", () => {
    expect(mapTileRect(0, 0, 0)).toEqual({ tx: 0, ty: 0, tw: MAP_TILE_W, th: MAP_TILE_H });
    expect(MAP_TILE_W).toBe(192);
    expect(MAP_TILE_H).toBe(120);
    expect(mapTileRect(2, -1, 3)).toEqual({ tx: -768, ty: 1440, tw: 768, th: 480 });
  });
  it("knows which tiles touch the rendered world", () => {
    expect(mapTileInBounds(0, 0, 0)).toBe(true); // the village
    expect(mapTileInBounds(0, -4, 0)).toBe(true); // Brightwater
    expect(mapTileInBounds(0, 50, 0)).toBe(false);
    expect(mapTileInBounds(5, 0, 0)).toBe(true);
    expect(chunkInBounds(0, 0)).toBe(true);
    expect(chunkInBounds(MAP_BOUNDS.cx1 + 1, 0)).toBe(false);
  });
});

describe("fog of war", () => {
  it("packs chunks into 64-bit block masks and back", () => {
    const chunks = [{ cx: 0, cy: 0 }, { cx: 7, cy: 7 }, { cx: -1, cy: -1 }, { cx: 4000, cy: -5000 }, { cx: -4000, cy: 4999 }];
    const masks = seenMasks(chunks);
    const back = seenChunks(masks.map((m) => ({ bx: m.bx, by: m.by, mask: m.mask.toString() })));
    expect([...back].sort()).toEqual(chunks.map((c) => `${c.cx},${c.cy}`).sort());
    // the top bit (chunk 7,7 of a block) survives as a negative signed bigint
    expect(seenBit(7, 7).bit.toString()).toBe((BigInt(1) << BigInt(63)).toString());
  });
  it("ORs chunks of the same block together", () => {
    const masks = seenMasks([{ cx: 0, cy: 0 }, { cx: 1, cy: 0 }, { cx: 0, cy: 1 }]);
    expect(masks).toHaveLength(1);
    expect(seenChunks([{ bx: 0, by: 0, mask: masks[0].mask.toString() }]).size).toBe(3);
  });
  it("you see the chunk you're in and its neighbours", () => {
    const around = chunksAround(8, 8);
    expect(around).toHaveLength(9);
    expect(around).toContainEqual({ cx: 0, cy: 0 });
    expect(around).toContainEqual({ cx: -1, cy: 1 });
  });
});

describe("waystones", () => {
  it("free from a waystone, a fee from anywhere else", () => {
    expect(travelCost(true)).toBe(0);
    expect(travelCost(false)).toBe(TRAVEL_COST);
  });
  it("seven waystones, all inside the mapped world", () => {
    const m = JSON.parse(fs.readFileSync("public/buildings/buildings.json", "utf8"));
    const stones = m.buildings.filter((b: { kind: string }) => b.kind === "waystone");
    expect(stones).toHaveLength(7);
    for (const s of stones) {
      const c = chunkOfTile(s.tx + 12, s.ty + 12);
      expect(chunkInBounds(c.cx, c.cy), s.key).toBe(true);
    }
  });
});

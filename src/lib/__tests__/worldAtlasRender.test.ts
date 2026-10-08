// The world map's pictures: a zoom-0 tile is drawn fully; tiles off the world
// come back blank without any drawing; and the overview's blocks cover each
// tile exactly (src/lib/mapOverview.ts).
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("@/db", () => ({ db: {} })); // the renderer never touches the DB
// No homestead rows open beyond the first (no DB here).
vi.mock("@/lib/lotRowsServer", () => ({ openRows: async () => new Set(), openRowsVersion: () => 0, openRowsSig: () => "" }));

import { mapTilePng, renderBase } from "@/lib/worldAtlasServer";
import { BLOCK_TH, BLOCK_TW, blockOf, blocksIn, overviewFrame } from "@/lib/mapOverview";
import { MAP_TILE_H, MAP_TILE_W, mapTileRect } from "@/lib/worldAtlas";

describe("map tiles", () => {
  it("draws the village tile fully", async () => {
    const px = await renderBase(0, 0);
    let n = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 0) n++;
    expect(px.length).toBe(MAP_TILE_W * MAP_TILE_H * 4);
    expect(n / (MAP_TILE_W * MAP_TILE_H)).toBeGreaterThan(0.99);
  }, 30_000);
  it("is blank off the mapped world, without drawing anything", async () => {
    const { info, data } = await sharp((await mapTilePng(0, 500, 500))!).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([MAP_TILE_W, MAP_TILE_H]);
    expect(data.every((v, i) => i % 4 !== 3 || v === 0)).toBe(true);
  });
});

describe("overview blocks", () => {
  it("a zoom-1 tile needs only the blocks it covers; the whole world needs them all", () => {
    const f = overviewFrame();
    const r = mapTileRect(1, 0, 0);
    const blocks = blocksIn(r);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.length).toBeLessThanOrEqual(9);
    for (const b of blocks) {
      const x0 = f.tx0 + b.bx * BLOCK_TW, y0 = f.ty0 + b.by * BLOCK_TH;
      expect(x0 < r.tx + r.tw && r.tx < x0 + BLOCK_TW && y0 < r.ty + r.th && r.ty < y0 + BLOCK_TH).toBe(true); // overlaps
    }
    expect(blocksIn({ tx: f.tx0, ty: f.ty0, tw: f.blocksX * BLOCK_TW, th: f.blocksY * BLOCK_TH })).toHaveLength(f.blocksX * f.blocksY);
  });
  it("finds the block of a tile, and nothing outside the world", () => {
    const f = overviewFrame();
    expect(blockOf(f.tx0, f.ty0)).toEqual({ bx: 0, by: 0 });
    expect(blockOf(f.tx0 + BLOCK_TW, f.ty0 + BLOCK_TH - 1)).toEqual({ bx: 1, by: 0 });
    expect(blockOf(f.tx0 - 1, f.ty0)).toBeNull();
  });
});

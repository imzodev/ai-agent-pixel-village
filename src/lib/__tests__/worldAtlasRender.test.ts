// The map renderer: a zoom-0 tile is the right size and drawn; tiles off
// the mapped world come back transparent.
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("@/db", () => ({ db: {} })); // the renderer never touches the DB

import { mapTilePng } from "@/lib/worldAtlasServer";
import { MAP_TILE_H, MAP_TILE_W } from "@/lib/worldAtlas";

async function opaqueShare(png: Buffer): Promise<{ w: number; h: number; share: number }> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
  return { w: info.width, h: info.height, share: n / (info.width * info.height) };
}

describe("map tiles", () => {
  it("renders the village tile fully", async () => {
    const t = await opaqueShare((await mapTilePng(0, 0, 0))!);
    expect([t.w, t.h]).toEqual([MAP_TILE_W, MAP_TILE_H]);
    expect(t.share).toBeGreaterThan(0.99);
  }, 30_000);
  it("is blank off the mapped world", async () => {
    const t = await opaqueShare((await mapTilePng(0, 500, 500))!);
    expect([t.w, t.h]).toEqual([MAP_TILE_W, MAP_TILE_H]);
    expect(t.share).toBe(0);
  });
});

describe("map overview", () => {
  it("zoom 1 is the overview 1:1, zoom 2 averages 2×2 blocks", async () => {
    const { OVERVIEW_STEP, tileFromOverview } = await import("@/lib/mapOverview");
    expect(OVERVIEW_STEP).toBe(2);
    // a 4×2-pixel overview from tile (0, 0): red, red, blue, blue / red, red, blue, blue
    const rgba = Buffer.alloc(4 * 2 * 4);
    for (let i = 0; i < 8; i++) rgba.set(i % 4 < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4);
    const o = { tx0: 0, ty0: 0, step: 2, width: 4, height: 2, rgba };
    const z1 = tileFromOverview(o, { tx: 0, ty: 0 }, 1, 4, 2);
    expect([...z1.subarray(8, 12)]).toEqual([0, 0, 255, 255]); // pixel (2, 0): blue
    const z2 = tileFromOverview(o, { tx: 0, ty: 0 }, 2, 2, 1);
    expect([...z2.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...z2.subarray(4, 8)]).toEqual([0, 0, 255, 255]);
  });
});

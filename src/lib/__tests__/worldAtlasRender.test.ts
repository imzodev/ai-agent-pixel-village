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
    const t = await opaqueShare(await mapTilePng(0, 0, 0));
    expect([t.w, t.h]).toEqual([MAP_TILE_W, MAP_TILE_H]);
    expect(t.share).toBeGreaterThan(0.99);
  }, 30_000);
  it("is blank off the mapped world", async () => {
    const t = await opaqueShare(await mapTilePng(0, 500, 500));
    expect([t.w, t.h]).toEqual([MAP_TILE_W, MAP_TILE_H]);
    expect(t.share).toBe(0);
  });
});

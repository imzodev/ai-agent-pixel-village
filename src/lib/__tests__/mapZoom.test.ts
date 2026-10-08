// The map panel's zoom and panning, and the map pictures drawn ahead of time.
import { describe, expect, it } from "vitest";
import { FIT_BOX, MAX_TILE_ZOOM, PAN_BOX, ZOOM_LEVELS, clampCamera, maxLevelFor, tileZoomFor } from "@/lib/mapZoom";
import { MAP_MAX_ZOOM, mapTileRect } from "@/lib/worldAtlas";
import { nearestFirst, tileTouches, tilesAt } from "@/lib/mapOverview";

describe("zoom levels", () => {
  it("each level shows one picture zoom at its real size; the server draws exactly those", () => {
    expect(ZOOM_LEVELS.map(tileZoomFor)).toEqual([0, 0, 0, 1, 2, 3]);
    for (const s of ZOOM_LEVELS) if (s < 1) expect(s * 2 ** tileZoomFor(s)).toBe(1); // 1 picture pixel = 1 screen pixel
    expect(MAX_TILE_ZOOM).toBe(MAP_MAX_ZOOM);
  });
  it("zoom-out stops where the continent fits the window", () => {
    const tw = FIT_BOX.tx1 - FIT_BOX.tx0 + 1, th = FIT_BOX.ty1 - FIT_BOX.ty0 + 1;
    for (const [w, h] of [[1700, 700], [1200, 800], [800, 500], [2560, 1300]]) {
      const i = maxLevelFor(w, h), s = ZOOM_LEVELS[i];
      expect(s * tw <= w && s * th <= h, `${w}×${h} fits`).toBe(true);
      if (i > 0) { const bigger = ZOOM_LEVELS[i - 1]; expect(bigger * tw > w || bigger * th > h, `${w}×${h}: the level before doesn't fit`).toBe(true); }
    }
  });
});

describe("panning", () => {
  it("the view never leaves the mapped world", () => {
    const c = clampCamera({ x: -1e9, y: -1e9, scale: 2 }, 1000, 600);
    expect(c.x - (1000 / 2 / 2) * 16).toBeCloseTo(PAN_BOX.tx0 * 16);
    expect(c.y - (600 / 2 / 2) * 16).toBeCloseTo(PAN_BOX.ty0 * 16);
    const far = clampCamera({ x: 1e9, y: 1e9, scale: 2 }, 1000, 600);
    expect(far.x + (1000 / 2 / 2) * 16).toBeCloseTo((PAN_BOX.tx1 + 1) * 16);
  });
  it("a world smaller than the view sits in the middle", () => {
    const c = clampCamera({ x: 0, y: 0, scale: 0.125 }, 5000, 5000);
    expect(c.x).toBeCloseTo(((PAN_BOX.tx0 + PAN_BOX.tx1 + 1) / 2) * 16);
    expect(c.y).toBeCloseTo(((PAN_BOX.ty0 + PAN_BOX.ty1 + 1) / 2) * 16);
  });
});

describe("the whole map, drawn ahead", () => {
  it("is a few hundred pictures over zooms 0–3", () => {
    const counts = [0, 1, 2, 3].map((z) => tilesAt(z).length);
    expect(counts[0]).toBeGreaterThan(300);
    expect(counts.reduce((a, b) => a + b, 0)).toBeLessThan(800);
    for (let z = 1; z <= 3; z++) expect(counts[z]).toBeLessThan(counts[z - 1]);
  });
  it("nearest the busy spots first", () => {
    const ordered = nearestFirst(tilesAt(1), [{ tx: 32, ty: 21 }]);
    const r = mapTileRect(1, ordered[0].mx, ordered[0].my);
    expect(32 >= r.tx && 32 < r.tx + r.tw && 21 >= r.ty && 21 < r.ty + r.th).toBe(true);
  });
  it("a newly opened lot touches only the tiles over it", () => {
    const lot = [{ tx: 100, ty: 200, tw: 24, th: 15 }];
    const touched = tilesAt(0).filter((t) => tileTouches(0, t.mx, t.my, lot));
    expect(touched.length).toBeGreaterThanOrEqual(1);
    expect(touched.length).toBeLessThanOrEqual(4);
    expect(tileTouches(0, 50, 50, lot)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  CHUNK_PX_H,
  CHUNK_PX_W,
  CHUNK_TILE_H,
  CHUNK_TILE_W,
  blockedFromChunk,
  chunkAtWorldPx,
  chunkId,
  isWalkableAt,
  registerChunk,
} from "@/lib/chunkCollision";

// The collision registry is module-global and LRU-bounded, so every test
// uses its own chunk coordinates to avoid cross-test interference.

const TILE_COUNT = CHUNK_TILE_W * CHUNK_TILE_H;

function chunkJson(blockedIndexes: number[] = [], layerName = "DecorationLower") {
  const data = new Array<number>(TILE_COUNT).fill(0);
  for (const i of blockedIndexes) data[i] = 1;
  return { width: CHUNK_TILE_W, height: CHUNK_TILE_H, layers: [{ name: layerName, type: "tilelayer", data }] };
}

describe("chunk geometry", () => {
  it("keeps the derived pixel size in sync with the tile grid", () => {
    expect(CHUNK_PX_W).toBe(CHUNK_TILE_W * 16);
    expect(CHUNK_PX_H).toBe(CHUNK_TILE_H * 16);
  });

  it("maps world pixels to chunk + local tile coordinates", () => {
    // cy is computed as -Math.floor(...), which yields -0 at the origin;
    // normalise it so the comparison is about the value, not the sign bit.
    const norm = (p: { cx: number; cy: number; lx: number; ly: number }) => ({
      cx: p.cx,
      cy: p.cy + 0,
      lx: p.lx,
      ly: p.ly,
    });
    expect(norm(chunkAtWorldPx(0, 0))).toEqual({ cx: 0, cy: 0, lx: 0, ly: 0 });
    // 16 px = one tile; 24 tiles = one chunk width.
    expect(norm(chunkAtWorldPx(16, 0))).toEqual({ cx: 0, cy: 0, lx: 1, ly: 0 });
    expect(norm(chunkAtWorldPx(CHUNK_PX_W, 0))).toEqual({ cx: 1, cy: 0, lx: 0, ly: 0 });
    // Screen y grows down while chunk cy grows up, so positive y is below
    // the origin → negative cy.
    expect(chunkAtWorldPx(0, 240).cy).toBe(-1);
  });

  it("builds stable chunk ids", () => {
    expect(chunkId(1, -2)).toBe("1_-2");
  });
});

describe("blockedFromChunk", () => {
  it("collects non-zero tiles from collision layers", () => {
    const set = blockedFromChunk(chunkJson([0, 5, 9]));
    expect([...set].sort((a, b) => a - b)).toEqual([0, 5, 9]);
  });

  it("accepts the dedicated Collision layer too", () => {
    const set = blockedFromChunk(chunkJson([3], "Collision"));
    expect(set.has(3)).toBe(true);
  });

  it("ignores non-collision layers", () => {
    const set = blockedFromChunk(chunkJson([1, 2], "Ground"));
    expect(set.size).toBe(0);
  });

  it("tolerates malformed input", () => {
    expect(blockedFromChunk(null).size).toBe(0);
    expect(blockedFromChunk({ layers: "nope" }).size).toBe(0);
  });
});

describe("isWalkableAt", () => {
  it("treats unregistered chunks as walkable", () => {
    // A far-away coordinate no test registers.
    expect(isWalkableAt(99_000, 99_000)).toBe(true);
  });

  it("treats a fully blocked chunk as unwalkable", () => {
    const cx = 50;
    const cy = 50;
    const all = Array.from({ length: TILE_COUNT }, (_, i) => i);
    registerChunk(cx, cy, chunkJson(all));
    // Chunk origin in world pixels.
    expect(isWalkableAt(cx * CHUNK_PX_W + 8, -cy * CHUNK_PX_H + 8)).toBe(false);
  });

  it("is walkable when the chunk has no collision layers", () => {
    registerChunk(70, 70, { layers: [] });
    expect(isWalkableAt(70 * CHUNK_PX_W + 8, -70 * CHUNK_PX_H + 8)).toBe(true);
  });
});

// Deterministic motion: positionAt, leg compression, beats, stagger and
// the env interval parser. Pure — no DB, no Phaser.

import { describe, expect, it } from "vitest";
import {
  beatIndex,
  beatStartAt,
  compressToLegs,
  isDue,
  moveDurationMs,
  moveEndAt,
  moveOfRow,
  nextBeatAt,
  pathTiles,
  positionAt,
  rowPositionAt,
  tileCenter,
  truncateMove,
} from "@/lib/motion";
import { parseMoveInterval, parseTiles, WORLD_TICK_MS } from "@/lib/constants";
import type { Move } from "@/types/motion";

// 16 px tiles; 16 px/s = one tile per second keeps the arithmetic obvious.
const east3: Move = { path: [{ tx: 0, ty: 0 }, { tx: 3, ty: 0 }], startAt: 10_000, speed: 16 };
const lShape: Move = { path: [{ tx: 0, ty: 0 }, { tx: 2, ty: 0 }, { tx: 2, ty: -2 }], startAt: 0, speed: 16 };

describe("positionAt", () => {
  it("stands on the origin tile centre before the start, facing the first leg", () => {
    expect(positionAt(east3, 0)).toEqual({ x: 8, y: 8, facing: "right", moving: false });
  });

  it("interpolates linearly mid-leg", () => {
    expect(positionAt(east3, 11_500)).toEqual({ x: 8 + 24, y: 8, facing: "right", moving: true });
  });

  it("rests exactly on the destination tile centre after the end", () => {
    expect(positionAt(east3, 13_000)).toEqual({ x: 56, y: 8, facing: "right", moving: false });
    expect(positionAt(east3, 99_999)).toEqual({ x: 56, y: 8, facing: "right", moving: false });
  });

  it("turns the corner of a multi-leg path", () => {
    expect(positionAt(lShape, 2_000)).toMatchObject({ x: 40, y: 8, facing: "up" });
    expect(positionAt(lShape, 3_000)).toEqual({ x: 40, y: -8, facing: "up", moving: true });
    expect(positionAt(lShape, 4_000)).toEqual({ x: 40, y: -24, facing: "up", moving: false });
  });

  it("is identical for every caller at the same instant (no hidden state)", () => {
    const a = positionAt(east3, 11_234);
    const b = positionAt({ ...east3, path: [...east3.path] }, 11_234);
    expect(a).toEqual(b);
  });
});

describe("move timing helpers", () => {
  it("counts whole tiles and derives duration / end", () => {
    expect(pathTiles(lShape.path)).toBe(4);
    expect(moveDurationMs(east3)).toBe(3000);
    expect(moveEndAt(east3)).toBe(13_000);
  });

  it("moveOfRow carries the post-move state", () => {
    const row = { x: 56, y: 8, movePath: east3.path, moveStartAt: east3.startAt, moveSpeed: 16 };
    expect(moveOfRow({ ...row, moveAfter: "graze" })?.after).toBe("graze");
    expect(moveOfRow({ ...row, moveAfter: null })).not.toHaveProperty("after");
  });

  it("rowPositionAt falls back to x/y when the row has no move", () => {
    expect(rowPositionAt({ x: 5, y: 6, movePath: null, moveStartAt: null, moveSpeed: null }, 0)).toEqual({ x: 5, y: 6 });
    expect(rowPositionAt({ x: 56, y: 8, movePath: east3.path, moveStartAt: east3.startAt, moveSpeed: 16 }, 11_000))
      .toEqual({ x: 24, y: 8 });
  });
});

describe("compressToLegs", () => {
  it("keeps only corners of a 4-connected tile walk", () => {
    const walk = [
      { tx: 0, ty: 0 }, { tx: 1, ty: 0 }, { tx: 2, ty: 0 },
      { tx: 2, ty: 1 }, { tx: 2, ty: 2 }, { tx: 3, ty: 2 },
    ];
    expect(compressToLegs(walk)).toEqual([{ tx: 0, ty: 0 }, { tx: 2, ty: 0 }, { tx: 2, ty: 2 }, { tx: 3, ty: 2 }]);
  });

  it("drops consecutive duplicates", () => {
    expect(compressToLegs([{ tx: 1, ty: 1 }, { tx: 1, ty: 1 }, { tx: 1, ty: 3 }])).toEqual([{ tx: 1, ty: 1 }, { tx: 1, ty: 3 }]);
  });
});

describe("beats", () => {
  it("are epoch-aligned", () => {
    const t = 7 * WORLD_TICK_MS + 1234;
    expect(beatIndex(t)).toBe(7);
    expect(beatStartAt(t)).toBe(7 * WORLD_TICK_MS);
    expect(nextBeatAt(t)).toBe(8 * WORLD_TICK_MS);
    // Exactly on a boundary, the NEXT beat is the following one.
    expect(nextBeatAt(8 * WORLD_TICK_MS)).toBe(9 * WORLD_TICK_MS);
  });
});

describe("isDue (stagger)", () => {
  it("makes every entity due exactly once per interval", () => {
    const interval = 4 * WORLD_TICK_MS;
    for (let id = 1; id <= 200; id++) {
      let due = 0;
      for (let beat = 1000; beat < 1004; beat++) if (isDue("npc", id, beat, interval)) due++;
      expect(due).toBe(1);
    }
  });

  it("spreads entities across the beats of an interval", () => {
    const interval = 4 * WORLD_TICK_MS;
    const perBeat = [0, 0, 0, 0];
    for (let id = 1; id <= 400; id++) {
      for (let b = 0; b < 4; b++) if (isDue("npc", id, b, interval)) perBeat[b]++;
    }
    for (const n of perBeat) expect(n).toBeGreaterThan(50);
  });

  it("an interval of one beat means due every beat", () => {
    expect(isDue("animal", 9, 123, WORLD_TICK_MS)).toBe(true);
    expect(isDue("animal", 9, 124, WORLD_TICK_MS)).toBe(true);
  });
});

describe("parseMoveInterval", () => {
  it("uses the default when unset", () => {
    expect(parseMoveInterval(undefined, 10_000)).toEqual({ ms: 10_000, warning: null });
    expect(parseMoveInterval("  ", 10_000)).toEqual({ ms: 10_000, warning: null });
  });

  it("falls back with a warning on invalid values", () => {
    for (const bad of ["abc", "0", "-5000", "NaN"]) {
      const r = parseMoveInterval(bad, 10_000);
      expect(r.ms).toBe(10_000);
      expect(r.warning).toMatch(/invalid/);
    }
  });

  it("accepts whole beats silently and rounds others up to the next beat", () => {
    expect(parseMoveInterval("30000", 10_000)).toEqual({ ms: 30_000, warning: null });
    const r = parseMoveInterval("12000", 10_000);
    expect(r.ms).toBe(15_000);
    expect(r.warning).toMatch(/rounded up/);
    expect(parseMoveInterval("1", 10_000).ms).toBe(WORLD_TICK_MS);
  });
});

describe("tileCenter", () => {
  it("is the middle of the 16 px tile, including negative tiles", () => {
    expect(tileCenter({ tx: 0, ty: 0 })).toEqual({ x: 8, y: 8 });
    expect(tileCenter({ tx: -1, ty: -2 })).toEqual({ x: -8, y: -24 });
  });
});

describe("parseTiles", () => {
  it("accepts positive integers and falls back otherwise", () => {
    expect(parseTiles("7", 10)).toBe(7);
    expect(parseTiles(undefined, 10)).toBe(10);
    for (const bad of ["", "0", "-2", "3.5", "abc"]) expect(parseTiles(bad, 10)).toBe(10);
  });
});

describe("truncateMove", () => {
  it("before the start: zero-length, the entity never leaves its tile", () => {
    const cut = truncateMove(east3, 9_000);
    expect(cut.path).toEqual([{ tx: 0, ty: 0 }, { tx: 0, ty: 0 }]);
    expect(cut.startAt).toBe(east3.startAt);
    expect(positionAt(cut, 12_000)).toMatchObject({ x: 8, y: 8, moving: false });
  });

  it("mid-leg: finishes the current tile and stops there", () => {
    const cut = truncateMove(east3, 11_250); // 1.25 tiles walked
    expect(cut.path).toEqual([{ tx: 0, ty: 0 }, { tx: 2, ty: 0 }]);
    // Identical to the original up to the stop tile, never past it.
    expect(positionAt(cut, 11_250)).toEqual(positionAt(east3, 11_250));
    expect(positionAt(cut, 99_999)).toMatchObject({ x: 40, y: 8, moving: false });
  });

  it("exactly on a tile centre: stops on that tile", () => {
    expect(truncateMove(east3, 12_000).path).toEqual([{ tx: 0, ty: 0 }, { tx: 2, ty: 0 }]);
  });

  it("after the end: unchanged", () => {
    expect(truncateMove(east3, 20_000)).toBe(east3);
  });

  it("cuts a multi-leg path on the right leg", () => {
    const cut = truncateMove(lShape, 2_500); // 2.5 tiles: past the corner
    expect(cut.path).toEqual([{ tx: 0, ty: 0 }, { tx: 2, ty: 0 }, { tx: 2, ty: -1 }]);
    expect(positionAt(cut, 99_999)).toMatchObject({ x: 40, y: -8, facing: "up", moving: false });
  });
});

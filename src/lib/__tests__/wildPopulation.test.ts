// The land ahead of moving players gets its packs: which chunks, what
// stands in them, and how a crowd changes it.
import { describe, expect, it } from "vitest";
import { MIN_PLAYER_GAP_PX, chunksAhead, packFor } from "@/lib/wildPopulation";
import { POPULATE_AHEAD_CHUNKS as R, chunkPackChance, crowdFactor, wildTarget } from "@/lib/wildlife";
import { CHUNK_TILE_H, CHUNK_TILE_W } from "@/lib/chunkCollision";
import { biomeAt, inHeartland } from "@/lib/continent";

const open = async () => true;
const key = (c: { cx: number; cy: number }) => `${c.cx},${c.cy}`;
/** Wild, non-ocean chunks to sample. */
const wild: { cx: number; cy: number }[] = [];
for (let cx = -100; cx <= 30 && wild.length < 300; cx += 3) for (let cy = -60; cy <= 60 && wild.length < 300; cy += 4) {
  const tx = cx * CHUNK_TILE_W + 12, ty = -cy * CHUNK_TILE_H + 7;
  if (!inHeartland(tx, ty) && biomeAt(tx, ty) !== "ocean") wild.push({ cx, cy });
}

describe("which chunks are filled", () => {
  it("moving east: only the leading edge, R chunks ahead", () => {
    const out = chunksAhead({ cx: 0, cy: 0 }, { cx: 1, cy: 0 });
    expect(out).toHaveLength(2 * R + 1);
    expect(out.every((c) => c.cx === 1 + R && Math.abs(c.cy) <= R)).toBe(true);
  });
  it("moving diagonally: exactly the ring chunks that just came within reach", () => {
    const from = { cx: 0, cy: 0 }, to = { cx: -1, cy: 1 };
    const d = (a: { cx: number; cy: number }, b: { cx: number; cy: number }) => Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cy - b.cy));
    const out = chunksAhead(from, to);
    const expected = [];
    for (let cx = to.cx - R; cx <= to.cx + R; cx++) for (let cy = to.cy - R; cy <= to.cy + R; cy++) {
      const c = { cx, cy };
      if (d(c, to) === R && d(c, from) > R) expected.push(key(c));
    }
    expect(out.map(key).sort()).toEqual(expected.sort());
  });
  it("arriving (no direction) or jumping: the whole ring", () => {
    const ring = chunksAhead(null, { cx: 5, cy: 5 });
    expect(ring).toHaveLength(8 * R);
    expect(ring.every((c) => Math.max(Math.abs(c.cx - 5), Math.abs(c.cy - 5)) === R)).toBe(true);
    expect(chunksAhead({ cx: 0, cy: 0 }, { cx: 40, cy: 0 })).toHaveLength(8 * R);
  });
});

describe("what a chunk holds", () => {
  it("is the same pack for everyone in the same refill window", async () => {
    for (const c of wild.slice(0, 40)) expect(await packFor(c, 1_000_000, false, 1, [], open)).toEqual(await packFor(c, 1_000_000 + 1000, false, 1, [], open));
  });
  it("never fills the heartland", async () => {
    expect(await packFor({ cx: 1, cy: -1 }, 0, false, 1, [], open)).toEqual([]);
  });
  it("keeps every enemy away from players, and off blocked tiles", async () => {
    for (const c of wild.slice(0, 80)) {
      const at = { x: c.cx * CHUNK_TILE_W * 16 + 200, y: -c.cy * CHUNK_TILE_H * 16 + 120 };
      for (const m of await packFor(c, 0, false, 1, [at], open)) expect(Math.hypot(m.x - at.x, m.y - at.y)).toBeGreaterThanOrEqual(MIN_PLAYER_GAP_PX);
      expect(await packFor(c, 0, false, 1, [], async () => false)).toEqual([]);
    }
  });
  it("a solo player meets today's density", () => {
    const avgPack = (t: number) => (t >= 4 ? 3.5 : t >= 3 ? 3 : 2);
    for (const t of [1, 2, 3, 4]) {
      const perChunk = chunkPackChance(t) * avgPack(t), today = wildTarget(t) / 11.3; // ~11 chunks around a player
      expect(Math.abs(perChunk - today) / today, `tier ${t}`).toBeLessThan(0.12);
    }
  });
  it("a crowd meets more: +50% per extra player, at most ×3", async () => {
    expect([1, 2, 3, 5, 9].map(crowdFactor)).toEqual([1, 1.5, 2, 3, 3]);
    let solo = 0, group = 0;
    for (const c of wild) { solo += (await packFor(c, 0, false, 1, [], open)).length; group += (await packFor(c, 0, false, 3, [], open)).length; }
    expect(group / solo).toBeGreaterThan(1.6);
  });
});

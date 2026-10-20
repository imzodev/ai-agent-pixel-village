import { describe, expect, it } from "vitest";
import { IMPRESSION_BATCH, IMPRESSION_DWELL_MS, IMPRESSION_RANGE_PX, IMPRESSION_REPEAT_MS, ImpressionTracker } from "./billboardImpressions";

const me = { x: 0, y: 0 };
const board = (rentalId: number, x = 50) => ({ rentalId, x, y: 0 });

describe("billboard impressions", () => {
  it("count once you've stood by a poster for a moment", () => {
    const t = new ImpressionTracker();
    t.observe([board(1)], me, 0);
    t.observe([board(1)], me, IMPRESSION_DWELL_MS - 1);
    expect(t.drain()).toEqual([]);
    t.observe([board(1)], me, IMPRESSION_DWELL_MS);
    expect(t.drain()).toEqual([1]);
  });

  it("don't count posters out of range, or one you only walked past", () => {
    const t = new ImpressionTracker();
    t.observe([board(1, IMPRESSION_RANGE_PX + 1)], me, 0);
    t.observe([board(1, IMPRESSION_RANGE_PX + 1)], me, 10_000);
    t.observe([board(2)], me, 0);
    t.observe([], me, 1000); // walked on
    t.observe([board(2)], me, 2500); // back: the wait starts again
    expect(t.drain()).toEqual([]);
  });

  it("count the same poster again only after a while", () => {
    const t = new ImpressionTracker();
    for (let ms = 0; ms <= IMPRESSION_REPEAT_MS; ms += 1000) t.observe([board(1)], me, ms);
    expect(t.drain()).toEqual([1]);
    t.observe([board(1)], me, IMPRESSION_REPEAT_MS + IMPRESSION_DWELL_MS);
    expect(t.drain()).toEqual([1]);
  });

  it("send at most a batch at a time", () => {
    const t = new ImpressionTracker();
    const many = Array.from({ length: IMPRESSION_BATCH + 5 }, (_, i) => board(i + 1));
    t.observe(many, me, 0);
    t.observe(many, me, IMPRESSION_DWELL_MS);
    expect(t.drain()).toHaveLength(IMPRESSION_BATCH);
    expect(t.drain()).toHaveLength(5);
  });
});

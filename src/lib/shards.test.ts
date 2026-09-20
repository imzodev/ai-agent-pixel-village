import { describe, expect, it } from "vitest";
import { chunkInRegions, parseShardRegions, pickShardId } from "@/lib/shards";

describe("parseShardRegions", () => {
  it("parses a single region", () => {
    expect(parseShardRegions("0-9,-9-0")).toEqual([{ xMin: 0, xMax: 9, yMin: -9, yMax: 0 }]);
  });

  it("parses multiple regions", () => {
    expect(parseShardRegions("0-9,-9-0;10-19,0-9")).toEqual([
      { xMin: 0, xMax: 9, yMin: -9, yMax: 0 },
      { xMin: 10, xMax: 19, yMin: 0, yMax: 9 },
    ]);
  });

  it("normalises reversed ranges", () => {
    expect(parseShardRegions("9-0,0--9")).toEqual([{ xMin: 0, xMax: 9, yMin: -9, yMax: 0 }]);
  });

  it("falls back to one unbounded region on empty or malformed input", () => {
    for (const input of [undefined, "", "   ", "garbage", "1-2"]) {
      const regions = parseShardRegions(input);
      expect(regions).toHaveLength(1);
      expect(regions[0]!.xMin).toBe(Number.MIN_SAFE_INTEGER);
      expect(regions[0]!.xMax).toBe(Number.MAX_SAFE_INTEGER);
    }
  });
});

describe("chunkInRegions", () => {
  const regions = parseShardRegions("0-9,-9-0;10-19,0-9");

  it("accepts chunks inside a region", () => {
    expect(chunkInRegions(5, -5, regions)).toBe(true);
    expect(chunkInRegions(15, 5, regions)).toBe(true);
  });

  it("rejects chunks outside every region", () => {
    expect(chunkInRegions(5, 5, regions)).toBe(false);
    expect(chunkInRegions(30, 0, regions)).toBe(false);
  });
});

describe("pickShardId", () => {
  const regions = parseShardRegions("0-9,-9-0;10-19,0-9");

  it("returns the index of the matching region", () => {
    expect(pickShardId(3, -3, regions)).toBe("0");
    expect(pickShardId(12, 3, regions)).toBe("1");
  });

  it("defaults to shard 0 when nothing matches", () => {
    expect(pickShardId(999, 999, regions)).toBe("0");
  });

  it("returns 0 for a single unbounded region", () => {
    expect(pickShardId(123, -456, parseShardRegions(undefined))).toBe("0");
  });
});

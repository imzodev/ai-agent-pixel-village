// Lot banners: the palette and emblems, what an unpainted lot flies, and which
// picks are accepted.
import { describe, expect, it } from "vitest";
import { LOT_COLORS, LOT_EMBLEMS, defaultBanner, isBanner, resolveBanner } from "@/lib/lotBanner";

describe("lot banners", () => {
  it("has a colour and an emblem list worth choosing from", () => {
    expect(LOT_COLORS.length).toBeGreaterThanOrEqual(12);
    expect(LOT_EMBLEMS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(LOT_COLORS.map((c) => c.hex)).size).toBe(LOT_COLORS.length);
    expect(new Set(LOT_EMBLEMS.map((e) => e.key)).size).toBe(LOT_EMBLEMS.length);
  });

  it("gives every owner a stable default, and neighbours differ", () => {
    for (const id of [1, 2, 3, 99, 5000]) expect(defaultBanner(id)).toEqual(defaultBanner(id));
    const seen = new Set<string>();
    for (let id = 1; id <= LOT_COLORS.length * LOT_EMBLEMS.length; id++) {
      const b = defaultBanner(id);
      expect(isBanner(b.color, b.emblem)).toBe(true);
      seen.add(`${b.color}:${b.emblem}`);
    }
    expect(seen.size).toBe(LOT_COLORS.length * LOT_EMBLEMS.length);
  });

  it("accepts only whole indices inside the palette", () => {
    expect(isBanner(0, 0)).toBe(true);
    expect(isBanner(LOT_COLORS.length - 1, LOT_EMBLEMS.length - 1)).toBe(true);
    expect(isBanner(LOT_COLORS.length, 0)).toBe(false);
    expect(isBanner(0, LOT_EMBLEMS.length)).toBe(false);
    expect(isBanner(-1, 0)).toBe(false);
    expect(isBanner(1.5, 0)).toBe(false);
    expect(isBanner(Number.NaN, 0)).toBe(false);
    expect(isBanner("1", 0)).toBe(false);
  });

  it("flies the owner's pick, or the default when nothing valid is stored", () => {
    expect(resolveBanner(7, 3, 4)).toEqual({ color: 3, emblem: 4 });
    expect(resolveBanner(7, null, null)).toEqual(defaultBanner(7));
    expect(resolveBanner(7, 3, null)).toEqual(defaultBanner(7));
    expect(resolveBanner(7, 99, 0)).toEqual(defaultBanner(7));
  });
});

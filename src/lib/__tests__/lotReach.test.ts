// Tending a garden: the proximity rule and the own-lot exception.
import { describe, expect, it } from "vitest";
import { TEND_RANGE_PX, TEND_RANGE_SERVER_PX, canTend, insideLot } from "@/lib/lotReach";

// A parcel 10×6 tiles with its corner at tile (100, 50): world px x 1600..1760, y 800..896.
const lot = { tx: 100, ty: 50, tw: 10, th: 6 };

describe("insideLot", () => {
  it("is true across the parcel, including its corners", () => {
    expect(insideLot(lot, 1680, 850)).toBe(true);
    expect(insideLot(lot, 1600, 800)).toBe(true);
    expect(insideLot(lot, 1759, 895)).toBe(true);
  });

  it("allows one tile of margin for the fence, no more", () => {
    expect(insideLot(lot, 1585, 850)).toBe(true);
    expect(insideLot(lot, 1583, 850)).toBe(false);
    expect(insideLot(lot, 1775, 850)).toBe(true);
    expect(insideLot(lot, 1777, 850)).toBe(false);
    expect(insideLot(lot, 1680, 783)).toBe(false);
    expect(insideLot(lot, 1680, 913)).toBe(false);
  });

  it("is false far away and with negative world coordinates handled", () => {
    expect(insideLot(lot, 0, 0)).toBe(false);
    expect(insideLot({ tx: -20, ty: -10, tw: 8, th: 4 }, -250, -140)).toBe(true);
    expect(insideLot({ tx: -20, ty: -10, tw: 8, th: 4 }, 100, 100)).toBe(false);
  });
});

describe("canTend", () => {
  it("lets you tend what is near, wherever you stand", () => {
    expect(canTend(60, TEND_RANGE_PX, false)).toBe(true);
    expect(canTend(TEND_RANGE_PX, TEND_RANGE_PX, false)).toBe(true);
  });

  it("needs you in your own lot for anything farther", () => {
    expect(canTend(400, TEND_RANGE_PX, false)).toBe(false);
    expect(canTend(400, TEND_RANGE_PX, true)).toBe(true);
  });

  it("keeps the server a little more forgiving than the client", () => {
    expect(TEND_RANGE_SERVER_PX).toBeGreaterThan(TEND_RANGE_PX);
  });
});

describe("atLot (the farm window's reach)", () => {
  const b = { tx: 10, ty: 20, tw: 12, th: 8 }; // px: x 160–352, y 320–448
  it("counts inside the lot and around it, e.g. at its gate on the path", async () => {
    const { atLot, FARM_REACH_PX } = await import("@/lib/lotReach");
    expect(atLot(b, 250, 400)).toBe(true); // in the field
    expect(atLot(b, 250, 320 - 30)).toBe(true); // on the path by the gate
    expect(atLot(b, 250, 320 - FARM_REACH_PX - 1)).toBe(false); // further up the road
    expect(atLot(b, 352 + FARM_REACH_PX + 5, 400)).toBe(false); // next lot over
  });
});

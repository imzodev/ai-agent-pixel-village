// Cheering a lot: the day a cheer counts for and how the total reads on a sign.
import { describe, expect, it } from "vitest";
import { cheerDay, cheersText } from "@/lib/cheers";

describe("cheers", () => {
  it("counts a cheer for its UTC day", () => {
    expect(cheerDay(Date.UTC(2026, 9, 8, 0, 0, 0))).toBe("2026-10-08");
    expect(cheerDay(Date.UTC(2026, 9, 8, 23, 59, 59))).toBe("2026-10-08");
    expect(cheerDay(Date.UTC(2026, 9, 9, 0, 0, 0))).toBe("2026-10-09");
  });

  it("shows nothing for no cheers, then the count", () => {
    expect(cheersText(0)).toBe("");
    expect(cheersText(-3)).toBe("");
    expect(cheersText(Number.NaN)).toBe("");
    expect(cheersText(1)).toBe("👏 1");
    expect(cheersText(999)).toBe("👏 999");
  });

  it("shortens thousands", () => {
    expect(cheersText(1000)).toBe("👏 1k");
    expect(cheersText(1234)).toBe("👏 1.2k");
    expect(cheersText(15999)).toBe("👏 15.9k");
  });
});

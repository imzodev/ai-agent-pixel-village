// The visitors' ticker: villager trades in plain words, and how long ago.
import { describe, expect, it } from "vitest";
import { tradeEventText } from "@/lib/mind/profile";
import { agoText } from "@/lib/timeAgo";

describe("ticker text", () => {
  it("says who sold or bought what, where", () => {
    expect(tradeEventText("🌾", "Rowan", true, 12, "wheat", "Hollis's mill")).toBe("🌾 Rowan sold 12 wheat to Hollis's mill.");
    expect(tradeEventText(undefined, "Marigold", false, 8, "flour", "Hollis's mill")).toBe("Marigold bought 8 flour at Hollis's mill.");
  });
  it("says how long ago", () => {
    const now = 10_000_000;
    expect(agoText(now - 20_000, now)).toBe("just now");
    expect(agoText(now - 14 * 60_000, now)).toBe("14 min ago");
    expect(agoText(now - 125 * 60_000, now)).toBe("2 h ago");
    expect(agoText(now - 50 * 3_600_000, now)).toBe("2 d ago");
  });
});

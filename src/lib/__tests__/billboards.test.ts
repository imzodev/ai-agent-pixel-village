// Billboards: the spots stand on clear ground in the right places, a hold on a
// spot runs out when nobody pays, and advertisers' links are safe to send
// players to.
import { describe, expect, it } from "vitest";
import { BILLBOARD_SPOTS, BILLBOARD_TIERS, BOARD_H, BOARD_W, billboardBlocks, cleanAdLink, holdsSpot, spotBlocks, spotHeld, spotPoint, PENDING_HOLD_MS } from "@/lib/billboards";
import { TOWNS, roadTile, townDecorAt, townPathV } from "@/lib/settlements";
import { onSiteGrid } from "@/lib/homesteadSites";

describe("billboard spots", () => {
  it("have unique keys, a priced tier each, and one by every town", () => {
    expect(new Set(BILLBOARD_SPOTS.map((s) => s.key)).size).toBe(BILLBOARD_SPOTS.length);
    for (const s of BILLBOARD_SPOTS) expect(BILLBOARD_TIERS[s.tier].priceCents, s.key).toBeGreaterThan(0);
    for (const t of TOWNS) expect(BILLBOARD_SPOTS.some((s) => s.key === `town_${t.key}`), t.key).toBe(true);
    expect(BILLBOARD_SPOTS.filter((s) => s.tier === "plaza").length).toBeGreaterThanOrEqual(2);
  });

  it("stand off roads, town paths, decor and homestead sites", () => {
    for (const s of BILLBOARD_SPOTS) {
      for (let y = s.ty; y < s.ty + BOARD_H; y++) for (let x = s.tx; x < s.tx + BOARD_W; x++) {
        expect(roadTile(x, y) || townPathV(x, y) || !!townDecorAt(x, y) || onSiteGrid(x, y), `${s.key} at ${x},${y}`).toBe(false);
      }
    }
  });

  it("never overlap, block only their base row, and are read from in front", () => {
    for (const a of BILLBOARD_SPOTS) for (const b of BILLBOARD_SPOTS) {
      if (a === b) continue;
      const apart = a.tx + BOARD_W <= b.tx || b.tx + BOARD_W <= a.tx || a.ty + BOARD_H <= b.ty || b.ty + BOARD_H <= a.ty;
      expect(apart, `${a.key} / ${b.key}`).toBe(true);
    }
    const s = BILLBOARD_SPOTS[0];
    expect(spotBlocks(s)).toHaveLength(BOARD_W);
    expect(spotBlocks(s).every((t) => t.ty === s.ty + BOARD_H - 1)).toBe(true);
    expect(billboardBlocks()).toHaveLength(BILLBOARD_SPOTS.length * BOARD_W);
    expect(spotPoint(s).y).toBeGreaterThan((s.ty + BOARD_H) * 16);
  });
});

describe("holding a spot", () => {
  const at = (ago: number) => new Date(1_000_000_000 - ago);
  const now = 1_000_000_000;
  it("paid rentals hold it; an unpaid checkout only for a while", () => {
    expect(holdsSpot({ spotKey: "a", status: "active", createdAt: at(10 * PENDING_HOLD_MS) }, now)).toBe(true);
    expect(holdsSpot({ spotKey: "a", status: "review", createdAt: at(10 * PENDING_HOLD_MS) }, now)).toBe(true);
    expect(holdsSpot({ spotKey: "a", status: "pending", createdAt: at(PENDING_HOLD_MS - 1) }, now)).toBe(true);
    expect(holdsSpot({ spotKey: "a", status: "pending", createdAt: at(PENDING_HOLD_MS) }, now)).toBe(false);
    expect(holdsSpot({ spotKey: "a", status: "rejected", createdAt: at(0) }, now)).toBe(false);
    expect(holdsSpot({ spotKey: "a", status: "cancelled", createdAt: at(0) }, now)).toBe(false);
  });
  it("by spot", () => {
    const rentals = [{ spotKey: "a", status: "active" as const, createdAt: at(0) }];
    expect(spotHeld(rentals, "a", now)).toBe(true);
    expect(spotHeld(rentals, "b", now)).toBe(false);
  });
});

describe("cleanAdLink", () => {
  it("accepts a public web address and tags it", () => {
    const r = cleanAdLink("https://starfall.example/play");
    expect(r.ok && r.url).toBe("https://starfall.example/play?utm_source=thegroove&utm_medium=billboard");
    const bare = cleanAdLink("shop.example");
    expect(bare.ok && bare.url).toBe("https://shop.example/?utm_source=thegroove&utm_medium=billboard");
  });
  it("keeps the advertiser's own UTM tags", () => {
    const r = cleanAdLink("https://a.example/?utm_source=x");
    expect(r.ok && r.url).toBe("https://a.example/?utm_source=x");
  });
  it.each([
    "javascript:alert(1)", "data:text/html,hi", "ftp://a.example", "https://user:pw@a.example",
    "https://localhost/x", "http://127.0.0.1/", "https://[::1]/", "https://intranet/", "https://a.internal/",
    "", `https://a.example/${"x".repeat(200)}`,
  ])("refuses %s", (raw) => {
    expect(cleanAdLink(raw).ok).toBe(false);
  });
});

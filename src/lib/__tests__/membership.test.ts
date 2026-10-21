// Membership and invites: prices, the monthly outfit rotation, when a
// membership counts, and who an invite link points at.
import { describe, expect, it } from "vitest";
import { MEMBERSHIP_PLANS, MEMBER_COSMETICS, MEMBER_GRACE_MS, memberCosmeticFor, memberNow, memberTitle, monthKey } from "@/lib/membership";
import { COSMETIC_CATALOG } from "@/lib/cosmetics";
import { REFERRAL_LEVEL, inviteLink, parseRef, reachedReferralLevel } from "@/lib/referral";

describe("membership", () => {
  it("costs $4.99 a month or $39.99 a year (cheaper per month)", () => {
    expect(MEMBERSHIP_PLANS.monthly.priceCents).toBe(499);
    expect(MEMBERSHIP_PLANS.yearly.priceCents).toBe(3999);
    expect(MEMBERSHIP_PLANS.yearly.priceCents / 12).toBeLessThan(MEMBERSHIP_PLANS.monthly.priceCents);
  });

  it("hands out a members-only outfit each month, in turn, never sold", () => {
    expect(monthKey(Date.UTC(2026, 9, 21))).toBe("2026-10");
    const months = ["2026-10", "2026-11", "2026-12", "2027-01"].map(memberCosmeticFor);
    expect(new Set(months.slice(0, 3)).size).toBe(3);
    expect(months[3]).toBe(months[0]);
    for (const key of MEMBER_COSMETICS) {
      const item = COSMETIC_CATALOG.find((c) => c.key === key);
      expect(item, key).toBeDefined();
      expect([item!.coinPrice, item!.gemPrice]).toEqual([0, 0]);
    }
  });

  it("counts while active and paid up, with a few days' grace", () => {
    const now = Date.UTC(2026, 9, 21);
    expect(memberNow({ status: "active", currentPeriodEnd: new Date(now + 1000) }, now)).toBe(true);
    expect(memberNow({ status: "active", currentPeriodEnd: new Date(now - MEMBER_GRACE_MS + 1000) }, now)).toBe(true);
    expect(memberNow({ status: "active", currentPeriodEnd: new Date(now - MEMBER_GRACE_MS - 1) }, now)).toBe(false);
    expect(memberNow({ status: "cancelled", currentPeriodEnd: new Date(now + 1000) }, now)).toBe(false);
    expect(memberNow({ status: "pending", currentPeriodEnd: null }, now)).toBe(false);
    expect(memberNow(null, now)).toBe(false);
  });

  it("puts a star on members' nameplates", () => {
    expect(memberTitle(null, true)).toBe("⭐ Member");
    expect(memberTitle("Angler", true)).toBe("⭐ Angler");
    expect(memberTitle("Angler", false)).toBe("Angler");
    expect(memberTitle(null, false)).toBeNull();
  });
});

describe("invites", () => {
  it("know a profile or moment ref, and nothing else", () => {
    expect(parseRef("u:marigold_fan")).toEqual({ username: "marigold_fan" });
    expect(parseRef("m:Ab3x9")).toEqual({ momentId: "Ab3x9" });
    for (const bad of [undefined, "", "x:abc", "u:", "u:a b", "u:'; drop"]) expect(parseRef(bad), String(bad)).toBeNull();
  });
  it("pay once the friend reaches the level", () => {
    expect(reachedReferralLevel(REFERRAL_LEVEL - 1, REFERRAL_LEVEL)).toBe(true);
    expect(reachedReferralLevel(1, REFERRAL_LEVEL + 2)).toBe(true);
    expect(reachedReferralLevel(REFERRAL_LEVEL, REFERRAL_LEVEL + 1)).toBe(false);
    expect(reachedReferralLevel(1, REFERRAL_LEVEL - 1)).toBe(false);
  });
  it("link to your profile", () => {
    expect(inviteLink("https://thegroove.fun", "pip")).toBe("https://thegroove.fun/u/pip");
  });
});

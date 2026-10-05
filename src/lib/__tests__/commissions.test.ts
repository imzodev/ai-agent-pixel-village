// Furniture commissions: who orders what, what it pays, and how often.
import { describe, expect, it } from "vitest";
import { COMMISSIONERS, COMMISSION_CHANCE, COMMISSION_PAY_MULT, commissionFor, commissionKey, commissionPay, isCommissionKey, postedAt } from "@/lib/commissions";
import { FURNITURE_ITEMS, FURNITURE_VALUE } from "@/lib/furniture";
import { npcDef } from "@/lib/npcDefs";

describe("commissions", () => {
  it("commissioners are real NPCs who order real furniture", () => {
    for (const c of COMMISSIONERS) {
      expect(npcDef(c.npcKey), c.npcKey).toBeDefined();
      for (const w of c.wishes) expect(FURNITURE_ITEMS.includes(w.item), w.item).toBe(true);
    }
    expect(COMMISSIONERS.length).toBeGreaterThan(6); // the town innkeepers too
  });
  it("pays more than selling the pieces", () => {
    const w = { item: "chair", qty: 4 };
    expect(commissionPay(w)).toBe(Math.round(FURNITURE_VALUE.chair * 4 * COMMISSION_PAY_MULT));
    expect(commissionPay(w)).toBeGreaterThan(FURNITURE_VALUE.chair * 4);
  });
  it("keys carry who and when", () => {
    const k = commissionKey("hollowmere_ivy", 1234);
    expect(isCommissionKey(k)).toBe(true);
    expect(postedAt(k)).toBe(1234);
    expect(isCommissionKey("req_village_marigold_1")).toBe(false);
  });
  it("NPCs post now and then, about as often as the chance says, from their wishlist", () => {
    const c = COMMISSIONERS[0];
    let posted = 0;
    for (let slot = 0; slot < 2000; slot++) {
      const w = commissionFor(c, slot);
      if (w) { posted++; expect(c.wishes).toContainEqual(w); }
    }
    expect(posted / 2000).toBeGreaterThan(COMMISSION_CHANCE - 0.07);
    expect(posted / 2000).toBeLessThan(COMMISSION_CHANCE + 0.07);
  });
});

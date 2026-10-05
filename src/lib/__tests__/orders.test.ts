// Standing orders: what can be delivered, the week's reset and the bonus.
import { describe, expect, it } from "vitest";
import { ORDER_BONUS, WEEK_MS, deliverable, deliveryPay, weekRolled } from "@/lib/orders";
import { PROFILES } from "@/lib/mind/profiles";

describe("standing orders", () => {
  it("deliver what's left this week, at most what you carry", () => {
    expect(deliverable(12, 0, 5)).toBe(5);
    expect(deliverable(12, 10, 5)).toBe(2);
    expect(deliverable(12, 12, 5)).toBe(0);
  });
  it("the week starts over after 7 days", () => {
    expect(weekRolled(0, WEEK_MS - 1)).toBe(false);
    expect(weekRolled(0, WEEK_MS)).toBe(true);
  });
  it("filling the week pays a bonus, once", () => {
    expect(deliveryPay({ qtyPerWeek: 12, delivered: 0 }, 5, 2)).toEqual({ coins: 10, bonus: 0, filled: false });
    expect(deliveryPay({ qtyPerWeek: 12, delivered: 10 }, 2, 2)).toEqual({ coins: 4, bonus: Math.round(12 * 2 * ORDER_BONUS), filled: true });
    expect(deliveryPay({ qtyPerWeek: 12, delivered: 12 }, 0, 2).bonus).toBe(0);
  });
  it("Marigold orders what her oven uses", () => {
    const b = PROFILES.baker;
    for (const item of ["egg", "flour", "honey"]) expect(b.orders[item], item).toBeDefined();
    expect(b.crafts.bake_buns.uses.honey).toBeGreaterThan(0);
  });
});

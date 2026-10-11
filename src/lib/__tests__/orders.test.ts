// Standing orders: what can be delivered, the week's reset and the bonus.
import { describe, expect, it } from "vitest";
import { ORDER_BONUS, WEEK_MS, deliverable, deliveryPay, weekRolled, orderRow, MAX_ORDERS_PER_ITEM } from "@/lib/orders";
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

describe("the Orders menu rows", () => {
  const eggs = { itemKey: "egg", name: "eggs", qty: 12, pay: 2 };
  const now = Date.UTC(2026, 9, 11);

  it("offers an order you haven't taken, unless every slot is gone", () => {
    expect(orderRow(eggs, null, 30, 0, now)).toMatchObject({ taken: false, full: false, canDeliver: 0, qtyPerWeek: 12 });
    expect(orderRow(eggs, null, 30, MAX_ORDERS_PER_ITEM, now).full).toBe(true);
  });

  it("shows this week's progress and what you can deliver from your bag", () => {
    const mine = { qtyPerWeek: 12, delivered: 5, weekStart: now - 86_400_000 };
    expect(orderRow(eggs, mine, 4, MAX_ORDERS_PER_ITEM, now)).toMatchObject({ taken: true, full: false, deliveredThisWeek: 5, canDeliver: 4 });
    expect(orderRow(eggs, mine, 30, 1, now).canDeliver).toBe(7); // only what's left this week
  });

  it("starts the count over once the week has rolled", () => {
    const mine = { qtyPerWeek: 12, delivered: 12, weekStart: now - WEEK_MS - 1 };
    expect(orderRow(eggs, mine, 30, 1, now)).toMatchObject({ deliveredThisWeek: 0, canDeliver: 12 });
  });
});

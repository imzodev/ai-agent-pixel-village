import { describe, expect, it } from "vitest";
import { validateSettings, type SettingsContext } from "@/lib/businessConfig";

const ctx: SettingsContext = {
  placeKeys: new Set(["town:ashford", "building:bakery"]),
  itemKeys: new Set(["bread", "honey_bun"]),
  budgetCapPerDay: 200,
};

describe("validateSettings", () => {
  it("accepts a sensible configuration and cleans the text", () => {
    const r = validateSettings({
      pitchLines: ["Fresh bread at https://evil.example", "  Warm rolls every morning  "],
      patrol: ["town:ashford", "town:ashford", "building:bakery"],
      shopping: [{ itemKey: "bread", maxPrice: 6, perPeriod: 2 }],
      budgetCoins: 50, budgetPeriod: "day", pitchCooldownMin: 360, enabled: true,
    }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.pitchLines).toEqual(["Fresh bread at", "Warm rolls every morning"]);
    expect(r.value.patrol).toEqual(["town:ashford", "building:bakery"]);
    expect(r.value.shopping).toEqual([{ itemKey: "bread", maxPrice: 6, perPeriod: 2 }]);
  });

  it("only returns the fields it was given", () => {
    const r = validateSettings({ enabled: false }, ctx);
    expect(r).toEqual({ ok: true, value: { enabled: false } });
  });

  it("refuses unknown places and items", () => {
    expect(validateSettings({ patrol: ["town:nowhere"] }, ctx).ok).toBe(false);
    expect(validateSettings({ shopping: [{ itemKey: "sword", maxPrice: 5, perPeriod: 1 }] }, ctx).ok).toBe(false);
  });

  it("caps budgets by period", () => {
    expect(validateSettings({ budgetCoins: 200, budgetPeriod: "day" }, ctx).ok).toBe(true);
    expect(validateSettings({ budgetCoins: 201, budgetPeriod: "day" }, ctx).ok).toBe(false);
    expect(validateSettings({ budgetCoins: 1400, budgetPeriod: "week" }, ctx).ok).toBe(true);
    expect(validateSettings({ budgetCoins: 1401, budgetPeriod: "week" }, ctx).ok).toBe(false);
    expect(validateSettings({ budgetCoins: -1 }, ctx).ok).toBe(false);
  });

  it("bounds the pitch cooldown and the shopping numbers", () => {
    expect(validateSettings({ pitchCooldownMin: 30 }, ctx).ok).toBe(false);
    expect(validateSettings({ pitchCooldownMin: 1441 }, ctx).ok).toBe(false);
    expect(validateSettings({ shopping: [{ itemKey: "bread", maxPrice: 0, perPeriod: 1 }] }, ctx).ok).toBe(false);
    expect(validateSettings({ shopping: [{ itemKey: "bread", maxPrice: 5, perPeriod: 21 }] }, ctx).ok).toBe(false);
  });

  it("limits list sizes", () => {
    expect(validateSettings({ pitchLines: Array(6).fill("hi") }, ctx).ok).toBe(false);
    expect(validateSettings({ patrol: Array(7).fill("town:ashford") }, ctx).ok).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { businessActions, businessScriptedPick, businessStateText, isNight } from "@/lib/mind/business";
import type { BusinessView } from "@/types/businessAgent";

const base = (over: Partial<BusinessView> = {}): BusinessView => ({
  now: 0, hour: 12, atHome: true, onTrip: false, intent: "",
  purse: 20, pantry: {}, pitchTargets: [], shopOptions: [], patrolCandidates: [],
  placeNames: {}, memories: [], ...over,
});
const keys = (v: BusinessView) => businessActions(v).map((o) => o.key);

describe("business agent actions", () => {
  it("only offers the business verbs (no craft, farm, fight or collect)", () => {
    const v = base({
      pitchTargets: [{ id: 3, name: "Ada" }],
      shopOptions: [{ itemKey: "bread", sellerKey: "village_marigold", price: 4, purchasesLeft: 2 }],
      patrolCandidates: ["town:ashford"],
    });
    for (const k of keys(v)) {
      expect(k).toMatch(/^(pitch:p\d+|shop:[a-z_]+|patrol:[\w:]+|go_home|tend|rest|wait)$/);
    }
  });

  it("pitches only the players it was given, and at most two", () => {
    const v = base({ pitchTargets: [{ id: 1, name: "A" }, { id: 2, name: "B" }, { id: 3, name: "C" }] });
    expect(keys(v).filter((k) => k.startsWith("pitch:"))).toEqual(["pitch:p1", "pitch:p2"]);
  });

  it("walks its patrol only in daytime", () => {
    const v = base({ patrolCandidates: ["town:ashford"], atHome: false, hour: 22 });
    expect(keys(v).some((k) => k.startsWith("patrol:"))).toBe(false);
    expect(keys({ ...v, hour: 10 })).toContain("patrol:town:ashford");
  });

  it("no shopping or patrol while on a trip; it can only rest or wait", () => {
    const v = base({ onTrip: true, shopOptions: [{ itemKey: "bread", sellerKey: "village_marigold", price: 4, purchasesLeft: 1 }], patrolCandidates: ["town:ashford"], hour: 23 });
    expect(keys(v)).toEqual(["rest"]);
    expect(keys(base({ onTrip: true, hour: 12 }))).toEqual(["wait"]);
  });

  it("goes home when away, and tends the shop when home", () => {
    expect(keys(base({ atHome: false, hour: 12 }))).toContain("go_home");
    expect(keys(base({ atHome: true, hour: 12 }))).toContain("tend");
    expect(keys(base({ atHome: false, hour: 12 }))).not.toContain("tend");
  });

  it("night is 21:00 to 06:00", () => {
    expect(isNight(21)).toBe(true);
    expect(isNight(5)).toBe(true);
    expect(isNight(6)).toBe(false);
    expect(isNight(20)).toBe(false);
  });
});

describe("scripted choice", () => {
  it("prefers a pitch, then a shop, then a patrol, then home", () => {
    const all = businessActions(base({
      pitchTargets: [{ id: 1, name: "A" }],
      shopOptions: [{ itemKey: "bread", sellerKey: "village_marigold", price: 4, purchasesLeft: 1 }],
      patrolCandidates: ["town:ashford"], atHome: false,
    }));
    expect(businessScriptedPick(all)).toBe("pitch:p1");
    const noPitch = all.filter((o) => !o.key.startsWith("pitch:"));
    expect(businessScriptedPick(noPitch)).toBe("shop:bread");
    const noShop = noPitch.filter((o) => !o.key.startsWith("shop:"));
    expect(businessScriptedPick(noShop)).toBe("patrol:town:ashford");
    const noPatrol = noShop.filter((o) => !o.key.startsWith("patrol:"));
    expect(businessScriptedPick(noPatrol)).toBe("go_home");
  });

  it("always returns one of the offered options", () => {
    const opts = businessActions(base({ hour: 3 }));
    expect(opts.map((o) => o.key)).toContain(businessScriptedPick(opts));
  });
});

describe("state text", () => {
  it("states the budget, the pantry and who is nearby in plain words", () => {
    const text = businessStateText(base({ purse: 12, pantry: { bread: 2, flour: 0 }, pitchTargets: [{ id: 1, name: "Ada" }] }));
    expect(text).toContain("Budget left this period: 12 coins.");
    expect(text).toContain("Pantry: 2 bread.");
    expect(text).toContain("Ada");
  });
});

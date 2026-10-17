// A baker's mind: only actions she can really take reach Jev, the scripted
// policy is sensible, her situation reads right, and Jev's answers parse
// (and failures fall back instead of throwing).
import { afterEach, describe, expect, it, vi } from "vitest";
import { REASK_MS, decisionBasis, errandHaul, feasibleActions as feasible, gameDayOf, needsJev, regardTier, requestReward, scriptedPick as scripted, stateText as state } from "@/lib/mind/profile";
import { BAKER, FARMHAND, MILLER, PROFILE_OF, PROFILES, SMITH, WOODCUTTER, profileFor } from "@/lib/mind/profiles";
import { SHOP_STOCK } from "@/lib/trade";
import { askJev, parseJev } from "@/lib/mind/jev";
import fs from "node:fs";
import { npcDef } from "@/lib/npcDefs";
import { CROP_KINDS } from "@/lib/crops";
import type { MindOption, MindView } from "@/types/mind";

const feasibleActions = (v: MindView) => feasible(BAKER, v);
const scriptedPick = (v: MindView, o: readonly MindOption[]) => scripted(BAKER, v, o);
const stateText = (v: MindView) => state(BAKER, v);
const FLOUR_PRICE = BAKER.supplies.flour.price;
const LOW = { flour: BAKER.supplies.flour.low };
const MIN_BAKE_GAP_MS = BAKER.minCraftGapMs;

const NOW = 10_000_000_000;
const view = (over: Partial<MindView> = {}): MindView => ({
  now: NOW, hour: 10, weather: "clear", name: "Marigold", atHome: true, onTrip: false, intent: "", errandArrived: false, arrivedAt: null, gameDay: 5, outingDay: {},
  stock: { flour: 12, egg: 6, honey: 2, bread: 2, honey_bun: 1 }, purse: 40, lastCraftAt: NOW - 3600_000,
  table: { left: 0, itemKey: "bread", bakedAt: NOW - 3600_000 }, requests: [], nearby: [], memories: [],
  ...over,
});
const keys = (v: MindView) => feasibleActions(v).map((o) => o.key);

describe("what she can do", () => {
  it("bakes when the table is empty and she has the flour", () => {
    expect(keys(view())).toEqual(expect.arrayContaining(["bake_bread", "bake_buns", "tend_shop"]));
  });
  it("doesn't bake twice in a row, while away, or without ingredients", () => {
    expect(keys(view({ lastCraftAt: NOW - MIN_BAKE_GAP_MS + 1 }))).not.toContain("bake_bread");
    expect(keys(view({ atHome: false }))).not.toContain("bake_bread");
    expect(keys(view({ stock: { flour: 1, egg: 0 } }))).not.toContain("bake_bread");
    expect(keys(view({ stock: { flour: 4, egg: 2 } }))).not.toContain("bake_buns");
    expect(keys(view({ table: { left: 5, itemKey: "bread", bakedAt: NOW - 60_000 } }))).not.toContain("bake_bread");
  });
  it("low on flour: the mill (if she can pay) or asking; never both requests twice", () => {
    const low = view({ stock: { flour: LOW.flour - 1, egg: 6 } });
    expect(keys(low)).toEqual(expect.arrayContaining(["buy_flour", "ask_flour"]));
    expect(keys({ ...low, purse: FLOUR_PRICE })).not.toContain("buy_flour");
    expect(keys({ ...low, requests: [{ missionId: 1, itemKey: "flour", qty: 4, postedAt: NOW }] })).not.toContain("ask_flour");
  });
  it("gifts only friends she hasn't gifted today, and only with buns on the shelf", () => {
    const nearby = [
      { id: 1, name: "Ana", score: 12, tier: "dear" as const, giftedToday: false },
      { id: 2, name: "Bo", score: 0, tier: "neutral" as const, giftedToday: false },
      { id: 3, name: "Cy", score: 5, tier: "fond" as const, giftedToday: true },
    ];
    expect(keys(view({ nearby }))).toContain("gift:1");
    expect(keys(view({ nearby })).filter((k) => k.startsWith("gift:"))).toEqual(["gift:1"]);
    expect(keys(view({ nearby, stock: { flour: 12, egg: 6, honey_bun: 0 } }))).not.toContain("gift:1");
  });
  it("away: heads home, unless still walking to the mill", () => {
    expect(keys(view({ atHome: false }))).toContain("go_home");
    expect(keys(view({ atHome: false, intent: "errand:flour" }))).not.toContain("go_home");
    expect(keys(view({ atHome: false, intent: "errand:flour", errandArrived: true }))).toContain("go_home");
    expect(keys(view({ atHome: false, onTrip: true }))).not.toContain("go_home");
  });
});

describe("the scripted policy", () => {
  it("goes home first, then bakes what the shelf lacks, then restocks", () => {
    expect(scriptedPick(view({ atHome: false }), feasibleActions(view({ atHome: false })))).toBe("go_home");
    const v = view({ stock: { flour: 12, egg: 6, honey: 2, bread: 6, honey_bun: 0 } });
    expect(scriptedPick(v, feasibleActions(v))).toBe("bake_buns");
    const low = view({ stock: { flour: 2, egg: 6 }, table: { left: 3, itemKey: "bread", bakedAt: NOW - 60_000 } });
    expect(scriptedPick(low, feasibleActions(low))).toBe("buy_flour");
    const calm = view({ table: { left: 3, itemKey: "bread", bakedAt: NOW - 60_000 } });
    expect(scriptedPick(calm, feasibleActions(calm))).toBe("tend_shop");
  });
});

describe("her situation in words", () => {
  it("states the facts Jev decides from", () => {
    const t = stateText(view({ nearby: [{ id: 1, name: "Ana", score: 12, tier: "dear", giftedToday: false }], memories: [{ at: NOW, text: "She baked 12 loaves." }] }));
    for (const s of ["12 bags of flour", "6 eggs", "40 coins", "Ana (a dear friend)", "She baked 12 loaves.", "free table is empty"]) expect(t).toContain(s);
  });
  it("tiers and rewards", () => {
    expect([regardTier(-5), regardTier(0), regardTier(5), regardTier(12)]).toEqual(["cool", "neutral", "fond", "dear"]);
    expect(requestReward(BAKER, "egg", 6, 3)).toBeGreaterThan(requestReward(BAKER, "egg", 6, 0));
    expect(requestReward(BAKER, "egg", 1, 0)).toBeGreaterThanOrEqual(3);
    for (const r of Object.values(BAKER.crafts)) expect(r.toTable).toBeLessThan(r.makes);
  });
});

describe("Jev", () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  const body = { model: "jev-1.13.0", answers: {
    action: { type: "choice", choice: "bake_bread", confidence: 0.8, probabilities: { bake_bread: 0.9, tend_shop: 0.1 } },
    mood: { type: "score", score: 3.2, confidence: 0.5, probabilities: { "3": 0.8 } },
  } };
  it("parses choices and scores", () => {
    const a = parseJev(body)!;
    expect(a.choices.action).toEqual({ choice: "bake_bread", confidence: 0.8, probabilities: { bake_bread: 0.9, tend_shop: 0.1 } });
    expect(a.scores.mood.score).toBe(3.2);
    expect(parseJev({ nope: 1 })).toBeNull();
  });
  it("sends state + questions with the key, and never throws", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    const fetchOk = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    const a = await askJev("state", { action: { type: "choice", instructions: "?", criteria: { a: "A" } } }, fetchOk as unknown as typeof fetch);
    expect(a?.choices.action.choice).toBe("bake_bread");
    const [, init] = fetchOk.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-key");
    expect(JSON.parse(String(init.body))).toMatchObject({ state: "state", model: "jev-latest" });
    expect(await askJev("s", {}, (async () => new Response("err", { status: 500 })) as unknown as typeof fetch)).toBeNull();
    expect(await askJev("s", {}, (async () => { throw new Error("down"); }) as unknown as typeof fetch)).toBeNull();
  });
  it("without a key it doesn't call at all", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    const f = vi.fn();
    expect(await askJev("s", {}, f as unknown as typeof fetch)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});

describe("profiles", () => {
  it("every minded NPC is real and every shelf item is in its shop", () => {
    for (const [npcKey, prof] of Object.entries(PROFILE_OF)) {
      expect(npcDef(npcKey), npcKey).toBeDefined();
      expect(PROFILES[prof], prof).toBeDefined();
      const sold = new Set((SHOP_STOCK[npcKey] ?? []).map((t) => t.itemKey));
      for (const item of Object.keys(PROFILES[prof].shelf)) expect(sold.has(item), `${npcKey} sells ${item}`).toBe(true);
      for (const s of Object.values(PROFILES[prof].supplies)) {
        if (s.supplierKey) expect(npcDef(s.supplierKey), s.supplierKey).toBeDefined();
        else expect(s.spot && s.price === 0, `${npcKey} gathers at a spot`).toBe(true);
      }
      for (const o of Object.values(PROFILES[prof].outings ?? {})) expect(!!o.placeKey || !!o.spot, o.place).toBe(true);
      for (const d of Object.values(PROFILES[prof].sells ?? {})) expect(npcDef(d.buyerKey), d.buyerKey).toBeDefined();
      for (const s of Object.values(PROFILES[prof].supplies)) {
        if (!s.gather) continue;
        expect(s.gather.radius, s.place).toBeGreaterThan(0);
        if (s.gather.from === "nodes") expect(CROP_KINDS[s.gather.kind], s.gather.kind).toBeDefined();
        else expect(s.gather.perTree).toBeGreaterThan(0);
      }
    }
    expect(profileFor("village_pip")).toBeNull();
  });
  it("Bjorn forges for his shelf (no table), and short of stone asks for it or goes out to gather it", () => {
    const v: MindView = { ...view(), name: "Bjorn", table: null, stock: { stone: 2, wood: 8, axe: 0, arrow: 0, stone_sword: 0 }, purse: 60 };
    const k = feasible(SMITH, v).map((o) => o.key);
    expect(k).toContain("ask_stone");
    expect(k).toContain("buy_stone"); // a walk to the Greyspine pass, free
    expect(feasible(SMITH, v).find((o) => o.key === "buy_stone")!.description).toMatch(/gather/);
    expect(k).not.toContain("buy_wood"); // he has wood
    expect(k).not.toContain("forge_axes"); // 2 stones aren't enough
    // with no purse at all, gathering is still free
    expect(feasible(SMITH, { ...v, purse: 0 }).map((o) => o.key)).toContain("buy_stone");
    const rich: MindView = { ...v, stock: { stone: 12, wood: 8, axe: 0, arrow: 0, stone_sword: 0 } };
    expect(feasible(SMITH, rich).map((o) => o.key)).toEqual(expect.arrayContaining(["forge_axes", "forge_sword", "fletch_arrows"]));
    expect(state(SMITH, rich)).toContain("the blacksmith of Hollowmere");
  });
});

describe("first-meeting gifts", () => {
  it("are keyed by real NPCs", () => {
    // offers.ts talks to the database on import, so read its keys as text.
    const src = fs.readFileSync("src/lib/offers.ts", "utf8");
    const block = src.slice(src.indexOf("FIRST_MEETING_GIFTS"), src.indexOf("};", src.indexOf("FIRST_MEETING_GIFTS")));
    const keys = [...block.matchAll(/^\s{2}([a-z_]+): \{/gm)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(npcDef(k), k).toBeDefined();
  });
});

describe("mind income", () => {
  it("grows with the players active in the last day", async () => {
    const { incomeRate, purseTarget } = await import("@/lib/mind/profile");
    expect(incomeRate(BAKER, 0)).toBe(300);
    expect(incomeRate(BAKER, 100)).toBe(6300);
    expect(purseTarget(BAKER, 0)).toBe(1000);
    expect(purseTarget(BAKER, 100)).toBe(21000);
    expect(incomeRate(SMITH, 100)).toBe(4200);
    expect(incomeRate(BAKER, 100, 0.5)).toBe(3150); // MIND_INCOME_SCALE
  });

  it("pays by time passed, never for more than a day at once", async () => {
    const { incomeFor, INCOME_MAX_ELAPSED_MS } = await import("@/lib/mind/profile");
    expect(incomeFor(360, 60_000)).toBe(6); // 6 a minute at 360/h
    expect(incomeFor(360, -5)).toBe(0);
    expect(incomeFor(1000, INCOME_MAX_ELAPSED_MS * 7)).toBe(24_000);
  });
});

describe("selling to a buyer with a purse", () => {
  it("sells as many as they can pay for", async () => {
    const { affordableQty } = await import("@/lib/mind/profile");
    expect(affordableQty(7, 24, 20)).toBe(0); // the pumpkin with Haggler, 20 coins
    expect(affordableQty(7, 24, 80)).toBe(3);
    expect(affordableQty(7, 24, 1000)).toBe(7);
    expect(affordableQty(7, 24, null)).toBe(7); // no purse: always pays
  });

  it("says what they have when they can't pay for one", async () => {
    const { cantAffordText } = await import("@/lib/mind/profile");
    expect(cantAffordText("Marigold", 20, "pumpkin", 24)).toBe("Marigold only has 20 🪙 right now (one pumpkin costs 24). Come back a little later.");
  });
});

describe("when to ask Jev", () => {
  const opt = (...k: string[]) => k.map((key) => ({ key, description: key }));
  const v = view();
  it("not with one thing to do", () => {
    expect(needsJev(null, "x", opt("tend_shop"), NOW)).toBe("only");
  });
  it("not when nothing changed since it last chose, for REASK_MS", () => {
    const options = opt("tend_shop", "bake_bread");
    const basis = decisionBasis(options, v);
    const prev = { at: NOW - 60_000, source: "jev" as const, action: "tend_shop", options: ["tend_shop", "bake_bread"], askedAt: NOW - 60_000, basis };
    expect(needsJev(prev, basis, options, NOW)).toBe("same");
    expect(needsJev({ ...prev, askedAt: NOW - REASK_MS - 1 }, basis, options, NOW)).toBe("ask"); // stale
    expect(needsJev(prev, decisionBasis(opt("tend_shop", "bake_buns"), v), opt("tend_shop", "bake_buns"), NOW)).toBe("ask"); // new option
    expect(needsJev(prev, decisionBasis(options, { ...v, nearby: [{ id: 3, name: "M", score: 0, tier: "neutral", giftedToday: false }] }), options, NOW)).toBe("ask"); // someone came by
    expect(needsJev(null, basis, options, NOW)).toBe("ask"); // never asked
  });
  it("the basis ignores order, and counts intent", () => {
    expect(decisionBasis(opt("a", "b"), v)).toBe(decisionBasis(opt("b", "a"), v));
    expect(decisionBasis(opt("a"), v)).not.toBe(decisionBasis(opt("a"), { ...v, intent: "going_home" }));
  });
});

describe("errands and outings", () => {
  it("buying spends the purse; gathering is free", () => {
    expect(errandHaul(BAKER.supplies.flour, 100)).toEqual({ qty: 8, cost: 24 });
    expect(errandHaul(BAKER.supplies.flour, 10)).toEqual({ qty: 3, cost: 9 });
    expect(errandHaul(SMITH.supplies.stone, 0)).toEqual({ qty: SMITH.supplies.stone.buy, cost: 0 }); // gathered
    // bought from a supplier with real stock: no more than they have
    expect(errandHaul(SMITH.supplies.wood, 100, 5)).toEqual({ qty: 5, cost: 10 });
    expect(errandHaul(SMITH.supplies.wood, 100, 0)).toEqual({ qty: 0, cost: 0 });
  });
  it("an outing is offered in its hours, at work, once a game day", () => {
    const at = (over: Partial<MindView>) => feasible(BAKER, view(over)).map((o) => o.key);
    expect(at({ hour: 19 })).toContain("outing:supper");
    expect(at({ hour: 12 })).not.toContain("outing:supper");
    expect(at({ hour: 19, outingDay: { supper: 5 } })).not.toContain("outing:supper"); // done today
    expect(at({ hour: 19, outingDay: { supper: 4 } })).toContain("outing:supper"); // yesterday's
    expect(at({ hour: 19, atHome: false })).not.toContain("outing:supper");
    expect(at({ hour: 19, intent: "errand:flour" })).not.toContain("outing:supper");
  });
  it("walking somewhere, there's nothing to decide (so no Jev call)", () => {
    expect(feasible(BAKER, view({ onTrip: true, hour: 19 })).map((o) => o.key)).toEqual(["wait"]);
  });
  it("lingers there a while before heading home", () => {
    const out = (arrivedAt: number | null) => feasible(BAKER, view({ hour: 19, atHome: false, intent: "outing:supper", arrivedAt })).map((o) => o.key);
    expect(out(NOW - 60_000)).not.toContain("go_home");
    expect(out(NOW - BAKER.outings!.supper.lingerMs)).toContain("go_home");
    expect(out(null)).not.toContain("go_home"); // still on the way
  });
  it("game days turn at midnight", () => {
    const day = 24 * 60_000; // a 24-minute day
    expect(gameDayOf(0, 24, 0)).toBe(0); // 7:00 on day 0
    expect(gameDayOf(0, 24, day * (17 / 24) - 1)).toBe(0); // 23:59
    expect(gameDayOf(0, 24, day * (17 / 24))).toBe(1); // midnight
  });
});

describe("the supply chains", () => {
  const at = (p: typeof BAKER, over: Partial<MindView>) => feasible(p, view({ table: null, ...over })).map((o) => o.key);
  it("field → mill → bakery: Rowan cuts wheat, carries a full load to Hollis, Hollis mills it, Marigold buys the flour", () => {
    expect(at(FARMHAND, { stock: { wheat: 4 } })).toContain("buy_wheat"); // to the Common Field to cut more
    expect(at(FARMHAND, { stock: { wheat: 4 } })).not.toContain("sell_wheat"); // not a full load yet
    const full = at(FARMHAND, { stock: { wheat: 12 } });
    expect(full).toContain("sell_wheat");
    expect(full).not.toContain("buy_wheat");
    expect(FARMHAND.sells!.wheat.buyerKey).toBe("village_hollis");
    expect(at(MILLER, { stock: { wheat: 6, flour: 4 } })).toContain("mill_flour");
    expect(at(MILLER, { stock: { wheat: 2, flour: 4 } })).not.toContain("mill_flour");
    expect(BAKER.supplies.flour.supplierKey).toBe("village_hollis");
  });
  it("woodpile → forge: Ansel keeps his pile stacked, Bjorn buys from it", () => {
    expect(at(WOODCUTTER, { stock: { wood: 10 } })).toContain("buy_wood"); // below 20: back to the woods
    expect(at(WOODCUTTER, { stock: { wood: 30 } })).not.toContain("buy_wood");
    expect(SMITH.supplies.wood.supplierKey).toBe("hollowmere_ansel");
    expect(at(SMITH, { stock: { wood: 0, stone: 12 }, purse: 50 })).toContain("buy_wood");
  });
  it("the scripted policy sells a full load before going back for more", () => {
    const v = view({ table: null, stock: { wheat: 12 } });
    expect(scripted(FARMHAND, v, feasible(FARMHAND, v))).toBe("sell_wheat");
  });
});

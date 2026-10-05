// A baker's mind: only actions she can really take reach Jev, the scripted
// policy is sensible, her situation reads right, and Jev's answers parse
// (and failures fall back instead of throwing).
import { afterEach, describe, expect, it, vi } from "vitest";
import { feasibleActions as feasible, regardTier, requestReward, scriptedPick as scripted, stateText as state } from "@/lib/mind/profile";
import { BAKER, PROFILE_OF, PROFILES, SMITH, profileFor } from "@/lib/mind/profiles";
import { SHOP_STOCK } from "@/lib/trade";
import { askJev, parseJev } from "@/lib/mind/jev";
import fs from "node:fs";
import { npcDef } from "@/lib/npcDefs";
import type { MindOption, MindView } from "@/types/mind";

const feasibleActions = (v: MindView) => feasible(BAKER, v);
const scriptedPick = (v: MindView, o: readonly MindOption[]) => scripted(BAKER, v, o);
const stateText = (v: MindView) => state(BAKER, v);
const FLOUR_PRICE = BAKER.supplies.flour.price;
const LOW = { flour: BAKER.supplies.flour.low };
const MIN_BAKE_GAP_MS = BAKER.minCraftGapMs;

const NOW = 10_000_000_000;
const view = (over: Partial<MindView> = {}): MindView => ({
  now: NOW, hour: 10, weather: "clear", name: "Marigold", atHome: true, onTrip: false, intent: "", errandArrived: false,
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
      for (const s of Object.values(PROFILES[prof].supplies)) expect(npcDef(s.supplierKey), s.supplierKey).toBeDefined();
    }
    expect(profileFor("village_pip")).toBeNull();
  });
  it("Bjorn forges for his shelf (no table), asks for stone, and doesn't run errands", () => {
    const v: MindView = { ...view(), name: "Bjorn", table: null, stock: { stone: 2, wood: 8, axe: 0, arrow: 0, stone_sword: 0 }, purse: 60 };
    const k = feasible(SMITH, v).map((o) => o.key);
    expect(k).toContain("ask_stone");
    expect(k).not.toContain("forge_axes"); // 2 stones aren't enough
    expect(k.some((x) => x.startsWith("buy_"))).toBe(false);
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

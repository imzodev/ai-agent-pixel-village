// NPC keys are `<place>_<name>`, jobs are trades: keys are unique, every
// renamed key lands on a real NPC, and recipes follow trades, not keys.
import { describe, expect, it } from "vitest";
import { NPC_DEFS, npcDef, npcsWithTrade } from "@/lib/npcDefs";
import { LEGACY_NPC_KEYS } from "@/lib/npcKeys";
import { RECIPES, recipesForNpc } from "@/lib/recipes";
import { INNS } from "@/lib/inn";
import { SHOP_STOCK, TRADES } from "@/lib/trade";
import { TUTORIAL_STEPS } from "@/lib/tutorial";
import { QUEST_TEMPLATES } from "@/services/QuestTemplates";

describe("NPC keys", () => {
  it("are unique and shaped <place>_<name>", () => {
    const keys = NPC_DEFS.map((n) => n.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z]+_[a-z]+$/);
  });
  it("Hettie and Bram are two NPCs", () => {
    expect(npcDef("village_hettie")?.name).toBe("Hettie");
    expect(npcDef("village_bram")?.name).toBe("Bram");
  });
  it("renames every old key to a real NPC, and never reuses an old key", () => {
    for (const [from, to] of Object.entries(LEGACY_NPC_KEYS)) {
      expect(npcDef(to), `${from} → ${to}`).toBeDefined();
      expect(LEGACY_NPC_KEYS[to], to).toBeUndefined();
      expect(npcDef(from), from).toBeUndefined();
    }
  });
  it("every key the game names is a real NPC", () => {
    const named = [
      ...Object.values(INNS), ...Object.keys(SHOP_STOCK), ...Object.keys(TRADES),
      ...TUTORIAL_STEPS.flatMap((s) => [s.match?.npcKey, s.target?.kind === "npc" ? s.target.npcKey : undefined]),
      ...QUEST_TEMPLATES.map((q) => (q.requirement.type === "talk" ? q.requirement.npcKey : undefined)),
    ].filter((k): k is string => !!k && k !== "any");
    for (const k of named) expect(npcDef(k), k).toBeDefined();
  });
});

describe("trades", () => {
  it("every recipe's trade has someone who does it", () => {
    for (const r of RECIPES) expect(npcsWithTrade(r.trade).length, `${r.key} (${r.trade})`).toBeGreaterThan(0);
  });
  it("Greta and Bjorn both forge the smith's gear", () => {
    for (const k of ["village_greta", "hollowmere_bjorn"]) {
      const outs = recipesForNpc(k).map((r) => r.output.itemKey);
      expect(outs, k).toContain("recurve_bow");
      expect(outs, k).toContain("stone_sword");
    }
    expect(recipesForNpc("hollowmere_bjorn").some((r) => r.trade === "tinker")).toBe(false);
  });
  it("anyone with a trade crafts all of its recipes", () => {
    for (const r of RECIPES) for (const n of npcsWithTrade(r.trade)) expect(recipesForNpc(n.key), `${n.key} ${r.key}`).toContain(r);
  });
});

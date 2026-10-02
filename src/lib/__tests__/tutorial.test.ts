// The guided first session: steps match only their own events, every
// reward exists, and the finished / skipped markers sit past the steps.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { TUTORIAL_DONE, TUTORIAL_SKIPPED, TUTORIAL_STEPS, stepMatches } from "@/lib/tutorial";

// seed.ts talks to the database on import, so read its keys as text.
const SEED_KEYS = new Set([...fs.readFileSync("src/lib/seed.ts", "utf8").matchAll(/\bkey: "([a-z_]+)"/g)].map((m) => m[1]));

describe("tutorial steps", () => {
  it("has five steps, ending in the Newcomer title", () => {
    expect(TUTORIAL_STEPS).toHaveLength(5);
    expect(TUTORIAL_STEPS.at(-1)!.reward.title).toBe("Newcomer");
    expect(TUTORIAL_DONE).toBeGreaterThan(TUTORIAL_STEPS.length);
    expect(TUTORIAL_SKIPPED).toBeGreaterThan(TUTORIAL_STEPS.length);
    expect(TUTORIAL_SKIPPED).not.toBe(TUTORIAL_DONE);
  });

  it("rewards and NPC targets refer to real items and folk", () => {
    const items = SEED_KEYS, npcs = SEED_KEYS;
    for (const s of TUTORIAL_STEPS) {
      for (const i of s.reward.items ?? []) expect(items.has(i.itemKey), i.itemKey).toBe(true);
      if (s.target.kind === "npc") expect(npcs.has(s.target.npcKey), s.target.npcKey).toBe(true);
      if (s.match?.npcKey) expect(npcs.has(s.match.npcKey)).toBe(true);
    }
  });

  it("advances only on the matching event", () => {
    const [talk, plant, chop, slime, sell] = TUTORIAL_STEPS;
    expect(stepMatches(talk, "talk", { npcKey: "elder" })).toBe(true);
    expect(stepMatches(talk, "talk", { npcKey: "shopkeeper" })).toBe(false);
    expect(stepMatches(talk, "plant", {})).toBe(false);
    expect(stepMatches(plant, "plant", {})).toBe(true);
    expect(stepMatches(chop, "collect", { itemKey: "wood" })).toBe(true);
    expect(stepMatches(chop, "collect", { itemKey: "stone" })).toBe(false);
    expect(stepMatches(slime, "defeat", { enemyKind: "slime" })).toBe(true);
    expect(stepMatches(slime, "defeat", { enemyKind: "wolf" })).toBe(false);
    expect(stepMatches(sell, "sell", {})).toBe(true);
    expect(stepMatches(sell, "talk", { npcKey: "shopkeeper" })).toBe(false);
  });
});

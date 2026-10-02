// The collection book: pages built from the game's data, completion, and
// achievements derived from counts.
import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, achievementsDone, collectionPages, pageComplete } from "@/lib/collection";
import type { CollectionCounts } from "@/types/collection";
import { FISH_DEFS } from "@/lib/fishing";
import { REGIONS } from "@/lib/regions";

const folk = [{ key: "elder", name: "Elder Oswin", icon: "🧓" }, { key: "shopkeeper", name: "Pip", icon: "🧑" }];
const pages = collectionPages(folk);
const page = (k: string) => pages.find((p) => p.key === k)!;

describe("pages", () => {
  it("five pages, each with entries and a unique title", () => {
    expect(pages.map((p) => p.key)).toEqual(["fish", "crops", "creatures", "places", "folk"]);
    for (const p of pages) expect(p.entries.length, p.key).toBeGreaterThan(0);
    const titles = [...pages.map((p) => p.reward.title), ...ACHIEVEMENTS.map((a) => a.title)];
    expect(new Set(titles).size).toBe(titles.length);
  });
  it("a page completes only with every entry found", () => {
    const fish = page("fish");
    const all: CollectionCounts = { fish: Object.fromEntries(FISH_DEFS.map((f) => [f.key, 1])) };
    expect(pageComplete(fish, all)).toBe(true);
    const missing: CollectionCounts = { fish: { ...all.fish, [FISH_DEFS[0].key]: 0 } };
    expect(pageComplete(fish, missing)).toBe(false);
    expect(pageComplete(fish, {})).toBe(false);
    expect(pageComplete(page("folk"), { npc: { elder: 1, shopkeeper: 2 } })).toBe(true);
  });
});

describe("achievements", () => {
  it("derive from counts, level and the tutorial", () => {
    expect(achievementsDone({}, 1, false).size).toBe(0);
    expect(achievementsDone({}, 1, true)).toContain("newcomer");
    expect(achievementsDone({}, 10, false)).toContain("veteran");
    const d = achievementsDone({ fish: { river_trout: 20, silverrun_pike: 5 }, enemy: { rootking: 1 } }, 3, false);
    expect([...d].sort()).toEqual(["angler", "hooked", "legend", "rootbreaker"]);
    const everywhere: CollectionCounts = { region: Object.fromEntries(REGIONS.map((r) => [r.key, 1])) };
    expect(achievementsDone(everywhere, 1, false)).toContain("explorer");
  });
});

import { describe, expect, it } from "vitest";
import { storyCatalog, storyBand } from "@/lib/story/catalog";
import { parseStory } from "@/lib/story/parse";
import { storySystemPrompt, storyUserPrompt } from "@/lib/story/prompt";
import { STORY_MAX_CHAPTERS, STORY_MIN_CHAPTERS, QTY_MAX, chapterMatches, chapterReward, withRewards, wellFormed } from "@/lib/story/rules";
import { STORY_TEMPLATES, closestTemplate } from "@/lib/story/templates";
import { chapterWhere, storyNote, storyViewOf } from "@/lib/story/view";
import { NPC_DEFS } from "@/lib/npcDefs";
import type { StoryCatalog } from "@/types/story";

const has = (list: { key: string }[], k?: string) => !!k && list.some((x) => x.key === k);

describe("story catalog", () => {
  it("grows with the hero's level and only names real things", () => {
    const lo = storyCatalog(1), hi = storyCatalog(20);
    expect(storyBand(1)).toBe(1);
    expect(storyBand(20)).toBe(3);
    expect(hi.npcs.length).toBeGreaterThan(lo.npcs.length);
    expect(hi.foes.length).toBeGreaterThan(lo.foes.length);
    expect(hi.regions.length).toBeGreaterThan(lo.regions.length);
    for (const n of hi.npcs) expect(NPC_DEFS.some((d) => d.key === n.key)).toBe(true);
    // A new hero isn't sent past the Greyspine pass, nor after far-land foes.
    expect(lo.npcs.some((n) => n.key.startsWith("brightwater_"))).toBe(false);
    expect(has(lo.foes, "ice_troll")).toBe(false);
    expect(has(lo.regions, "brightwater")).toBe(false);
    // Loot from allowed foes can be collected; every collectable can be delivered.
    expect(has(lo.collect, "wolf_pelt")).toBe(true);
    for (const c of lo.collect) expect(has(lo.deliver, c.key)).toBe(true);
  });
});

describe("hand-written stories", () => {
  const cat = storyCatalog(1);
  it.each(STORY_TEMPLATES.map((t) => [t.key, t] as const))("%s names only what a new hero can reach", (_k, t) => {
    expect(t.chapters.length).toBeGreaterThanOrEqual(STORY_MIN_CHAPTERS);
    expect(t.chapters.length).toBeLessThanOrEqual(STORY_MAX_CHAPTERS);
    expect(t.heroTitle.length).toBeLessThanOrEqual(24);
    for (const c of t.chapters) {
      expect(c.qty).toBeGreaterThanOrEqual(1);
      expect(c.qty).toBeLessThanOrEqual(QTY_MAX[c.event]);
      if (c.event === "talk" || c.event === "deliver") expect(has(cat.npcs, c.match.npcKey)).toBe(true);
      if (c.event === "deliver") expect(has(cat.deliver, c.match.itemKey)).toBe(true);
      if (c.event === "collect") expect(has(cat.collect, c.match.itemKey)).toBe(true);
      if (c.event === "defeat") expect(has(cat.foes, c.match.enemyKind)).toBe(true);
      if (c.event === "visit") expect(has(cat.regions, c.match.region)).toBe(true);
      if (c.match.npcKey || c.match.region) expect(chapterWhere({ ...c, reward: { coins: 0, xp: 0 } })).not.toBeNull();
    }
  });

  it("the closest one to a hero line is picked by its words", () => {
    expect(closestTemplate("A retired pirate who loves a good treasure map").key).toBe("old_map");
    expect(closestTemplate("a monster hunter with a big sword").key).toBe("hunters_mark");
    expect(closestTemplate("a cozy farmer").key).toBe("harvest_keeper");
    expect(closestTemplate("zzz").key).toBe(STORY_TEMPLATES[0].key);
  });
});

describe("rewards", () => {
  it("pay for the work, not the number of chapters", () => {
    const talk = chapterReward({ event: "talk", qty: 1 }, 5, false);
    const hunt = chapterReward({ event: "defeat", qty: 4 }, 5, false);
    expect(hunt.coins).toBeGreaterThan(talk.coins);
    expect(hunt.xp).toBeGreaterThan(talk.xp);
    // Asking for more than the cap pays no more.
    expect(chapterReward({ event: "collect", qty: 999 }, 5, false)).toEqual(chapterReward({ event: "collect", qty: QTY_MAX.collect }, 5, false));
  });
  it("the finale pays double, and more at higher levels", () => {
    const ch = { event: "defeat" as const, qty: 3 };
    expect(chapterReward(ch, 5, true).coins).toBe(2 * chapterReward(ch, 5, false).coins);
    expect(chapterReward(ch, 20, false).xp).toBeGreaterThan(chapterReward(ch, 2, false).xp);
    const all = withRewards(STORY_TEMPLATES[0].chapters, 1);
    expect(all.at(-1)!.reward.coins).toBeGreaterThan(0);
  });
});

describe("matching", () => {
  it("counts only what the chapter asks for", () => {
    expect(chapterMatches({ event: "talk", match: { npcKey: "village_pip" } }, { kind: "talk", npcKey: "village_pip" })).toBe(true);
    expect(chapterMatches({ event: "talk", match: { npcKey: "village_pip" } }, { kind: "talk", npcKey: "village_oswin" })).toBe(false);
    expect(chapterMatches({ event: "deliver", match: { npcKey: "village_pip", itemKey: "egg" } }, { kind: "talk", npcKey: "village_pip" })).toBe(true);
    expect(chapterMatches({ event: "collect", match: { itemKey: "wood" } }, { kind: "collect", itemKey: "stone" })).toBe(false);
    expect(chapterMatches({ event: "defeat", match: { enemyKind: "wolf" } }, { kind: "defeat", enemyKind: "wolf" })).toBe(true);
    expect(chapterMatches({ event: "visit", match: { region: "meadow" } }, { kind: "visit", region: "meadow" })).toBe(true);
    expect(chapterMatches({ event: "fish", match: {} }, { kind: "fish", itemKey: "trout" })).toBe(true);
    expect(chapterMatches({ event: "sell", match: {} }, { kind: "plant" })).toBe(false);
  });
});

describe("parsing the AI's story", () => {
  const cat: StoryCatalog = storyCatalog(1);
  const good = {
    title: "The Pirate's Rest", premise: "A retired pirate wants peace.", ending: "Peace, at last.", heroTitle: "Old Salt",
    chapters: [
      { title: "Ashore", text: "Talk to Odo.", do: "talk", who: "village_odo", npcNote: "You know a pirate when you see one." },
      { title: "Firewood", text: "Chop wood.", do: "collect", item: "wood", qty: 50 },
      { title: "Old habits", text: "Slimes!", do: "defeat", foe: "slime", qty: 3 },
      { title: "A gift", text: "Bring Marigold eggs.", do: "deliver", who: "village_marigold", item: "egg", qty: 3 },
      { title: "Fish supper", text: "Catch some fish.", do: "fish", qty: 2 },
    ],
  };

  it("keeps a good story, clamps counts and strips thinking", () => {
    const s = parseStory(`<think>hmm</think>Here: ${JSON.stringify(good)}`, cat)!;
    expect(s).not.toBeNull();
    expect(s.chapters).toHaveLength(5);
    expect(s.chapters[1].qty).toBe(QTY_MAX.collect);
    expect(s.chapters[3].match).toEqual({ npcKey: "village_marigold", itemKey: "egg" });
    expect(s.chapters[0].npcNote).toContain("pirate");
  });

  it("drops chapters that name anything not in the world", () => {
    const bad = { ...good, chapters: [...good.chapters, { title: "Dragon", text: "Slay it.", do: "defeat", foe: "dragon", qty: 1 }, { title: "Who?", text: "Talk.", do: "talk", who: "village_nobody" }] };
    const s = parseStory(JSON.stringify(bad), cat)!;
    expect(s.chapters).toHaveLength(5);
    expect(s.chapters.every((c) => c.match.enemyKind !== "dragon" && c.match.npcKey !== "village_nobody")).toBe(true);
  });

  it("refuses too few chapters, mostly talk, or no JSON at all", () => {
    expect(parseStory(JSON.stringify({ ...good, chapters: good.chapters.slice(0, 2) }), cat)).toBeNull();
    const chatty = { ...good, chapters: [...[0, 1, 2, 3].map((i) => ({ title: `Chat ${i}`, text: "Talk.", do: "talk", who: "village_pip" })), good.chapters[1]] };
    expect(parseStory(JSON.stringify(chatty), cat)).toBeNull();
    expect(parseStory("Once upon a time…", cat)).toBeNull();
    expect(wellFormed([])).toBe(false);
  });

  it("cleans the text a story shows to others", () => {
    const s = parseStory(JSON.stringify({ ...good, title: "Visit www.scam.example now", heroTitle: "<b>Lord</b> of {fuck}" }), cat)!;
    expect(s.title).not.toContain("scam");
    expect(s.heroTitle).not.toMatch(/fuck|[<>{}]/);
  });
});

describe("prompts and views", () => {
  it("the storyteller's prompt lists the world and the player's line", () => {
    const cat = storyCatalog(1);
    const sys = storySystemPrompt(cat);
    expect(sys).toContain("village_oswin");
    expect(sys).toContain("STRICT JSON");
    expect(storyUserPrompt({ name: "Ada", level: 3, about: "a retired pirate" })).toContain("a retired pirate");
    expect(storyUserPrompt({ name: "Ada", level: 3, about: "x" }, { title: "Before", premise: "p", ending: "e" })).toContain("continues");
  });

  it("the chapter's NPC is told their part, and what a delivery still needs", () => {
    const [row] = [{ id: 1, title: "T", premise: "P", source: "template" as const, step: 4, progress: 0, chapters: withRewards(STORY_TEMPLATES[0].chapters, 1) }];
    const v = storyViewOf(row)!;
    expect(v.chapter.event).toBe("deliver");
    expect(v.names.npc).toBe("Bjorn");
    const note = storyNote("Ada", row, v.chapter, 1);
    expect(note).toContain("ADA'S STORY");
    expect(note).toContain("they have 1 so far");
    expect(storyNote("Ada", row, v.chapter, 2)).toContain("thank them");
    expect(storyViewOf({ ...row, step: 99 })).toBeNull();
  });
});

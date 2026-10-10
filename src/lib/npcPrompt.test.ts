import { describe, expect, it } from "vitest";
import { knowledgeFor } from "./npcKnowledge";
import { personalityFor, hasNamedPersonality } from "./npcPersonalities";
import { buildSystemPrompt } from "./npcPrompt";
import { NPC_DEFS } from "./npcDefs";
import { SETTLEMENT_NPCS, TOWNS } from "./settlements";
import type { BrainInput } from "@/types/agent";

const bram = knowledgeFor("village_bram");

describe("npc knowledge", () => {
  it("lists the real neighbours of a grove villager", () => {
    for (const name of ["Marigold", "Pip", "Wren", "Hollis", "Hettie", "Greta"]) expect(bram).toContain(name);
    expect(bram).toContain("You live in the grove");
  });

  it("says where animals really come from", () => {
    expect(bram).toMatch(/Nobody sells animals/);
    expect(bram).toMatch(/ranch lot/);
  });

  it("puts a townsperson in their own town, among their own neighbours", () => {
    const folk = SETTLEMENT_NPCS[0];
    const town = TOWNS.find((t) => t.key === folk.town)!;
    const k = knowledgeFor(folk.key);
    expect(k).toContain(`You live in ${town.name}`);
    for (const n of SETTLEMENT_NPCS.filter((x) => x.town === folk.town && x.key !== folk.key)) expect(k).toContain(n.name);
  });

  it("names items with the given catalogue", () => {
    const k = knowledgeFor("village_hettie", (key) => (key === "hot_stew" ? "Hot Stew" : key));
    expect(k).toContain("Hot Stew (8 coins)");
  });
});

describe("npc personalities", () => {
  it("hand-writes the named villagers and gives every NPC one", () => {
    for (const n of NPC_DEFS) {
      const p = personalityFor(n.key);
      expect(p.voice).toBeTruthy();
      expect(p.quirk).toBeTruthy();
    }
    expect(hasNamedPersonality("village_bram")).toBe(true);
  });

  it("gives the same townsperson the same traits every time", () => {
    const key = SETTLEMENT_NPCS[3].key;
    expect(personalityFor(key)).toEqual(personalityFor(key));
  });
});

describe("npc system prompt", () => {
  const base = {
    npc: { key: "village_bram", name: "Bram", role: "Cabin Dweller", persona: "A jolly cabin dweller.", mood: "jolly" },
    sponsor: null,
    character: { name: "Mariana", level: 27 },
    message: "Who sells chickens?",
    history: [],
    offers: [],
    hour: 14,
    weather: "clear",
    knowledge: bram,
  } as unknown as BrainInput;
  const now = Date.UTC(2026, 9, 10);

  it("carries the knowledge, the honesty rules and the personality", () => {
    const p = buildSystemPrompt(base, now);
    expect(p).toContain("WHAT YOU KNOW");
    expect(p).toContain("Never invent a person");
    expect(p).toContain(personalityFor("village_bram").voice);
    expect(p).not.toContain("village called the grove");
  });

  it("knows when it's a first meeting", () => {
    expect(buildSystemPrompt({ ...base, memory: { note: "", lines: 0, firstMetAt: null } }, now)).toContain("never met Mariana before");
  });

  it("brings in what the NPC remembers about this player", () => {
    const p = buildSystemPrompt({ ...base, memory: { note: "She is saving up for a ranch.", lines: 14, firstMetAt: new Date(now - 3 * 86_400_000) } }, now);
    expect(p).toContain("talked with Mariana before (14 lines, first met 3 days ago)");
    expect(p).toContain("What you remember about Mariana: She is saving up for a ranch.");
  });
});

import { describe, expect, it } from "vitest";
import { knowledgeFor, topicsOf } from "./npcKnowledge";
import { SHOP_STOCK } from "./trade";
import { personalityFor, hasNamedPersonality } from "./npcPersonalities";
import { buildSystemPrompt, npcVoice, TALK_RULES } from "./npcPrompt";
import { NPC_DEFS } from "./npcDefs";
import { plainSpeech } from "./streamedText";
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
    expect(bram).toMatch(/own homestead/);
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

describe("npcs talk like people", () => {
  const base = {
    npc: { key: "village_greta", name: "Greta", role: "Tinker", persona: "A tinker.", mood: "busy" },
    sponsor: null, character: { name: "Mariana", level: 3 }, message: "hi", history: [], offers: [], hour: 9, weather: "clear",
  } as unknown as BrainInput;

  it("asks for short, plain, spoken replies", () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain("HOW TO TALK");
    expect(p).toContain("no *actions*, no stage directions");
    expect(p).toContain("One or two short sentences");
    expect(p).not.toContain("Stay fully in character");
  });

  it("gives nobody a gesture to act out", () => {
    const keys = [...NPC_DEFS.map((n) => n.key), ...SETTLEMENT_NPCS.map((n) => n.key)];
    for (const key of keys) {
      const { voice, quirk } = personalityFor(key);
      expect(`${voice} ${quirk}`).not.toMatch(/strok|wipes|taps|hand along|mending|squint|shush|hums|fiddles|turns every/i);
    }
  });

  it("keeps only the spoken words", () => {
    expect(plainSpeech('*glances up* "Hm? New face." *sets it down* "Back already?"')).toBe("Hm? New face. Back already?");
    expect(plainSpeech("Bread's five coins, love.")).toBe("Bread's five coins, love.");
    expect(plainSpeech("Two *really* good loaves.")).toBe("Two good loaves.");
    expect(plainSpeech("A lone * star")).toBe("A lone star");
    expect(plainSpeech("*waves*")).toBe("waves");
  });

  it("hides a stage direction still streaming in", () => {
    expect(plainSpeech("*doesn't look up, adjusting a", { streaming: true })).toBe("");
    expect(plainSpeech('*nods* "Hm? New', { streaming: true })).toBe("Hm? New");
  });
});

describe("knowledge is spread out, and always true", () => {
  const everyone = NPC_DEFS.map((n) => n.key);
  const soldAnywhere = [...new Set(Object.values(SHOP_STOCK).flatMap((s) => s.map((t) => t.itemKey.replace(/_/g, " "))))];

  it("gives innkeepers the whole world, and a kid only home and nearby", () => {
    expect([...topicsOf("village_hettie")].sort()).toEqual(["craft", "roads", "trade"]);
    expect(topicsOf("village_tobin").size).toBe(0);
    const inns = SETTLEMENT_NPCS.filter((n) => n.job === "innkeeper");
    for (const n of inns) expect(topicsOf(n.key).has("trade")).toBe(true);
    // Most townsfolk know only home and nearby.
    const folk = SETTLEMENT_NPCS.filter((n) => n.job === "folk");
    expect(folk.filter((n) => topicsOf(n.key).size === 0).length).toBeGreaterThan(folk.length / 2);
  });

  it("lets anyone who knows the trade find every item sold anywhere", () => {
    for (const key of everyone.filter((k) => topicsOf(k).has("trade"))) {
      const k = knowledgeFor(key);
      for (const item of soldAnywhere) expect(k, `${key} / ${item}`).toContain(`- ${item}:`);
    }
  });

  it("puts lemon saplings in the desert towns, never with Pip", () => {
    const k = knowledgeFor("village_hettie");
    expect(k).toContain("lemon sapling: the general stores of Sunrest, Miragespring, Scorchrest and Sunspring");
    expect(k).toMatch(/apple sapling: Pip \(the grove\)\n/);
  });

  it("names, for each thing they don't know, someone who really does", () => {
    for (const key of everyone) {
      const k = knowledgeFor(key);
      for (const [, name, place] of k.matchAll(/you don't know, but (.+?) \(.+?, (here|in .+?)\) does\./g)) {
        const who = NPC_DEFS.filter((n) => n.name === name);
        expect(who.length, `${key} → ${name}`).toBeGreaterThan(0);
      }
      // Every topic is either known or has someone to ask.
      for (const [topic, ask] of [["trade", "Where to buy things"], ["craft", "Who makes things"], ["roads", "The way to towns"]] as const) {
        expect(topicsOf(key).has(topic) || k.includes(ask), `${key} / ${topic}`).toBe(true);
      }
    }
    expect(knowledgeFor("village_tobin")).toContain("but Hettie (Innkeeper of the Wayfarer's Rest, here) does");
  });

  it("knows the way: Sunrest lies south-west of the grove", () => {
    expect(knowledgeFor("village_oswin")).toMatch(/Sunrest \(south-west, /);
    // Without the roads, far towns are names only.
    expect(knowledgeFor("village_tobin")).not.toMatch(/Sunrest \(/);
  });

  it("keeps every sheet small enough for the prompt", () => {
    for (const key of everyone) expect(knowledgeFor(key).length, key).toBeLessThan(6000);
  });

  it("tells them to say they don't know rather than guess", () => {
    const p = buildSystemPrompt({ npc: { key: "village_tobin", name: "Tobin", role: "Kid", persona: "A kid.", mood: "shy" }, sponsor: null, character: { name: "M", level: 1 }, message: "hi", history: [], offers: [], hour: 9, weather: "clear", knowledge: knowledgeFor("village_tobin") } as unknown as BrainInput);
    expect(p).toContain("only an exact match counts");
    expect(p).toContain("say plainly that you don't know");
    expect(p).not.toContain("innkeepers hear every rumour");
  });
});

describe("one voice for every line an NPC says", () => {
  it("builds the talk prompt from the shared voice and talk rules", () => {
    const npc = { key: "village_marigold", name: "Marigold", role: "Village Baker", persona: "A baker.", mood: "cheerful" };
    const p = buildSystemPrompt({ npc, sponsor: null, character: { name: "M", level: 1 }, message: "hi", history: [], offers: [], hour: 9, weather: "clear" } as unknown as BrainInput);
    expect(p).toContain(npcVoice(npc as BrainInput["npc"]));
    expect(p).toContain(TALK_RULES);
    expect(npcVoice(npc as BrainInput["npc"])).toContain(personalityFor("village_marigold").voice);
  });
});

// NPCs answering what a player says out loud: who answers, when they let it
// pass, and what's said.
import { describe, expect, it } from "vitest";
import { REACT_NAMED_PX, REACT_NPC_COOLDOWN_MS, REACT_PX, SKIP, cleanReply, namedIn, planReplies, reactPrompt } from "@/lib/npcReact";
import type { ReactCandidate } from "@/types/npcTalk";

const NOW = 1_000_000;
const c = (id: number, name: string, dist: number): ReactCandidate => ({ id, key: `k${id}`, name, dist });
const none = new Map<number, number>();

describe("who answers", () => {
  it("anyone named, from further away, and they must answer", () => {
    const near = [c(1, "Marigold", 40), c(2, "Hollis", REACT_NAMED_PX - 1), c(3, "Rowan", REACT_NAMED_PX + 1)];
    expect(planReplies("Morning Hollis!", near, none, NOW, 0.9)).toEqual([{ npc: near[1], addressed: true }]);
    // Rowan's too far to hear his name; Marigold, close by, may answer instead
    expect(planReplies("hey rowan", near, none, NOW, 0.9)).toEqual([{ npc: near[0], addressed: false }]);
    expect(planReplies("Marigold, Hollis: who's baking?", near, none, NOW, 0.9).map((p) => p.npc.id)).toEqual([1, 2]);
  });
  it("otherwise the nearest in earshot may answer, now and then a second", () => {
    const near = [c(1, "Marigold", 60), c(2, "Hollis", 20), c(3, "Rowan", REACT_PX + 1)];
    expect(planReplies("what a lovely day", near, none, NOW, 0.9)).toEqual([{ npc: near[1], addressed: false }]);
    expect(planReplies("what a lovely day", near, none, NOW, 0.1).map((p) => p.npc.id)).toEqual([2, 1]);
    expect(planReplies("hello?", [c(3, "Rowan", REACT_PX + 1)], none, NOW, 0.1)).toEqual([]);
  });
  it("an NPC that just answered rests a moment", () => {
    const near = [c(1, "Marigold", 20)];
    expect(planReplies("hi", near, new Map([[1, NOW - 1000]]), NOW, 0.9)).toEqual([]);
    expect(planReplies("hi", near, new Map([[1, NOW - REACT_NPC_COOLDOWN_MS]]), NOW, 0.9)).toHaveLength(1);
  });
  it("names match as words, skipping 'Old'", () => {
    expect(namedIn("hi Pip!", "Pip")).toBe(true);
    expect(namedIn("pipe dream", "Pip")).toBe(false);
    expect(namedIn("sorrel, a word?", "Old Sorrel")).toBe(true);
  });
});

describe("what they say", () => {
  const npc = { key: "village_marigold", name: "Marigold", role: "Baker", persona: "A baker.", mood: "warm" };
  it("an unaddressed NPC may let it pass; an addressed one can't", () => {
    expect(reactPrompt(npc, "Mariana", "nice weather", false, {}).system).toContain(SKIP);
    expect(reactPrompt(npc, "Mariana", "hi Marigold", true, {}).system).toContain("They said it to you");
    const p = reactPrompt(npc, "Mariana", "who sells seeds?", false, { knowledge: "Pip sells seeds.", note: "Buys bread daily.", gossip: ["Mariana caught a trout."], before: { name: "Hollis", text: "Ask Pip." } });
    expect(p.system).toContain("Pip sells seeds.");
    expect(p.system).toContain("Buys bread daily.");
    expect(p.user).toContain('Hollis just answered: "Ask Pip."');
  });
  it("cleans the answer: spoken words only, short; SKIP lets it pass", () => {
    expect(cleanReply("SKIP", false)).toBeNull();
    expect(cleanReply("skip.", false)).toBeNull();
    expect(cleanReply('"Morning, love! *waves* Bread\'s fresh."', true)).toBe("Morning, love! Bread's fresh.");
    expect(cleanReply("<think>hm</think>Hi!", false)).toBe("Hi!");
    expect(cleanReply("word ".repeat(40), true)!.endsWith("…")).toBe(true);
    expect(cleanReply(null, true)).toBeNull();
  });
});

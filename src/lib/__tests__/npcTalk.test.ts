// NPCs talking to each other: who meets whom and how often, what's watched,
// visits, which events become gossip and who hears it, how they get on,
// the conversation prompt, and checking what the LLM wrote.
import { describe, expect, it } from "vitest";
import {
  MAX_LINES, MEET_PX, NPC_COOLDOWN_MS, PAIR_COOLDOWN_MS, RUMOUR_TTL_MS, VISIT_PX, WATCH_PX, WITNESS_PX,
  clampAffinity, findPairs, isGossip, pairKey, parseTalk, relationText, rumoursToTell, startingAffinity, talkGist, talkPrompt, visitTarget, watched, witnesses,
} from "@/lib/npcTalk";
import { buildSystemPrompt } from "@/lib/npcPrompt";
import type { Rumour, TalkCooldowns, TalkNpc, TalkSide } from "@/types/npcTalk";
import type { BrainInput } from "@/types/agent";

const NOW = 1_000_000_000;
const npc = (id: number, x: number, y = 0, busy = false): TalkNpc => ({ id, key: `k${id}`, name: `N${id}`, x, y, busy });
const none: TalkCooldowns = { npc: new Map(), pair: new Map() };

describe("meetings", () => {
  it("pairs NPCs within a few tiles, nearest first, each in one pair", () => {
    const pairs = findPairs([npc(1, 0), npc(2, MEET_PX - 1), npc(3, MEET_PX * 10), npc(4, MEET_PX * 10 + 8)], none, NOW);
    expect(pairs.map((p) => [p.a.id, p.b.id])).toEqual([[3, 4], [1, 2]]);
    expect(findPairs([npc(1, 0), npc(2, MEET_PX + 1)], none, NOW)).toEqual([]);
    expect(findPairs([npc(1, 0), npc(2, 4), npc(3, 8)], none, NOW)).toHaveLength(1); // 3 NPCs: one pair
  });
  it("leaves out the busy, and keeps the cooldowns per pair and per NPC", () => {
    expect(findPairs([npc(1, 0, 0, true), npc(2, 4)], none, NOW)).toEqual([]);
    const justTalked: TalkCooldowns = { npc: new Map([[1, NOW - 1000]]), pair: new Map() };
    expect(findPairs([npc(1, 0), npc(2, 4)], justTalked, NOW)).toEqual([]);
    expect(findPairs([npc(1, 0), npc(2, 4)], { npc: new Map([[1, NOW - NPC_COOLDOWN_MS]]), pair: new Map() }, NOW)).toHaveLength(1);
    const pair: TalkCooldowns = { npc: new Map(), pair: new Map([[pairKey(1, 2), NOW - PAIR_COOLDOWN_MS + 1]]) };
    expect(findPairs([npc(1, 0), npc(2, 4)], pair, NOW)).toEqual([]);
    expect(pairKey(2, 1)).toBe(pairKey(1, 2));
  });
  it("talks only where a player can see", () => {
    expect(watched(0, 0, [{ x: WATCH_PX - 1, y: 0 }])).toBe(true);
    expect(watched(0, 0, [{ x: WATCH_PX + 1, y: 0 }])).toBe(false);
    expect(watched(0, 0, [])).toBe(false);
  });
  it("visits a friend first, else the nearest, within reach", () => {
    const me = npc(1, 0), near = npc(2, 40), friend = npc(3, 200), far = npc(4, VISIT_PX + 1);
    const aff = (a: number, b: number) => (pairKey(a, b) === pairKey(1, 3) ? 5 : 0);
    expect(visitTarget(me, [me, near, friend, far], aff, none, NOW)?.id).toBe(3);
    expect(visitTarget(me, [me, near, far], () => 0, none, NOW)?.id).toBe(2);
    expect(visitTarget(me, [me, far], () => 0, none, NOW)).toBeNull();
  });
});

describe("gossip", () => {
  const ev = (kind: string, text: string, subjectType: string | null = "character") => ({ id: 1, kind, text, subjectType, subjectId: 7, x: 0, y: 0 });
  it("notable things players do become rumours; the rest doesn't", () => {
    expect(isGossip(ev("boss_defeated", "Mariana slew the Sand Wyrm!"))).toBe(true);
    expect(isGossip(ev("catch", "Mariana caught a golden trout!"))).toBe(true);
    expect(isGossip(ev("weather", "Rain", null))).toBe(false);
    expect(isGossip(ev("talk", "Rowan and Hollis talked", "npc"))).toBe(false);
    expect(isGossip(ev("level", "Mariana reached level 10!"))).toBe(true);
    expect(isGossip(ev("level", "Mariana reached level 3!"))).toBe(false);
  });
  it("is heard first by the NPCs who were near", () => {
    const people = [npc(1, 0), npc(2, WITNESS_PX - 1), npc(3, WITNESS_PX + 1)];
    expect(witnesses({ x: 0, y: 0 }, people)).toEqual([1, 2]);
    expect(witnesses({ x: null, y: null }, people)).toEqual([]);
  });
  it("passes on what the other hasn't heard, freshest first, until it fades", () => {
    const r = (id: number, ago: number): Rumour => ({ id, text: `r${id}`, aboutCharacterId: null, at: NOW - ago });
    const heard = [r(1, 1000), r(2, 500), r(3, RUMOUR_TTL_MS + 1), r(4, 100)];
    expect(rumoursToTell(heard, new Set([4]), NOW).map((x) => x.id)).toEqual([2, 1]);
    expect(rumoursToTell(heard, new Set([1, 2, 4]), NOW)).toEqual([]);
  });
});

describe("how they get on", () => {
  it("stays within −10…10, and starts from what they think of each other", () => {
    expect(clampAffinity(14)).toBe(10);
    expect(clampAffinity(-11.6)).toBe(-10);
    // Hollis's opinions name Marigold ("she's his best customer"); Greta's name Hollis's mill.
    expect(startingAffinity("village_hollis", "Hollis", "village_marigold", "Marigold")).toBeGreaterThan(0);
    expect(startingAffinity("village_pip", "Pip", "hollowmere_sorrel", "Old Sorrel")).toBe(0);
  });
  it("says it in words for the prompt", () => {
    expect(relationText("A", "B", { affinity: 7, note: "", talks: 0 })).toMatch(/close friends.*haven't had a proper chat/);
    expect(relationText("A", "B", { affinity: -3, note: "the burnt loaves", talks: 4 })).toMatch(/prickly.*4 times.*burnt loaves/);
  });
});

describe("the conversation", () => {
  const side = (name: string, rumours: Rumour[] = []): TalkSide => ({ key: `village_${name.toLowerCase()}`, name, role: "Villager", persona: `${name} lives here.`, mood: "calm", doing: "working", rumours });
  it("the prompt has both voices, how they get on, and the news they could pass on", () => {
    const p = talkPrompt(side("Rowan", [{ id: 9, text: "Mariana caught a golden trout", aboutCharacterId: 1, at: NOW }]), side("Hollis"), { affinity: 3, note: "", talks: 2 }, { place: "in the grove", hour: 9, weather: "rain" });
    expect(p.system).toContain("You are Rowan");
    expect(p.system).toContain("You are Hollis");
    expect(p.system).toContain("[9] Mariana caught a golden trout");
    expect(p.system).toMatch(/JSON only/);
    expect(p.user).toMatch(/in the grove.*9:00.*rain.*friendly.*2 times/);
  });
  it("takes alternating spoken lines, trims long ones, keeps only offered news", () => {
    const raw = `<think>hmm</think>{"lines":[{"who":"A","text":"Morning! *waves* Wheat's coming in gold."},{"who":"B","text":"${"word ".repeat(40)}"},{"who":"C","text":"no"},{"who":"A","text":"Heard Mariana caught a golden trout."},{"who":"B","text":"Did she now!"}],"told":[9,99],"relation":{"delta":3,"note":"old friends"}}`;
    const r = parseTalk(raw, new Set([9]))!;
    expect(r.lines.map((l) => l.who)).toEqual(["A", "B", "A", "B"]);
    expect(r.lines[0].text).toBe("Morning! Wheat's coming in gold."); // the *gesture* is dropped
    expect(r.lines[1].text.endsWith("…")).toBe(true);
    expect(r.told).toEqual([9]);
    expect(r.relation).toEqual({ delta: 1, note: "old friends" });
    expect(parseTalk("not json", new Set())).toBeNull();
    // cut off mid-reply: the whole lines are kept, if it's still a back-and-forth
    const cut = parseTalk('{"lines":[{"who":"A","text":"Morning, Hollis!"},{"who":"B","text":"Good \\"haul\\"."},{"who":"A","text":"Twelve sheaves."},{"who":"B","text":"Fine work."},{"who":"A","text":"I got thr', new Set())!;
    expect(cut.lines.map((l) => l.text)).toEqual(["Morning, Hollis!", 'Good "haul".', "Twelve sheaves.", "Fine work."]);
    expect(parseTalk('{"lines":[{"who":"A","text":"Morning, Hollis!"},{"who":"B","text":"Morning."},{"who":"A","text":"I got thr', new Set())).toBeNull(); // too short to be a talk
    expect(parseTalk('{"lines":[{"who":"A","text":"hi"},{"who":"A","text":"me again"}]}', new Set())).toBeNull(); // not a conversation
    // each speaks at least twice; two lines in a row by one speaker are one turn
    expect(parseTalk('{"lines":[{"who":"A","text":"Hi."},{"who":"B","text":"Hello."},{"who":"A","text":"Bye."}]}', new Set())).toBeNull();
    const folded = parseTalk('{"lines":[{"who":"A","text":"Hi."},{"who":"A","text":"Busy day?"},{"who":"B","text":"Very."},{"who":"A","text":"Same."},{"who":"B","text":"Ha."}]}', new Set())!;
    expect(folded.lines).toEqual([{ who: "A", text: "Hi. Busy day?" }, { who: "B", text: "Very." }, { who: "A", text: "Same." }, { who: "B", text: "Ha." }]);
    const many = parseTalk(JSON.stringify({ lines: Array.from({ length: 12 }, (_, i) => ({ who: i % 2 ? "B" : "A", text: `line ${i}` })) }), new Set())!;
    expect(many.lines).toHaveLength(MAX_LINES);
  });
  it("sums it up in a line for the world log", () => {
    expect(talkGist("Rowan", "Hollis", { lines: [{ who: "A", text: "Fine morning for it." }], told: [], relation: { delta: 0, note: "" } })).toBe('Rowan and Hollis stopped for a chat: "Fine morning for it."');
  });
});

describe("gossip reaches players", () => {
  it("the talk prompt lists what they've heard", () => {
    const base = { npc: { key: "village_marigold", name: "Marigold", role: "Baker", persona: "A baker.", mood: "warm" }, sponsor: null, character: { name: "M", level: 1 }, message: "hi", history: [], offers: [], hour: 9, weather: "clear" } as unknown as BrainInput;
    expect(buildSystemPrompt({ ...base, gossip: ["Mariana caught a golden trout!"] })).toContain("GOSSIP YOU'VE HEARD");
    expect(buildSystemPrompt({ ...base, gossip: ["Mariana caught a golden trout!"] })).toContain("- Mariana caught a golden trout!");
    expect(buildSystemPrompt(base)).not.toContain("GOSSIP YOU'VE HEARD");
  });
});

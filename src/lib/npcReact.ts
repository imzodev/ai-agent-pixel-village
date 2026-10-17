// NPCs answering what a player says out loud (the world chat), the pure
// part (the server: src/lib/npcReactServer.ts). Called by name, an NPC
// answers (up to REACT_NAMED_PX away); otherwise the nearest one within
// REACT_PX may answer or let it pass, and now and then a second one chimes in.

import { npcVoice, TALK_RULES } from "./npcPrompt";
import type { ReactCandidate, ReactPlan } from "@/types/npcTalk";

const T = 16;
/** NPCs this close hear what a player says. */
export const REACT_PX = 8 * T;
/** An NPC called by name hears it from this far. */
export const REACT_NAMED_PX = 16 * T;
/** Each NPC answers chat at most this often. */
export const REACT_NPC_COOLDOWN_MS = 12_000;
/** Chance that a second NPC nearby chimes in (when nobody was named). */
export const SECOND_CHANCE = 0.35;
/** What an NPC says to let a line pass. */
export const SKIP = "SKIP";

/** Is this NPC's name in what was said (as a word)? */
export function namedIn(text: string, name: string): boolean {
  const first = name.split(/\s+/).find((w) => !/^(old|young|the)$/i.test(w)) ?? name;
  return new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
}

/**
 * Who answers: everyone named (nearest first, at most 2), else the nearest
 * in earshot and, with `roll` < SECOND_CHANCE, the next one too. NPCs that
 * answered too recently are left out.
 */
export function planReplies(text: string, near: readonly ReactCandidate[], lastReply: ReadonlyMap<number, number>, now: number, roll: number): ReactPlan {
  const ready = near.filter((n) => now - (lastReply.get(n.id) ?? 0) >= REACT_NPC_COOLDOWN_MS).sort((a, b) => a.dist - b.dist);
  const named = ready.filter((n) => n.dist <= REACT_NAMED_PX && namedIn(text, n.name)).slice(0, 2);
  if (named.length) return named.map((npc) => ({ npc, addressed: true }));
  const inEar = ready.filter((n) => n.dist <= REACT_PX);
  return inEar.slice(0, roll < SECOND_CHANCE ? 2 : 1).map((npc) => ({ npc, addressed: false }));
}

/** The prompt for one NPC's answer. `before` = what another NPC already answered, if anyone. */
export function reactPrompt(
  npc: { key: string; name: string; role: string; persona: string; mood: string },
  player: string, said: string, addressed: boolean,
  extra: { knowledge?: string; note?: string; gossip?: string[]; before?: { name: string; text: string } | null },
): { system: string; user: string } {
  const system = `${npcVoice(npc)}

You're out and about when ${player}, someone nearby, says something out loud.${extra.note ? `\nWhat you remember about ${player}: ${extra.note}` : ""}${extra.gossip?.length ? `\nGossip you've heard: ${extra.gossip.join(" ")}` : ""}${extra.knowledge ? `\nWHAT YOU KNOW (the truth about the world; never invent anything beyond it):\n${extra.knowledge}` : ""}

HOW TO TALK:
${TALK_RULES}
- One or two short sentences, at most 25 words, said out loud to ${player}.
- Only what's true: mention only goods, people and places in WHAT YOU KNOW (what you make and sell is there), never others. Don't promise anything: no free gifts, discounts, deals or prices beyond WHAT YOU KNOW.
${addressed ? `- They said it to you: answer them.` : `- It may not be meant for you. If you'd naturally react (a greeting, a question you can answer, something about your work or your neighbours, something funny or odd), answer. If you'd just let it pass, reply with exactly ${SKIP}.`}`;
  const user = `${player} says: "${said}"${extra.before ? `\n${extra.before.name} just answered: "${extra.before.text}"` : ""}`;
  return { system, user };
}

/** Clean an NPC's answer: spoken words only, short; null to let it pass. */
export function cleanReply(raw: string | null | undefined, addressed: boolean): string | null {
  if (!raw) return null;
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/\*[^*]*\*/g, "").replace(/\s+/g, " ").replace(/^["'\s]+|["'\s]+$/g, "").trim();
  if (!text || (!addressed && /^skip\b/i.test(text))) return null;
  if (/^skip\b/i.test(text)) return null;
  const words = text.split(" ");
  return words.length > 32 ? `${words.slice(0, 30).join(" ")}…` : text;
}

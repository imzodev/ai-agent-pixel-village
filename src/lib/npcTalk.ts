// NPCs talking to each other, the pure part (the server is
// src/lib/npcTalkServer.ts): who meets whom, how often, which world events
// become gossip, the conversation prompt, and checking what the LLM wrote.

import { npcVoice, TALK_RULES } from "./npcPrompt";
import { personalityFor } from "./npcPersonalities";
import type { GossipEvent, Rumour, TalkCooldowns, TalkLine, TalkNpc, TalkPair, TalkRelation, TalkResult, TalkSide } from "@/types/npcTalk";

const T = 16;
const env = (k: string, d: number) => { const n = Number(process.env[k]); return Number.isFinite(n) && n >= 0 ? n : d; };

/** Two NPCs this close (px) can talk. */
export const MEET_PX = 5 * T;
/** A player this close (px) to the pair is watching (about a screen). */
export const WATCH_PX = 22 * T;
/** How far an NPC walks over to visit a neighbour (px). */
export const VISIT_PX = 25 * T;
/** The same pair talks at most this often; each NPC at most this often. */
export const PAIR_COOLDOWN_MS = env("NPC_TALK_PAIR_MS", 3 * 60_000);
export const NPC_COOLDOWN_MS = env("NPC_TALK_NPC_MS", 60_000);
/** Conversations a day, at most (watched ones: each is one LLM call). */
export const TALKS_DAILY_MAX = env("NPC_TALKS_DAILY_MAX", 600);
/** Lines in a conversation (each NPC speaks at least MIN_TURNS times, taking turns), and how far apart they're said. */
export const MIN_LINES = 4, MAX_LINES = 6, MIN_TURNS = 2, LINE_GAP_MS = 3500;
/** Most words in a line. */
export const MAX_WORDS = 22;
/** Rumours fade after this. */
export const RUMOUR_TTL_MS = 2 * 24 * 3600_000;
/** NPCs this close to where something happened saw it. */
export const WITNESS_PX = 20 * T;

export const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** Can this NPC talk now (not busy, not too soon after its last talk)? */
export function free(n: TalkNpc, cd: TalkCooldowns, now: number): boolean {
  return !n.busy && now - (cd.npc.get(n.id) ?? 0) >= NPC_COOLDOWN_MS;
}

/**
 * Pairs that could talk now, nearest first: within MEET_PX, both free, the
 * pair not too soon after its last talk. Each NPC is in at most one pair.
 */
export function findPairs(npcs: readonly TalkNpc[], cd: TalkCooldowns, now: number): TalkPair[] {
  const cands: TalkPair[] = [];
  const ok = npcs.filter((n) => free(n, cd, now));
  for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) {
    const [a, b] = ok[i].id < ok[j].id ? [ok[i], ok[j]] : [ok[j], ok[i]];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (dist > MEET_PX) continue;
    if (now - (cd.pair.get(pairKey(a.id, b.id)) ?? 0) < PAIR_COOLDOWN_MS) continue;
    cands.push({ a, b, dist });
  }
  cands.sort((p, q) => p.dist - q.dist);
  const used = new Set<number>(), out: TalkPair[] = [];
  for (const p of cands) {
    if (used.has(p.a.id) || used.has(p.b.id)) continue;
    used.add(p.a.id); used.add(p.b.id);
    out.push(p);
  }
  return out;
}

/** Is a player near enough to see a pair (or an NPC) at (x, y)? */
export const watched = (x: number, y: number, players: readonly { x: number; y: number }[]): boolean =>
  players.some((p) => Math.hypot(p.x - x, p.y - y) <= WATCH_PX);

/**
 * Who to visit, for an NPC near a watching player with nobody close: the
 * free neighbour within VISIT_PX it gets on with best (then the nearest).
 */
export function visitTarget(n: TalkNpc, npcs: readonly TalkNpc[], affinity: (a: number, b: number) => number, cd: TalkCooldowns, now: number): TalkNpc | null {
  const near = npcs.filter((o) => o.id !== n.id && free(o, cd, now) && Math.hypot(o.x - n.x, o.y - n.y) <= VISIT_PX
    && now - (cd.pair.get(pairKey(n.id, o.id)) ?? 0) >= PAIR_COOLDOWN_MS);
  near.sort((a, b) => affinity(n.id, b.id) - affinity(n.id, a.id) || Math.hypot(a.x - n.x, a.y - n.y) - Math.hypot(b.x - n.x, b.y - n.y));
  return near[0] ?? null;
}

// ── Gossip ────────────────────────────────────────────────────────────────

/** World events worth talking about: about a player, of a kind people notice. */
const NOTABLE = new Set(["boss_defeated", "boss", "catch", "home", "lots", "bounty", "commission", "mission", "pet", "level", "arrival", "lead", "trade", "job"]);
export function isGossip(e: GossipEvent): boolean {
  if (e.subjectType !== "character" || !NOTABLE.has(e.kind)) return false;
  if (e.kind === "level") { const m = /level (\d+)/i.exec(e.text); return !!m && Number(m[1]) >= 10 && Number(m[1]) % 5 === 0; }
  return true;
}

/** Who saw it happen: NPCs within WITNESS_PX of where it did (none when it has no place). */
export function witnesses(e: Pick<GossipEvent, "x" | "y">, npcs: readonly { id: number; x: number; y: number }[]): number[] {
  if (e.x == null || e.y == null) return [];
  return npcs.filter((n) => Math.hypot(n.x - e.x!, n.y - e.y!) <= WITNESS_PX).map((n) => n.id);
}

/** What `from` can tell `to`: rumours it has heard and `to` hasn't, still fresh, newest first. */
export function rumoursToTell(fromHeard: readonly Rumour[], toHeard: ReadonlySet<number>, now: number, max = 2): Rumour[] {
  return fromHeard.filter((r) => !toHeard.has(r.id) && now - r.at < RUMOUR_TTL_MS).sort((a, b) => b.at - a.at).slice(0, max);
}

// ── Relationships ─────────────────────────────────────────────────────────

export const clampAffinity = (n: number) => Math.max(-10, Math.min(10, Math.round(n)));

/** How two NPCs start out: warm when one speaks well of the other in their opinions, cool when badly, else neutral. */
export function startingAffinity(aKey: string, aName: string, bKey: string, bName: string): number {
  const said = (key: string, of: string) => {
    const o = personalityFor(key).opinions ?? "";
    if (!o.includes(of)) return 0;
    return /worr|nuisance|wary|can't stand|annoy|rival|grumbl/i.test(o) ? -2 : 2;
  };
  return clampAffinity(said(aKey, bName) + said(bKey, aName));
}

/** How they get on, in words, for the prompt. */
export function relationText(aName: string, bName: string, r: TalkRelation): string {
  const feel = r.affinity >= 6 ? "close friends" : r.affinity >= 2 ? "friendly" : r.affinity <= -6 ? "they really don't get along" : r.affinity <= -2 ? "a bit prickly with each other" : "on easy, ordinary terms";
  const past = r.talks === 0 ? "They haven't had a proper chat before." : `They've talked ${r.talks} time${r.talks === 1 ? "" : "s"}.${r.note ? ` Between them: ${r.note}` : ""}`;
  return `${aName} and ${bName} are ${feel}. ${past}`;
}

// ── The conversation ──────────────────────────────────────────────────────

/** The prompt for one conversation: both people, where they are, how they get on, what they might pass on. */
export function talkPrompt(a: TalkSide, b: TalkSide, rel: TalkRelation, setting: { place: string; hour: number; weather: string }): { system: string; user: string } {
  const side = (s: TalkSide, tag: "A" | "B") => `### ${tag}: ${s.name}\n${npcVoice(s)}\nRight now: ${s.doing}.${s.rumours.length ? `\nNews ${s.name} could pass on (true, heard around): ${s.rumours.map((r) => `[${r.id}] ${r.text}`).join(" ")}` : ""}`;
  const system = `You write a short, natural conversation between two neighbours in a small world who just ran into each other. They are real people with their own lives, not characters in a fantasy game.

${side(a, "A")}

${side(b, "B")}

HOW THEY TALK:
${TALK_RULES}
- A real back-and-forth: ${MIN_LINES} to ${MAX_LINES} lines, strictly taking turns (A, B, A, B…), so each of them speaks at least ${MIN_TURNS} times. Each line answers or follows on from the one before. Each at most ${MAX_WORDS - 4} words.
- Talk about what's really going on: their work, what they're doing, each other, the weather, and any news they could pass on. Pass news on in their own words, as gossip.
- Never invent places, people, items or events that aren't above.

Answer with JSON only:
{"lines":[{"who":"A","text":"..."},{"who":"B","text":"..."}],"told":[ids of the news actually passed on],"relation":{"delta":-1|0|1,"note":"what's between them now, under 20 words"}}`;
  const user = `They meet ${setting.place}. It's ${Math.floor(setting.hour)}:00 and the weather is ${setting.weather}. ${relationText(a.name, b.name, rel)}`;
  return { system, user };
}

/** Check what the LLM wrote: alternating, short, spoken lines; only news that was offered. Null when unusable. */
export function parseTalk(raw: string, offered: ReadonlySet<number>): TalkResult | null {
  const body = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const json = body.match(/\{[\s\S]*\}/)?.[0];
  let o: { lines?: unknown; told?: unknown; relation?: { delta?: unknown; note?: unknown } };
  try { o = JSON.parse(json ?? ""); } catch {
    // Cut off mid-reply (out of tokens): keep the lines that came through whole.
    const whole = [...body.matchAll(/\{\s*"who"\s*:\s*"([AB])"\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g)];
    if (!whole.length) return null;
    o = { lines: whole.map((m) => ({ who: m[1], text: JSON.parse(`"${m[2]}"`) as string })) };
  }
  if (!Array.isArray(o.lines)) return null;
  const lines: TalkLine[] = [];
  for (const l of o.lines as { who?: unknown; text?: unknown }[]) {
    if ((l?.who !== "A" && l?.who !== "B") || typeof l.text !== "string") continue;
    const text = l.text.replace(/\*[^*]*\*/g, "").replace(/\s+/g, " ").replace(/^["'\s]+|["'\s]+$/g, "").trim();
    if (!text) continue;
    const words = text.split(/\s+/);
    lines.push({ who: l.who, text: words.length > MAX_WORDS ? `${words.slice(0, MAX_WORDS).join(" ")}…` : text });
    if (lines.length >= MAX_LINES) break;
  }
  // A real back-and-forth: taking turns (a run by the same speaker is folded into one line), each speaking at least MIN_TURNS times.
  const turns: TalkLine[] = [];
  for (const l of lines) {
    const last = turns[turns.length - 1];
    if (last && last.who === l.who) last.text = `${last.text} ${l.text}`;
    else turns.push({ ...l });
  }
  lines.splice(0, lines.length, ...turns.slice(0, MAX_LINES));
  if (lines.filter((l) => l.who === "A").length < MIN_TURNS || lines.filter((l) => l.who === "B").length < MIN_TURNS) return null;
  const told = Array.isArray(o.told) ? (o.told as unknown[]).map(Number).filter((n) => offered.has(n)) : [];
  const d = Number(o.relation?.delta);
  const delta = (d > 0 ? 1 : d < 0 ? -1 : 0) as -1 | 0 | 1;
  const note = typeof o.relation?.note === "string" ? o.relation.note.slice(0, 160) : "";
  return { lines, told, relation: { delta, note } };
}

/** A one-line gist of a conversation, for the world log and their memories. */
export function talkGist(aName: string, bName: string, r: TalkResult): string {
  const first = r.lines[0]?.text ?? "";
  return `${aName} and ${bName} stopped for a chat${first ? `: "${first.length > 60 ? `${first.slice(0, 57)}…` : first}"` : "."}`;
}

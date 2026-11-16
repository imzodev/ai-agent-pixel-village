// Storylines, server side: start a hand-written story or have the AI write
// one from the player's line about their hero, count what the player does
// toward the current chapter (called from the routes beside tutorialEvent),
// pay chapters out, and tell the chapter's NPC their part.
//
// The AI only writes words and picks keys from the catalog; rewards come
// from rules.ts and every key is checked (parse.ts). If the AI can't write a
// story (no key, an error, a reply that didn't check out), the closest
// hand-written one starts instead and the player is told.

import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { characterStories, characters } from "@/db/schema";
import { chatWithFallback, type ChatMessage } from "@/lib/llm";
import { addCoins, countItem, logEvent, recalcLevel, removeItem } from "@/lib/game";
import { cleanPlayerChat } from "@/lib/moderation";
import { createMoment } from "@/lib/momentsServer";
import { storyDoneMoment, storyStartMoment } from "@/lib/moments";
import { TUTORIAL_STEPS } from "@/lib/tutorial";
import { track } from "@/lib/track";
import { earnTraitFromStory, hasTrait, traitsOf } from "@/lib/traitsServer";
import { STORYTELLER_XP_MULT, heroLine } from "@/lib/traits";
import { storyCatalog } from "./catalog";
import { parseStory } from "./parse";
import { STORY_RETRY, storySystemPrompt, storyUserPrompt } from "./prompt";
import { STORY_PROMPT_MAX, STORY_STARTS_DAILY, chapterMatches, withRewards } from "./rules";
import { STORY_TEMPLATES, closestTemplate, storyTemplate } from "./templates";
import { chapterNames, storyNote, storyViewOf } from "./view";
import type { StoryDid, StoryDraft, StoryRecord, StoryResult as Result, StorySource, StoryState, StoryView } from "@/types/story";

/** Characters whose story the AI is writing right now (one at a time each). */
const writing = new Set<number>();

const dayStart = (now = Date.now()) => new Date(Math.floor(now / 86_400_000) * 86_400_000);

async function activeRow(characterId: number) {
  const [r] = await db.select().from(characterStories).where(and(eq(characterStories.characterId, characterId), eq(characterStories.status, "active"))).limit(1);
  return r ?? null;
}

async function startsToday(characterId: number): Promise<number> {
  const [r] = await db.select({ n: count() }).from(characterStories).where(and(eq(characterStories.characterId, characterId), gte(characterStories.createdAt, dayStart())));
  return Number(r?.n ?? 0);
}

/** Why this character can't start a story now, or null. */
async function cannotStart(characterId: number): Promise<string | null> {
  if (await activeRow(characterId)) return "Finish your current story first, or set it aside.";
  if ((await startsToday(characterId)) >= STORY_STARTS_DAILY) return `That's ${STORY_STARTS_DAILY} new stories today. Come back tomorrow for another.`;
  return null;
}

/** Keys of the hand-written stories this character has finished (each is told once). */
async function templatesDone(characterId: number): Promise<Set<string>> {
  const rows = await db.select({ key: characterStories.templateKey }).from(characterStories)
    .where(and(eq(characterStories.characterId, characterId), eq(characterStories.source, "template"), eq(characterStories.status, "done")));
  return new Set(rows.flatMap((r) => (r.key ? [r.key] : [])));
}

/** Start a story (the one-active rule is the database's: a second insert does nothing). */
async function insertStory(characterId: number, draft: StoryDraft, source: StorySource, extra: { templateKey?: string; prompt?: string; sequelOf?: number }) {
  const [c] = await db.select({ level: characters.level }).from(characters).where(eq(characters.id, characterId));
  const [row] = await db.insert(characterStories).values({
    characterId, source, templateKey: extra.templateKey ?? null, prompt: extra.prompt ?? null, sequelOf: extra.sequelOf ?? null,
    title: draft.title, premise: draft.premise, ending: draft.ending, heroTitle: draft.heroTitle,
    chapters: withRewards(draft.chapters, c?.level ?? 1),
  }).onConflictDoNothing().returning();
  return row ?? null;
}

/** Start one of the hand-written stories. */
export async function startTemplate(characterId: number, key: string): Promise<Result> {
  const t = storyTemplate(key);
  if (!t) return { ok: false, error: "No such story." };
  const why = await cannotStart(characterId);
  if (why) return { ok: false, error: why };
  if ((await templatesDone(characterId)).has(key)) return { ok: false, error: "You've already lived that story." };
  const row = await insertStory(characterId, t, "template", { templateKey: key });
  if (!row) return { ok: false, error: "Finish your current story first, or set it aside." };
  track("story_start", characterId, { source: "template", key });
  return { ok: true, message: `📜 A new story begins: "${t.title}".`, view: storyViewOf(row) };
}

/** Ask the AI for a story; null when it can't write one we can use. */
async function aiDraft(characterId: number, about: string, prevId?: number): Promise<StoryDraft | null> {
  const [c] = await db.select({ name: characters.name, level: characters.level }).from(characters).where(eq(characters.id, characterId));
  if (!c) return null;
  const prev = prevId != null
    ? (await db.select().from(characterStories).where(and(eq(characterStories.id, prevId), eq(characterStories.characterId, characterId))))[0]
    : undefined;
  const cat = storyCatalog(c.level);
  // Who they are (origin, traits) shapes the story too.
  const traits = heroLine(c.name, await traitsOf(characterId)) ?? undefined;
  const messages: ChatMessage[] = [
    { role: "system", content: storySystemPrompt(cat) },
    { role: "user", content: storyUserPrompt({ name: c.name, level: c.level, about, traits }, prev ? { title: prev.title, premise: prev.premise, ending: prev.ending } : undefined) },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await chatWithFallback(messages, { jsonMode: true, temperature: 0.8, maxTokens: 1600, timeoutMs: 30_000 }).catch(() => null);
    if (!res) return null; // no provider, out of budget, or down: don't ask again
    const draft = parseStory(res.text, cat);
    if (draft) return draft;
    messages.push({ role: "assistant", content: res.text.slice(0, 4000) }, { role: "user", content: STORY_RETRY });
  }
  return null;
}

/**
 * Have the AI write a story from the player's line about their hero (or a
 * sequel to a story they finished). Falls back to the closest hand-written
 * story when it can't.
 */
export async function writeStory(characterId: number, rawAbout: string, sequelOf?: number): Promise<Result> {
  const about = cleanPlayerChat(rawAbout, STORY_PROMPT_MAX);
  if (about.length < 3 && sequelOf == null) return { ok: false, error: "Tell us a little about your hero first." };
  if (writing.has(characterId)) return { ok: false, error: "Your story is still being written…" };
  const why = await cannotStart(characterId);
  if (why) return { ok: false, error: why };
  if (sequelOf != null) {
    if (!Number.isInteger(sequelOf)) return { ok: false, error: "Which story comes next?" };
    const [prev] = await db.select({ id: characterStories.id }).from(characterStories)
      .where(and(eq(characterStories.id, sequelOf), eq(characterStories.characterId, characterId), eq(characterStories.status, "done")));
    if (!prev) return { ok: false, error: "Finish a story before writing what comes next." };
  }
  writing.add(characterId);
  try {
    const draft = await aiDraft(characterId, about || "the hero of their last story", sequelOf);
    if (draft) {
      const row = await insertStory(characterId, draft, "ai", { prompt: about || undefined, sequelOf });
      if (!row) return { ok: false, error: "Finish your current story first, or set it aside." };
      track("story_start", characterId, { source: "ai", sequel: sequelOf != null });
      // The hook worth sharing: the village wrote this from one line.
      await createMoment(characterId, "story", storyStartMoment(draft.title, draft.premise), `story_start:${row.id}`);
      return { ok: true, message: `📜 The village has written your story: "${draft.title}".`, view: storyViewOf(row) };
    }
    // The storyteller is busy: the hand-written story closest to their line, if they haven't lived it.
    const done = await templatesDone(characterId);
    const t = [closestTemplate(about), ...STORY_TEMPLATES].find((x) => !done.has(x.key));
    if (!t) return { ok: false, error: "The storyteller is busy right now. Try again in a little while." };
    const row = await insertStory(characterId, t, "template", { templateKey: t.key, prompt: about || undefined });
    if (!row) return { ok: false, error: "Finish your current story first, or set it aside." };
    track("story_start", characterId, { source: "fallback", key: t.key });
    return { ok: true, message: `📜 The storyteller was busy, so here's a tale that fits: "${t.title}".`, view: storyViewOf(row) };
  } finally {
    writing.delete(characterId);
  }
}

/** Play now's hero line: write the story in the background, ready when the tutorial ends. */
export function writeStoryLater(characterId: number, about: string): void {
  if (!about.trim()) return;
  void writeStory(characterId, about).catch((e) => console.warn("[story] background write failed:", e instanceof Error ? e.message : e));
}

/** Set the current story aside (it still counts toward today's starts). */
export async function abandonStory(characterId: number): Promise<Result> {
  const r = await db.update(characterStories).set({ status: "abandoned", finishedAt: new Date() })
    .where(and(eq(characterStories.characterId, characterId), eq(characterStories.status, "active"))).returning({ title: characterStories.title });
  if (!r.length) return { ok: false, error: "You have no story going." };
  return { ok: true, message: `You set "${r[0].title}" aside.`, view: null };
}

/**
 * Count something the player did toward their story's current chapter.
 * Returns a notice when a chapter completes (or a delivery is short), else
 * null. Cheap for everyone without a story: one indexed read. Quiet while
 * the tutorial is still running.
 */
export async function storyEvent(characterId: number, did: StoryDid, qty = 1): Promise<string | null> {
  const [r] = await db
    .select({ s: characterStories, name: characters.name, tutorial: characters.tutorialStep, title: characters.title, x: characters.x, y: characters.y })
    .from(characterStories).innerJoin(characters, eq(characters.id, characterStories.characterId))
    .where(and(eq(characterStories.characterId, characterId), eq(characterStories.status, "active"))).limit(1);
  if (!r || r.tutorial < TUTORIAL_STEPS.length) return null;
  const s = r.s, ch = s.chapters[s.step];
  if (!ch || !chapterMatches(ch, did)) return null;
  const guard = and(eq(characterStories.id, s.id), eq(characterStories.step, s.step), eq(characterStories.status, "active"));

  if (ch.event === "deliver") {
    const have = await countItem(characterId, ch.match.itemKey!);
    if (have < ch.qty) return `📜 ${chapterNames(ch).npc} is waiting for ${ch.qty} ${chapterNames(ch).item} (you have ${have}).`;
  } else if (s.progress + qty < ch.qty) {
    await db.update(characterStories).set({ progress: s.progress + qty }).where(guard);
    return null;
  }

  // The chapter is done (guarded on the step, so a double event pays once).
  const last = s.step + 1 >= s.chapters.length;
  const won = await db.update(characterStories)
    .set(last ? { step: s.step + 1, progress: 0, status: "done", finishedAt: new Date() } : { step: s.step + 1, progress: 0 })
    .where(guard).returning({ id: characterStories.id });
  if (!won.length) return null;
  if (ch.event === "deliver") await removeItem(characterId, ch.match.itemKey!, ch.qty);
  // Storytellers get more out of every chapter (src/lib/traits.ts).
  const xp = (await hasTrait(characterId, "storyteller")) ? Math.round(ch.reward.xp * STORYTELLER_XP_MULT) : ch.reward.xp;
  await addCoins(characterId, ch.reward.coins);
  await db.update(characters).set({ xp: sql`${characters.xp} + ${xp}`, ...(last && !r.title ? { title: s.heroTitle } : {}) }).where(eq(characters.id, characterId));
  await recalcLevel(characterId);
  track("story_chapter", characterId, { step: s.step + 1, of: s.chapters.length, source: s.source });
  const pay = `+${ch.reward.coins} 🪙 · +${xp} XP`;
  if (!last) return `📜 ${ch.title}: done! ${pay}`;
  track("story_done", characterId, { source: s.source, chapters: s.chapters.length });
  await logEvent("story", `${r.name} finished their story, "${s.title}", and is known now as ${s.heroTitle}.`, "character", characterId, r.x, r.y);
  await createMoment(characterId, "story", storyDoneMoment(s.title, s.heroTitle), `story_done:${s.id}`);
  // A story teaches a trait, from what it asked most (src/lib/traits.ts).
  const learned = await earnTraitFromStory(characterId, s.chapters.map((c) => c.event)).catch(() => null);
  return `🏁 "${s.title}" is complete! ${s.ending} ${pay} · the title "${s.heroTitle}"${learned ? ` · ${learned}` : ""}`;
}

/** The current story for /api/me (null when there's none). */
export async function storyViewFor(characterId: number): Promise<StoryView | null> {
  const r = await activeRow(characterId);
  return r ? storyViewOf(r) : null;
}

/** Everything the story window needs. */
export async function storyState(characterId: number): Promise<StoryState> {
  const [active, done, starts, [last]] = await Promise.all([
    activeRow(characterId),
    templatesDone(characterId),
    startsToday(characterId),
    db.select({ id: characterStories.id, title: characterStories.title }).from(characterStories)
      .where(and(eq(characterStories.characterId, characterId), eq(characterStories.status, "done"))).orderBy(desc(characterStories.finishedAt)).limit(1),
  ]);
  return {
    view: active ? storyViewOf(active) : null,
    picks: STORY_TEMPLATES.filter((t) => !done.has(t.key)).map((t) => ({ key: t.key, title: t.title, icon: t.icon, blurb: t.blurb, chapters: t.chapters.length })),
    startsLeft: Math.max(0, STORY_STARTS_DAILY - starts),
    lastDone: last ?? null,
    writing: writing.has(characterId),
  };
}

/**
 * What this NPC should know about the player's story: their part, while the
 * current chapter is theirs (for the talk prompt). Null otherwise.
 */
export async function storyNoteFor(npcKey: string, characterId: number, playerName: string): Promise<string | null> {
  const r = await activeRow(characterId);
  const ch = r?.chapters[r.step];
  if (!r || !ch || ch.match.npcKey !== npcKey || (ch.event !== "talk" && ch.event !== "deliver")) return null;
  const have = ch.event === "deliver" ? await countItem(characterId, ch.match.itemKey!) : undefined;
  return storyNote(playerName, r, ch, have);
}

/** Titles from finished stories (collectionServer's unlockedTitles). */
export async function storyTitles(characterId: number): Promise<string[]> {
  const rows = await db.selectDistinct({ t: characterStories.heroTitle }).from(characterStories)
    .where(and(eq(characterStories.characterId, characterId), eq(characterStories.status, "done")));
  return rows.map((r) => r.t);
}

/** Finished stories, newest first (the profile). */
export async function storyRecords(characterId: number, limit = 6): Promise<StoryRecord[]> {
  const rows = await db.select().from(characterStories)
    .where(and(eq(characterStories.characterId, characterId), eq(characterStories.status, "done")))
    .orderBy(desc(characterStories.finishedAt)).limit(limit);
  return rows.map((r) => ({ id: r.id, title: r.title, premise: r.premise, heroTitle: r.heroTitle, source: r.source, finishedAt: (r.finishedAt ?? r.createdAt).toISOString() }));
}

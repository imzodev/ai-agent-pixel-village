// Storylines, the rules: every number in one place, how a chapter's event
// matches what the player did, and what each chapter pays. Pure, shared by
// the server (storyServer.ts), the parser and the tests.
//
// Rewards are always computed here, never taken from the AI: a story pays by
// the work its chapters ask for (a talk pays little, a hunt more) and the
// hero's level, so writing "talk to Pip" six times is no shortcut.

import type { StoryChapter, StoryChapterDraft, StoryDid, StoryEventKind, StoryMatch, StoryReward } from "@/types/story";

/** A story has this many chapters (the AI's are clipped; fewer valid ones and it's refused). */
export const STORY_MIN_CHAPTERS = 4;
export const STORY_MAX_CHAPTERS = 7;
/** A hero line is at most this long. */
export const STORY_PROMPT_MAX = 200;
/** Stories a character may start a day (UTC), picked or written: keeps the AI bill and the rewards in check. */
export const STORY_STARTS_DAILY = 3;
/** At most this share of a story's chapters may be talks or visits (the rest is work). */
export const STORY_MAX_LIGHT_SHARE = 0.5;

/** Most a chapter may ask for, per event. */
export const QTY_MAX: Record<StoryEventKind, number> = { talk: 1, visit: 1, deliver: 10, collect: 20, defeat: 8, fish: 6, plant: 6, sell: 6 };

/** How much work one unit of each event is (rewards scale with it). */
const EFFORT: Record<StoryEventKind, number> = { talk: 1, visit: 1.5, deliver: 0.4, collect: 0.15, defeat: 0.6, fish: 0.6, plant: 0.4, sell: 0.4 };
/** A chapter's effort is at least this and at most this, whatever it asks. */
const EFFORT_MIN = 1;
const EFFORT_MAX = 3;
/** Coins and XP per unit of effort, by level. */
const COINS_PER_EFFORT = (level: number) => 12 + 3 * level;
const XP_PER_EFFORT = (level: number) => 18 + 5 * level;
/** The last chapter pays this much more. */
export const FINALE_MULT = 2;

/** Talks and visits: chapters with little to do. */
export const isLight = (e: StoryEventKind): boolean => e === "talk" || e === "visit";

/** How much a chapter is worth, in effort units. */
export function chapterEffort(ch: Pick<StoryChapterDraft, "event" | "qty">): number {
  const q = Math.max(1, Math.min(QTY_MAX[ch.event], ch.qty));
  return Math.max(EFFORT_MIN, Math.min(EFFORT_MAX, EFFORT[ch.event] * q));
}

/** What a chapter pays a hero of this level. */
export function chapterReward(ch: Pick<StoryChapterDraft, "event" | "qty">, level: number, last: boolean): StoryReward {
  const e = chapterEffort(ch), mult = last ? FINALE_MULT : 1;
  const lv = Math.max(1, Math.min(60, Math.floor(level)));
  return { coins: Math.round(e * COINS_PER_EFFORT(lv)) * mult, xp: Math.round(e * XP_PER_EFFORT(lv)) * mult };
}

/** The chapters with their rewards filled in for this level. */
export function withRewards(chapters: StoryChapterDraft[], level: number): StoryChapter[] {
  return chapters.map((c, i) => ({ ...c, reward: chapterReward(c, level, i === chapters.length - 1) }));
}

/**
 * Does it count toward this chapter? A `deliver` chapter is met by talking to
 * its NPC (the server then checks the bag); every other kind by its own event.
 */
export function chapterMatches(ch: { event: StoryEventKind; match: StoryMatch }, did: StoryDid): boolean {
  const m = ch.match;
  switch (ch.event) {
    case "talk": return did.kind === "talk" && did.npcKey === m.npcKey;
    case "deliver": return did.kind === "talk" && did.npcKey === m.npcKey;
    case "collect": return did.kind === "collect" && did.itemKey === m.itemKey;
    case "defeat": return did.kind === "defeat" && did.enemyKind === m.enemyKind;
    case "visit": return did.kind === "visit" && did.region === m.region;
    case "fish": return did.kind === "fish" && (!m.itemKey || did.itemKey === m.itemKey);
    case "plant": return did.kind === "plant";
    case "sell": return did.kind === "sell";
  }
}

/** Today's UTC day, for the daily limit ("2026-11-16"). */
export const storyDay = (now: number): string => new Date(now).toISOString().slice(0, 10);

/** A story's chapters are fine as they are: in range and not mostly talk. */
export function wellFormed(chapters: Pick<StoryChapterDraft, "event">[]): boolean {
  if (chapters.length < STORY_MIN_CHAPTERS || chapters.length > STORY_MAX_CHAPTERS) return false;
  return chapters.filter((c) => isLight(c.event)).length <= Math.floor(chapters.length * STORY_MAX_LIGHT_SHARE);
}

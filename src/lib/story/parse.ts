// The AI's story, checked: every chapter must name only what the catalog
// allows (catalog.ts), counts are clamped, text is cleaned and capped, and a
// story with too few good chapters (or mostly talk) is refused. Pure, like
// parseTalk (src/lib/npcTalk.ts).

import { cleanAgentText } from "@/lib/moderation";
import { QTY_MAX, STORY_MAX_CHAPTERS, wellFormed } from "./rules";
import type { StoryCatalog, StoryChapterDraft, StoryDraft, StoryEventKind } from "@/types/story";

const KINDS: readonly StoryEventKind[] = ["talk", "deliver", "collect", "defeat", "visit", "fish", "plant", "sell"];
const str = (v: unknown, max: number): string => (typeof v === "string" ? cleanAgentText(v, max) : "");

/** The first JSON object in the reply (after any thinking), or null. */
function firstObject(raw: string): Record<string, unknown> | null {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** One chapter, or null if it names anything outside the catalog. */
export function parseChapter(c: unknown, cat: StoryCatalog): StoryChapterDraft | null {
  if (!c || typeof c !== "object") return null;
  const o = c as Record<string, unknown>;
  const event = String(o.do ?? o.event ?? "") as StoryEventKind;
  if (!KINDS.includes(event)) return null;
  const has = (list: { key: string }[], k: unknown) => typeof k === "string" && list.some((x) => x.key === k);
  const title = str(o.title, 48), text = str(o.text, 220);
  if (!title || !text) return null;
  const qty = Math.max(1, Math.min(QTY_MAX[event], Math.floor(Number(o.qty) || 1)));
  const npcNote = str(o.npcNote, 220) || undefined;
  switch (event) {
    case "talk":
      return has(cat.npcs, o.who) ? { title, text, event, match: { npcKey: String(o.who) }, qty: 1, npcNote } : null;
    case "deliver":
      return has(cat.npcs, o.who) && has(cat.deliver, o.item) ? { title, text, event, match: { npcKey: String(o.who), itemKey: String(o.item) }, qty, npcNote } : null;
    case "collect":
      return has(cat.collect, o.item) ? { title, text, event, match: { itemKey: String(o.item) }, qty } : null;
    case "defeat":
      return has(cat.foes, o.foe) ? { title, text, event, match: { enemyKind: String(o.foe) }, qty } : null;
    case "visit":
      return has(cat.regions, o.place) ? { title, text, event, match: { region: String(o.place) }, qty: 1 } : null;
    case "fish": case "plant": case "sell":
      return { title, text, event, match: {}, qty };
  }
}

/** The AI's reply as a story, or null if it isn't one we can use. */
export function parseStory(raw: string, cat: StoryCatalog): StoryDraft | null {
  const o = firstObject(raw);
  if (!o || !Array.isArray(o.chapters)) return null;
  const title = str(o.title, 48), premise = str(o.premise, 300), ending = str(o.ending, 300);
  const heroTitle = str(o.heroTitle, 24).replace(/[^\p{L}\p{N}' -]/gu, "").trim();
  if (!title || !premise) return null;
  const chapters = o.chapters.map((c) => parseChapter(c, cat)).filter((c): c is StoryChapterDraft => !!c).slice(0, STORY_MAX_CHAPTERS);
  if (!wellFormed(chapters)) return null;
  return { title, premise, ending: ending || "And so this part of your story ends.", heroTitle: heroTitle || "Storied", chapters };
}

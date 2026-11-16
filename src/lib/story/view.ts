// A story as the client sees it, and what its NPC is told: names for the
// chapter's keys and where to head. Pure.

import { npcDef } from "@/lib/npcDefs";
import { itemDef } from "@/lib/itemDefs";
import { ENEMY_KINDS } from "@/lib/progression";
import { placeByKey } from "@/lib/regions";
import { tilePoint } from "@/lib/worldmap";
import type { StoryChapter, StorySource, StoryView } from "@/types/story";

/** The display names of a chapter's NPC, item, foe and region. */
export function chapterNames(ch: StoryChapter): StoryView["names"] {
  const m = ch.match;
  return {
    ...(m.npcKey ? { npc: npcDef(m.npcKey)?.name ?? m.npcKey } : {}),
    ...(m.itemKey ? { item: itemDef(m.itemKey)?.name ?? m.itemKey.replace(/_/g, " ") } : {}),
    ...(m.enemyKind ? { foe: ENEMY_KINDS[m.enemyKind]?.name ?? m.enemyKind } : {}),
    ...(m.region ? { region: placeByKey(m.region)?.name ?? m.region } : {}),
  };
}

/** Where to head for a chapter when its target isn't in sight: the NPC's home, or the middle of the region. */
export function chapterWhere(ch: StoryChapter): { x: number; y: number } | null {
  if (ch.match.npcKey) {
    const n = npcDef(ch.match.npcKey);
    return n ? tilePoint(n.tilePos[0], n.tilePos[1]) : null;
  }
  if (ch.match.region) {
    const r = placeByKey(ch.match.region);
    return r ? { x: Math.round(((r.tx0 + r.tx1) / 2) * 16), y: Math.round(((r.ty0 + r.ty1) / 2) * 16) } : null;
  }
  return null;
}

export function storyViewOf(row: { id: number; title: string; premise: string; source: StorySource; step: number; progress: number; chapters: StoryChapter[] }): StoryView | null {
  const chapter = row.chapters[row.step];
  if (!chapter) return null;
  return { id: row.id, title: row.title, premise: row.premise, source: row.source, step: row.step, total: row.chapters.length, progress: row.progress, chapter, names: chapterNames(chapter), where: chapterWhere(chapter) };
}

/** What the chapter's NPC is told about the player's story while it's their turn (the talk prompt). */
export function storyNote(playerName: string, story: { title: string; premise: string }, ch: StoryChapter, have?: number): string {
  const names = chapterNames(ch);
  const want = ch.event === "deliver" && names.item
    ? ` You're waiting for ${ch.qty} ${names.item} from them${have == null ? "" : have >= ch.qty ? "; they have them with them now, so thank them for bringing them" : `; they have ${have} so far`}.`
    : "";
  return `${playerName.toUpperCase()}'S STORY (true; you play a part in it, so act it out naturally and in your own words; never call it a quest or a story): "${story.title}". ${story.premise}
Where it stands: ${ch.title}: ${ch.text}${ch.npcNote ? `\nYour part: ${ch.npcNote}` : ""}${want}`;
}

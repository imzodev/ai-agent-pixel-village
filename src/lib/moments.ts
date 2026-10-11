// Moments, the pure part: what each proud milestone says on its card and in
// the post a player shares, the level milestones, and the X share link.
// Server: src/lib/momentsServer.ts. Cards: src/lib/cards/momentCard.ts.

import type { LairBoss } from "@/types/lairs";
import type { MomentData } from "@/types/moments";

const SITE = "thegroove";
/** Levels worth a card: every 5th. */
export const LEVEL_MILESTONE_EVERY = 5;

/** "glacier_blade" → "Glacier Blade". */
export const titleCase = (key: string): string => key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
/** "the Hollow" stays as is; "Frost Giant" gets "the". */
const withThe = (name: string): string => (/^the /i.test(name) ? name : `the ${name}`);
const capFirst = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The highest level milestone crossed going from `from` to `to`, if any. */
export function levelMilestone(from: number, to: number): number | null {
  if (to <= from) return null;
  const m = Math.floor(to / LEVEL_MILESTONE_EVERY) * LEVEL_MILESTONE_EVERY;
  return m > from && m >= LEVEL_MILESTONE_EVERY ? m : null;
}

export function lairBossMoment(lair: LairBoss, unique?: string): MomentData {
  const extra = unique ? `and claimed the ${titleCase(unique)}` : undefined;
  return {
    headline: `${capFirst(withThe(lair.name))} felled`,
    sub: `in ${lair.lair} · danger tier ${lair.tier}`,
    share: `I just took down ${withThe(lair.name)} in ${lair.lair}${unique ? ` and got the ${titleCase(unique)}` : ""} on ${SITE}`,
    art: { kind: "enemy", key: lair.kind },
    extra,
  };
}

export function rootkingMoment(): MomentData {
  return {
    headline: "The Old Rootking fell",
    sub: "the north woods' great boss, beaten together",
    share: `We drove back the Old Rootking on ${SITE}. Who's in next time?`,
    art: { kind: "enemy", key: "rootking" },
  };
}

export function levelMoment(level: number): MomentData {
  return {
    headline: `Level ${level}`,
    sub: level >= 30 ? "a legend of the grove" : level >= 20 ? "a veteran of the far lands" : level >= 10 ? "no longer a newcomer" : "finding their feet",
    share: `Just hit level ${level} on ${SITE}`,
    art: { kind: "level", level },
  };
}

export function titleMoment(title: string, why: string): MomentData {
  return { headline: `"${title}"`, sub: `a new title · ${why}`, share: `I earned the title "${title}" on ${SITE}` };
}

export function relicSetMoment(setName: string, count: number): MomentData {
  return { headline: `${setName}: complete`, sub: `all ${count} found across the continent`, share: `Found every one of the ${setName} on ${SITE}` };
}

export function treasureMoment(): MomentData {
  return { headline: "A legendary chest", sub: "the end of a long treasure trail", share: `Followed a treasure trail to the end and dug up a legendary chest on ${SITE}` };
}

export function dearFriendMoment(npcName: string, npcKey: string, role: string): MomentData {
  return {
    headline: `${npcName}'s dear friend`,
    sub: `${role} · they remember everything you did`,
    share: `${npcName} the ${role.toLowerCase()} calls me a dear friend now on ${SITE}. The NPCs actually remember you.`,
    art: { kind: "npc", key: npcKey },
  };
}

/** The X post composer, filled in. */
export function xShareUrl(text: string, url: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

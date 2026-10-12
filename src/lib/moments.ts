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
/** One of a few phrasings, so a feed of shares doesn't read copy-pasted. `r` in [0, 1). */
const oneOf = (options: string[], r = Math.random()): string => options[Math.floor(r * options.length) % options.length];

// The `share` lines are what a player posts on X: casual, first person, no
// slogans or challenges, now and then a word about the AI villagers.

/** The highest level milestone crossed going from `from` to `to`, if any. */
export function levelMilestone(from: number, to: number): number | null {
  if (to <= from) return null;
  const m = Math.floor(to / LEVEL_MILESTONE_EVERY) * LEVEL_MILESTONE_EVERY;
  return m > from && m >= LEVEL_MILESTONE_EVERY ? m : null;
}

export function lairBossMoment(lair: LairBoss, unique?: string, r?: number): MomentData {
  const extra = unique ? `and claimed the ${titleCase(unique)}` : undefined;
  const boss = withThe(lair.name);
  const loot = unique ? titleCase(unique) : null;
  return {
    headline: `${capFirst(withThe(lair.name))} felled`,
    sub: `in ${lair.lair} · danger tier ${lair.tier}`,
    share: oneOf([
      `Finally took down ${boss} in ${lair.lair} on ${SITE}${loot ? ", and it dropped the " + loot : ""}. Still not over it`,
      `${capFirst(boss)} is down. Took me a while${loot ? ", but I got the " + loot + " out of it" : ""}. ${SITE} keeps surprising me`,
    ], r),
    art: { kind: "enemy", key: lair.kind },
    extra,
  };
}

export function rootkingMoment(): MomentData {
  return {
    headline: "The Old Rootking fell",
    sub: "the north woods' great boss, beaten together",
    share: `The Old Rootking is down. Took a bunch of us on ${SITE}, and it was worth it`,
    art: { kind: "enemy", key: "rootking" },
  };
}

export function levelMoment(level: number, r?: number): MomentData {
  return {
    headline: `Level ${level}`,
    sub: level >= 30 ? "a legend of the grove" : level >= 20 ? "a veteran of the far lands" : level >= 10 ? "no longer a newcomer" : "finding their feet",
    share: oneOf([
      `Level ${level} on ${SITE}. The villagers are AI and they still remember the dumb stuff I did at level 1`,
      `Hit level ${level} on ${SITE}. Every villager there is an AI living its own life, and I keep finding new things`,
    ], r),
    art: { kind: "level", level },
  };
}

export function titleMoment(title: string, why: string): MomentData {
  return { headline: `"${title}"`, sub: `a new title · ${why}`, share: `Earned the title "${title}" on ${SITE}, ${why}. Not sure what my life has become` };
}

export function relicSetMoment(setName: string, count: number): MomentData {
  return { headline: `${setName}: complete`, sub: `all ${count} found across the continent`, share: `Found every one of the ${setName} on ${SITE}. That was a whole trip across the map` };
}

export function treasureMoment(): MomentData {
  return { headline: "A legendary chest", sub: "the end of a long treasure trail", share: `Followed a treasure map to the very end on ${SITE} and dug up a legendary chest. Worth it` };
}

export function dearFriendMoment(npcName: string, npcKey: string, role: string, r?: number): MomentData {
  return {
    headline: `${npcName}'s dear friend`,
    sub: `${role} · they remember everything you did`,
    share: oneOf([
      `${npcName} the ${role.toLowerCase()} calls me a dear friend now on ${SITE}. The villagers are AI and remember everything, so that one felt earned`,
      `${npcName} the ${role.toLowerCase()} calls me a dear friend now. The villagers on ${SITE} are AI that decide things for themselves, so I'll take it`,
    ], r),
    art: { kind: "npc", key: npcKey },
  };
}

/** The X post composer, filled in. */
export function xShareUrl(text: string, url: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

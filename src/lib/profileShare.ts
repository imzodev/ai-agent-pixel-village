// The post a profile shares on X. It should read like a player telling
// friends about a game they're into, not an ad: their best moments as plain
// sentences, and, said with a bit of surprise, the thing that's new here:
// the villagers are AI that think and decide for themselves, in a big world.
// No slogans, arrows or challenges. The link (and its card) is added by xShareUrl.

import type { Profile, ShareContext as Ctx } from "@/types/profile";

/** X counts every link as 23 characters, plus the space before it. */
const LINK_COST = 24;
const MAX_POST = 280;
/** How many facts a post mentions at most. */
const MAX_FACTS = 2;
const DAY_MS = 86_400_000;

/** The player's best things as sentence clauses, most impressive first. */
export function shareFacts(p: Profile, own: boolean): string[] {
  const I = own ? "I" : "they";
  const me = own ? "me" : "them";
  const have = own ? "I've" : "they've";
  const facts: string[] = [];
  const boss = p.book.toughest.find((f) => f.note === "boss");
  if (boss) facts.push(`${I} took down the ${boss.name}`);
  const friend = p.dearFriends[0];
  if (friend) facts.push(`${friend.name} the ${friend.role.toLowerCase()} calls ${me} a dear friend now`);
  const legend = p.book.rareFish.find((f) => f.note === "legendary");
  if (legend) facts.push(`${I} caught a legendary ${legend.name}`);
  const weapon = p.trophies.find((t) => t.legendary);
  if (weapon) facts.push(`${have} got the ${weapon.name}`);
  if (p.relicSets[0]) facts.push(`${I} found every one of the ${p.relicSets[0]}`);
  if (p.book.lostCache) facts.push(`${I} dug up a legendary chest`);
  if (p.book.towns.visited >= 5) facts.push(`${have} been to ${p.book.towns.visited} of the ${p.book.towns.total} towns`);
  const done = p.achievements.filter((a) => a.done).length;
  if (done >= 3) facts.push(`${have} got ${done} achievements`);
  return facts;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The phrasings: `f` is the facts joined into one clause, `L` the level, `n` the player's name. */
const OWN: ((c: Ctx) => string)[] = [
  (c) => `${cap(c.f)}. Every villager in thegroove is an AI that decides what to do on its own, which still gets me. Level ${c.L}`,
  (c) => `Level ${c.L} in thegroove. ${cap(c.f)}. The villagers are AI agents just living their lives, nobody's scripting them. Still wrapping my head around it`,
  (c) => `Somehow I'm level ${c.L} in thegroove. ${cap(c.f)}, all in a world full of AI villagers doing their own thing. Come say hi if you end up playing`,
  (c) => `Didn't expect to get this into a browser game. It's a whole continent of AI villagers who think for themselves. ${cap(c.f)}. Level ${c.L} in thegroove 🌳`,
];
const OWN_NEW: ((c: Ctx) => string)[] = [
  (c) => `Started playing thegroove. Every villager is an AI that makes its own decisions, and the world is huge. Level ${c.L} so far, come say hi`,
  (c) => `Trying out thegroove. ${c.towns} towns and every villager in them is an AI living its own life. Level ${c.L} so far`,
];
const THEIRS: ((c: Ctx) => string)[] = [
  (c) => `${c.n} is level ${c.L} in thegroove. ${cap(c.f)}. The villagers there are AI and decide things on their own. Kind of want to try it now`,
  (c) => `Found ${c.n} on thegroove, level ${c.L}. ${cap(c.f)}. A whole world of AI villagers making their own calls, which is a little wild`,
];
const THEIRS_NEW: ((c: Ctx) => string)[] = [
  (c) => `${c.n} is level ${c.L} in thegroove, a big world where every villager is an AI making its own decisions. Kind of want to try it now`,
];

/** Same phrasing for a player all day, a different one another day. */
export function shareSeed(username: string, now = Date.now()): number {
  let h = Math.floor(now / DAY_MS);
  for (const ch of username) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** The whole post (without the link), short enough for X with it. */
export function profileShareText(p: Profile, own: boolean, seed = shareSeed(p.username)): string {
  const facts = shareFacts(p, own);
  const room = MAX_POST - LINK_COST;
  const ctx = { L: p.look.level, n: p.look.name, towns: p.book.towns.total };
  // Fewer facts (least impressive dropped first) until it fits.
  for (let k = Math.min(MAX_FACTS, facts.length); k >= 0; k--) {
    const pool = k ? (own ? OWN : THEIRS) : own ? OWN_NEW : THEIRS_NEW;
    const text = pool[seed % pool.length]({ ...ctx, f: facts.slice(0, k).join(", and ") });
    if (text.length <= room) return text;
  }
  return (own ? OWN_NEW : THEIRS_NEW)[0]({ ...ctx, f: "" }).slice(0, room);
}

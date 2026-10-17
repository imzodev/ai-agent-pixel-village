// NPCs talking to each other, the server part (rules: src/lib/npcTalk.ts).
// tickd runs tickNpcTalks every beat; every 30 s it:
//   - turns notable world events into rumours, heard first by the NPCs who
//     were near (npc_rumours, npc_heard);
//   - finds NPCs close enough to talk. Watched by a player: one LLM call
//     writes a short conversation, played out as alternating speech bubbles,
//     passing gossip on and moving how they get on (npc_relations). Unwatched:
//     a rumour passes on quietly, no LLM;
//   - near a watching player with nobody close, sends an NPC over to visit a
//     neighbour (then home again once they've talked), so people see it.

import { and, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, npcHeard, npcMinds, npcRelations, npcRumours, npcTalks, npcs, worldChat, worldEvents, worldState } from "@/db/schema";
import { logEvent } from "@/lib/game";
import { rowPositionAt } from "@/lib/motion";
import { gameHour } from "@/lib/worldmap";
import { chatWithFallback } from "@/lib/llm";
import { makeDailyBudget } from "@/lib/llm/budget";
import { holdNpc } from "@/lib/moveStore";
import { npcsOnTrips, startTrip } from "@/lib/nav/trips";
import { regionAtTile } from "@/lib/regions";
import { townAt } from "@/lib/settlements";
import { isMindNpc } from "@/lib/mind/config";
import { remember } from "@/lib/mind/mindServer";
import {
  LINE_GAP_MS, RUMOUR_TTL_MS, TALKS_DAILY_MAX, clampAffinity, findPairs, isGossip, pairKey, parseTalk,
  rumoursToTell, startingAffinity, talkGist, talkPrompt, visitTarget, watched, witnesses, WATCH_PX,
} from "./npcTalk";
import type { GossipEvent, Rumour, TalkNpc, TalkPair, TalkRelation, TalkSide } from "@/types/npcTalk";

type NpcRow = typeof npcs.$inferSelect;

const RUN_EVERY_MS = 30_000;
/** One visit per patch of world (a screen) at most this often. */
const VISIT_EVERY_MS = 90_000;
/** A visit that hasn't led to a talk by now is given up, and the visitor goes home. */
const VISIT_GIVE_UP_MS = 4 * 60_000;
const LLM_TIMEOUT_MS = 15_000;

const g = globalThis as typeof globalThis & {
  __npcTalk?: {
    lastRun: number; lastEventId: number | null;
    npc: Map<number, number>; pair: Map<string, number>;
    talking: Set<number>; visits: Map<number, { target: number; at: number }>; visitAt: Map<string, number>;
  };
};
const st = (g.__npcTalk ??= { lastRun: 0, lastEventId: null, npc: new Map(), pair: new Map(), talking: new Set(), visits: new Map(), visitAt: new Map() });
const talkBudget = makeDailyBudget(TALKS_DAILY_MAX);

/** tickd, every beat: at most every 30 s, gossip, meetings and visits. */
export async function tickNpcTalks(now = Date.now()): Promise<void> {
  if (now - st.lastRun < RUN_EVERY_MS) return;
  st.lastRun = now;
  const rows = await db.select().from(npcs).where(and(eq(npcs.active, true), sql`${npcs.kind} <> 'remote'`));
  const onTrips = await npcsOnTrips();
  const here = rows.map((n) => ({ row: n, at: rowPositionAt(n, now) }));
  const people: TalkNpc[] = here.map(({ row, at }) => ({
    id: row.id, key: row.key, name: row.name, x: at.x, y: at.y,
    busy: st.talking.has(row.id) || (onTrips.has(row.id) && !st.visits.has(row.id)) || (row.holdUntil ?? 0) > now,
  }));
  await ingestRumours(people, now).catch((e) => console.warn("[talk] rumours:", e instanceof Error ? e.message : e));
  const players = await watchers(now);
  const byId = new Map(rows.map((r) => [r.id, r]));

  // Meetings: watched ones talk (an LLM call each, in the background); the rest pass gossip quietly.
  const cd = { npc: st.npc, pair: st.pair };
  for (const p of findPairs(people.filter((n) => !onTrips.has(n.id) || st.visits.has(n.id)), cd, now)) {
    const mid = { x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 };
    st.npc.set(p.a.id, now); st.npc.set(p.b.id, now); st.pair.set(pairKey(p.a.id, p.b.id), now);
    if (watched(mid.x, mid.y, players) && talkBudget.take(now)) {
      st.talking.add(p.a.id); st.talking.add(p.b.id);
      void talk(byId.get(p.a.id)!, byId.get(p.b.id)!, p, now)
        .catch((e) => console.warn("[talk] conversation:", e instanceof Error ? e.message : e))
        .finally(() => { st.talking.delete(p.a.id); st.talking.delete(p.b.id); endVisit(p.a.id, byId); endVisit(p.b.id, byId); });
    } else {
      await passGossip(p, now).catch(() => {});
    }
  }

  // Visits: near a watching player, with nobody close to talk to, an NPC walks over to a neighbour.
  for (const [id, v] of st.visits) if (now - v.at > VISIT_GIVE_UP_MS) endVisit(id, byId);
  const affinities = await affinityLookup();
  for (const pl of players) {
    const cell = `${Math.floor(pl.x / WATCH_PX)},${Math.floor(pl.y / WATCH_PX)}`;
    if (now - (st.visitAt.get(cell) ?? 0) < VISIT_EVERY_MS) continue;
    const near = people.filter((n) => !n.busy && !onTrips.has(n.id) && Math.hypot(n.x - pl.x, n.y - pl.y) <= WATCH_PX);
    for (const n of near.sort(() => Math.random() - 0.5)) {
      const target = visitTarget(n, people.filter((o) => !onTrips.has(o.id)), affinities, cd, now);
      if (!target) continue;
      // Stop beside them, a tile and a half away, on the visitor's side.
      const d = Math.max(1, Math.hypot(n.x - target.x, n.y - target.y));
      const to = { x: target.x + ((n.x - target.x) / d) * 24, y: target.y + ((n.y - target.y) / d) * 24 };
      const r = await startTrip(n.id, { key: `visit:${target.key}`, name: target.name, ...to });
      if (!r.ok) continue;
      st.visits.set(n.id, { target: target.id, at: now });
      st.visitAt.set(cell, now);
      break;
    }
  }
}

/** A visitor goes home after the talk (or giving up): otherwise it would linger where it visited. */
function endVisit(id: number, byId: ReadonlyMap<number, NpcRow>): void {
  if (!st.visits.delete(id)) return;
  const n = byId.get(id);
  if (n) void startTrip(n.id, { key: `home:${n.key}`, name: "home", x: n.homeX, y: n.homeY }).catch(() => {});
}

/** Players seen in the last minute, where they are (the WS server saves live positions every 30 s). */
async function watchers(now: number): Promise<{ x: number; y: number }[]> {
  return db.select({ x: characters.x, y: characters.y }).from(characters).where(gt(characters.lastSeenAt, new Date(now - 60_000)));
}

/** Affinity between two NPCs (0 when they've no history yet), read once a run. */
async function affinityLookup(): Promise<(a: number, b: number) => number> {
  const rows = await db.select({ a: npcRelations.npcA, b: npcRelations.npcB, f: npcRelations.affinity }).from(npcRelations);
  const m = new Map(rows.map((r) => [pairKey(r.a, r.b), r.f]));
  return (a, b) => m.get(pairKey(a, b)) ?? 0;
}

// ── Gossip ────────────────────────────────────────────────────────────────

/** New notable world events become rumours, heard first by the NPCs nearby. */
async function ingestRumours(people: readonly TalkNpc[], now: number): Promise<void> {
  if (st.lastEventId == null) {
    // From where we left off (the newest rumour's event), or the last 10 minutes on a first run.
    const [last] = await db.select({ id: npcRumours.eventId }).from(npcRumours).orderBy(desc(npcRumours.eventId)).limit(1);
    const [recent] = await db.select({ id: worldEvents.id }).from(worldEvents).where(gt(worldEvents.createdAt, new Date(now - 10 * 60_000))).orderBy(worldEvents.id).limit(1);
    st.lastEventId = last?.id ?? (recent ? recent.id - 1 : (await db.select({ id: sql<number>`coalesce(max(${worldEvents.id}), 0)::int` }).from(worldEvents))[0].id);
  }
  const evs = await db.select().from(worldEvents).where(gt(worldEvents.id, st.lastEventId)).orderBy(worldEvents.id).limit(200);
  if (!evs.length) return;
  st.lastEventId = evs[evs.length - 1].id;
  for (const e of evs as GossipEvent[]) {
    if (!isGossip(e)) continue;
    let where = { x: e.x, y: e.y };
    if (where.x == null && e.subjectId != null) {
      const [c] = await db.select({ x: characters.x, y: characters.y }).from(characters).where(eq(characters.id, e.subjectId));
      if (c) where = c;
    }
    const saw = witnesses(where, people);
    if (!saw.length) continue; // nobody saw it: nobody can tell it
    const [r] = await db.insert(npcRumours).values({ text: e.text, aboutCharacterId: e.subjectId, eventId: e.id }).onConflictDoNothing().returning({ id: npcRumours.id });
    if (r) await db.insert(npcHeard).values(saw.map((npcId) => ({ npcId, rumourId: r.id }))).onConflictDoNothing();
  }
  // Old rumours fade.
  await db.delete(npcRumours).where(sql`${npcRumours.at} < ${new Date(now - RUMOUR_TTL_MS).toISOString()}::timestamp`);
}

/** The fresh rumours each of these NPCs has heard. */
async function heardBy(ids: readonly number[], now: number): Promise<Map<number, Rumour[]>> {
  const rows = await db.select({ npcId: npcHeard.npcId, id: npcRumours.id, text: npcRumours.text, about: npcRumours.aboutCharacterId, at: npcRumours.at })
    .from(npcHeard).innerJoin(npcRumours, eq(npcRumours.id, npcHeard.rumourId))
    .where(and(inArray(npcHeard.npcId, [...ids]), gt(npcRumours.at, new Date(now - RUMOUR_TTL_MS))));
  const out = new Map<number, Rumour[]>();
  for (const r of rows) {
    const list = out.get(r.npcId) ?? [];
    list.push({ id: r.id, text: r.text, aboutCharacterId: r.about, at: r.at.getTime() });
    out.set(r.npcId, list);
  }
  return out;
}

/** An unwatched meeting: one rumour passes on, no words said. */
async function passGossip(p: TalkPair, now: number): Promise<void> {
  const heard = await heardBy([p.a.id, p.b.id], now);
  const a = heard.get(p.a.id) ?? [], b = heard.get(p.b.id) ?? [];
  const aToB = rumoursToTell(a, new Set(b.map((r) => r.id)), now, 1)[0];
  const bToA = rumoursToTell(b, new Set(a.map((r) => r.id)), now, 1)[0];
  const pick = aToB && (!bToA || aToB.at >= bToA.at) ? { r: aToB, to: p.b.id, from: p.a.id } : bToA ? { r: bToA, to: p.a.id, from: p.b.id } : null;
  if (pick) await db.insert(npcHeard).values({ npcId: pick.to, rumourId: pick.r.id, fromNpcId: pick.from }).onConflictDoNothing();
}

/** What a player's NPC has heard, for the talk prompt: the ones about this player first. */
export async function gossipFor(npcId: number, characterId: number, now = Date.now(), max = 4): Promise<string[]> {
  const list = (await heardBy([npcId], now)).get(npcId) ?? [];
  list.sort((x, y) => Number(y.aboutCharacterId === characterId) - Number(x.aboutCharacterId === characterId) || y.at - x.at);
  return list.slice(0, max).map((r) => r.text);
}

// ── A conversation ────────────────────────────────────────────────────────

/** How they get on (created from their personalities' opinions the first time). */
async function relationOf(a: NpcRow, b: NpcRow): Promise<TalkRelation> {
  const [x, y] = a.id < b.id ? [a, b] : [b, a];
  await db.insert(npcRelations).values({ npcA: x.id, npcB: y.id, affinity: startingAffinity(x.key, x.name, y.key, y.name) }).onConflictDoNothing();
  const [r] = await db.select().from(npcRelations).where(and(eq(npcRelations.npcA, x.id), eq(npcRelations.npcB, y.id)));
  return { affinity: r?.affinity ?? 0, note: r?.note ?? "", talks: r?.talks ?? 0 };
}

/** Where they are, in words. */
function placeOf(x: number, y: number): string {
  const tx = Math.floor(x / 16), ty = Math.floor(y / 16);
  const town = townAt(tx, ty);
  if (town) return `in ${town.name}`;
  const region = regionAtTile(tx, ty);
  return region ? `in ${region.name}` : "out on the road";
}

/** What an NPC is up to, in a few words (a mind's latest memory, else its role at home). */
async function doingOf(n: NpcRow): Promise<string> {
  if (isMindNpc(n.key)) {
    const [m] = await db.select({ memory: npcMinds.memory }).from(npcMinds).where(eq(npcMinds.npcId, n.id));
    const last = m?.memory?.[0]?.text;
    if (last) return `${n.role}, in the middle of the day's work (lately: ${last.replace(/^They /, "").replace(/\.$/, "")})`;
  }
  return `${n.role}, going about the day`;
}

async function talk(a: NpcRow, b: NpcRow, p: TalkPair, now: number): Promise<void> {
  const [rel, heard, doingA, doingB, ws] = await Promise.all([
    relationOf(a, b), heardBy([a.id, b.id], now), doingOf(a), doingOf(b),
    db.select().from(worldState).where(eq(worldState.id, 1)).then((r) => r[0]),
  ]);
  const ha = heard.get(a.id) ?? [], hb = heard.get(b.id) ?? [];
  const tellA = rumoursToTell(ha, new Set(hb.map((r) => r.id)), now), tellB = rumoursToTell(hb, new Set(ha.map((r) => r.id)), now);
  const side = (n: NpcRow, doing: string, rumours: Rumour[]): TalkSide => ({ key: n.key, name: n.name, role: n.role, persona: n.persona, mood: n.mood, doing, rumours });
  const hour = ws ? gameHour(ws.epochStart.getTime(), ws.dayLengthMinutes, now) : 12;
  const prompt = talkPrompt(side(a, doingA, tellA), side(b, doingB, tellB), rel, { place: placeOf((p.a.x + p.b.x) / 2, (p.a.y + p.b.y) / 2), hour, weather: ws?.weather ?? "clear" });
  const res = await Promise.race([
    chatWithFallback([{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }], { jsonMode: true, temperature: 0.95, maxTokens: 1500 }).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), LLM_TIMEOUT_MS)),
  ]);
  const offered = new Set([...tellA, ...tellB].map((r) => r.id));
  const out = res ? parseTalk(res.text, offered) : null;
  if (!out) return;

  // Hold them still while they talk, then say the lines one after another.
  const lasts = out.lines.length * LINE_GAP_MS + 2000;
  await Promise.all([holdNpc(a.id, Date.now(), lasts), holdNpc(b.id, Date.now(), lasts)]);
  out.lines.forEach((l, i) => {
    const speaker = l.who === "A" ? a : b;
    setTimeout(() => { void db.insert(worldChat).values({ speakerType: "npc", speakerId: speaker.id, text: l.text.slice(0, 140) }).catch(() => {}); }, i * LINE_GAP_MS);
  });

  // Remember it: the conversation, what's between them now, who heard what, and a line in the world log.
  const [x, y] = a.id < b.id ? [a, b] : [b, a];
  const gist = talkGist(a.name, b.name, out);
  await db.insert(npcTalks).values({ npcA: x.id, npcB: y.id, lines: out.lines.map((l) => ({ who: (l.who === "A") === (a.id === x.id) ? "A" : "B", text: l.text })) });
  await db.update(npcRelations).set({
    affinity: clampAffinity(rel.affinity + out.relation.delta), talks: rel.talks + 1, lastAt: new Date(now),
    ...(out.relation.note ? { note: out.relation.note } : {}),
  }).where(and(eq(npcRelations.npcA, x.id), eq(npcRelations.npcB, y.id)));
  const told = [...tellA.filter((r) => out.told.includes(r.id)).map((r) => ({ npcId: b.id, rumourId: r.id, fromNpcId: a.id })), ...tellB.filter((r) => out.told.includes(r.id)).map((r) => ({ npcId: a.id, rumourId: r.id, fromNpcId: b.id }))];
  if (told.length) await db.insert(npcHeard).values(told).onConflictDoNothing();
  await logEvent("talk", gist, "npc", a.id, (p.a.x + p.b.x) / 2, (p.a.y + p.b.y) / 2);
  for (const [me, other] of [[a, b], [b, a]] as const) if (isMindNpc(me.key)) await remember(me.id, `They had a chat with ${other.name}.`, now);
}

/** Admin: recent conversations, live rumours and how NPCs get on. */
export async function talkReport(limit = 20) {
  const [talks, rumours, relations, names] = await Promise.all([
    db.select().from(npcTalks).orderBy(desc(npcTalks.at)).limit(limit),
    db.select().from(npcRumours).orderBy(desc(npcRumours.at)).limit(limit),
    db.select().from(npcRelations).where(or(gt(npcRelations.talks, 0), sql`${npcRelations.affinity} <> 0`)).orderBy(desc(npcRelations.lastAt)).limit(limit),
    db.select({ id: npcs.id, name: npcs.name }).from(npcs),
  ]);
  const name = new Map(names.map((n) => [n.id, n.name]));
  const heardCounts = rumours.length ? await db.select({ id: npcHeard.rumourId, n: sql<number>`count(*)::int` }).from(npcHeard).where(inArray(npcHeard.rumourId, rumours.map((r) => r.id))).groupBy(npcHeard.rumourId) : [];
  const heard = new Map(heardCounts.map((h) => [h.id, h.n]));
  return {
    talks: talks.map((t) => ({ at: t.at, a: name.get(t.npcA), b: name.get(t.npcB), lines: t.lines.map((l) => `${l.who === "A" ? name.get(t.npcA) : name.get(t.npcB)}: ${l.text}`) })),
    rumours: rumours.map((r) => ({ at: r.at, text: r.text, heardBy: heard.get(r.id) ?? 0 })),
    relations: relations.map((r) => ({ a: name.get(r.npcA), b: name.get(r.npcB), affinity: r.affinity, note: r.note, talks: r.talks, lastAt: r.lastAt })),
  };
}

/** For tests and the admin: forget cooldowns (a fresh process). */
export function resetTalkState(): void {
  st.lastRun = 0; st.npc.clear(); st.pair.clear(); st.talking.clear(); st.visits.clear(); st.visitAt.clear();
}


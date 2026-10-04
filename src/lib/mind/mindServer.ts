// NPC minds, the server part: every MIND_INTERVAL_MS each NPC with a mind
// (src/lib/mind/config.ts) looks at its situation, asks Jev which of the
// actions it can take right now to take (src/lib/mind/jev.ts; the scripted
// policy decides when Jev can't or isn't sure), and the game carries it
// out: make a batch, walk to a supplier, ask the village for ingredients,
// give a friend something. What each kind of NPC makes and needs is its
// profile (src/lib/mind/profiles.ts). The LLM only writes the line it says.
//
// Stock and purse change through one guarded UPDATE each (adjustStock), so
// shop sales from the API routes and tickd's thinking never lose a change.
// Safe for tickd: imports no seed code.

import { and, eq, gte, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, missions, npcMinds, npcTrips, npcs, worldChat, worldState } from "@/db/schema";
import { addItem, logEvent } from "@/lib/game";
import { rowPositionAt } from "@/lib/motion";
import { gameHour } from "@/lib/worldmap";
import { BREAD_TABLES, tablePoint } from "@/lib/bakery";
import { latestBatch, setOutBatch } from "@/lib/bakeryServer";
import { startTrip } from "@/lib/nav/trips";
import { chatWithFallback } from "@/lib/llm";
import { askJev } from "./jev";
import { MIND_INTERVAL_MS, isMindNpc, mindNpcKeys } from "./config";
import { markGifted, regardHelped, regardScores, tierFor } from "./regard";
import { MOODS, REQUEST_TTL_MS, URGENCY, count, feasibleActions, regardTier, requestReward, scriptedPick, stateText, word } from "./profile";
import { profileFor } from "./profiles";
import type { MindDecision, MindIntent, MindMemory, MindProfile, MindReport, MindView, NearbyPlayer, NpcStock, OpenRequest } from "@/types/mind";

type NpcRow = typeof npcs.$inferSelect;
type MindRow = typeof npcMinds.$inferSelect;

/** Below this Jev confidence the scripted policy decides instead. */
export const MIN_CONFIDENCE = 0.35;
const MEMORY_KEEP = 12;
const NEARBY_PX = 200;
/** Within this of their home spot they're "at work". */
const HOME_PX = 12 * 16;
const title = (s: string) => s[0].toUpperCase() + s.slice(1);

// ── Stock, purse and memory (atomic) ─────────────────────────────────────
/** A fresh mind's row (created the first time it's needed). */
async function ensureMind(npcId: number, p: MindProfile): Promise<MindRow> {
  await db.insert(npcMinds).values({ npcId, stock: { ...p.startStock }, purse: p.startPurse }).onConflictDoNothing();
  const [m] = await db.select().from(npcMinds).where(eq(npcMinds.npcId, npcId));
  return m;
}

/**
 * Change stock and purse in one guarded UPDATE: nothing may go below zero
 * (unless `floorPurse`, which clamps the purse at 0 instead of refusing).
 * Returns the new stock and purse, or null when the guard refused.
 */
export async function adjustStock(npcId: number, delta: NpcStock, purseDelta = 0, floorPurse = false): Promise<{ stock: NpcStock; purse: number } | null> {
  let stockExpr = sql`${npcMinds.stock}`;
  const guards = [sql`true`];
  for (const [k, d] of Object.entries(delta)) {
    const cur = sql`coalesce((${npcMinds.stock}->>${k})::int, 0)`;
    stockExpr = sql`${stockExpr} || jsonb_build_object(${k}::text, ${cur} + ${d})`;
    guards.push(sql`${cur} + ${d} >= 0`);
  }
  const purseExpr = floorPurse ? sql`greatest(0, ${npcMinds.purse} + ${purseDelta})` : sql`${npcMinds.purse} + ${purseDelta}`;
  if (!floorPurse) guards.push(sql`${npcMinds.purse} + ${purseDelta} >= 0`);
  const [row] = await db.update(npcMinds).set({ stock: stockExpr, purse: purseExpr })
    .where(and(eq(npcMinds.npcId, npcId), ...guards)).returning({ stock: npcMinds.stock, purse: npcMinds.purse });
  return row ?? null;
}

/** Remember something (newest first, the last MEMORY_KEEP kept). */
export async function remember(npcId: number, text: string, at = Date.now()): Promise<void> {
  const m: MindMemory = { at, text };
  await db.update(npcMinds).set({
    memory: sql`(select coalesce(jsonb_agg(e order by i), '[]'::jsonb) from jsonb_array_elements(jsonb_build_array(${JSON.stringify(m)}::jsonb) || ${npcMinds.memory}) with ordinality as t(e, i) where i <= ${MEMORY_KEEP})`,
  }).where(eq(npcMinds.npcId, npcId));
}

// ── Hooks from the shop, trades and missions ─────────────────────────────
async function mindNpcByKey(key: string): Promise<{ npc: NpcRow; profile: MindProfile } | null> {
  const profile = profileFor(key);
  if (!profile || !isMindNpc(key)) return null;
  const [npc] = await db.select().from(npcs).where(eq(npcs.key, key));
  if (!npc) return null;
  await ensureMind(npc.id, profile);
  return { npc, profile };
}

/**
 * A player buys from an NPC's shelf. Not a mind NPC or not a shelf item →
 * `handled: false` (the shop sells as usual). Otherwise the item leaves her
 * shelf and the coins go to her purse — or it's sold out.
 */
export async function shelfSale(npcKey: string, itemKey: string, qty: number, coins: number): Promise<{ handled: boolean; ok: boolean; npcId?: number }> {
  const m = await mindNpcByKey(npcKey);
  if (!m || m.profile.shelf[itemKey] == null) return { handled: false, ok: true };
  const r = await adjustStock(m.npc.id, { [itemKey]: -qty }, coins);
  return { handled: true, ok: !!r, npcId: m.npc.id };
}

/** Undo a shelf sale (the player couldn't pay after all). */
export async function undoShelfSale(npcId: number, itemKey: string, qty: number, coins: number): Promise<void> {
  await adjustStock(npcId, { [itemKey]: qty }, -coins, true);
}

/**
 * A player sells to an NPC. A mind NPC pays from its purse and keeps the
 * goods; if it can't afford them, the sale is refused.
 */
export async function npcBuys(npcKey: string, itemKey: string, qty: number, cost: number): Promise<{ handled: boolean; ok: boolean; npcId?: number }> {
  const m = await mindNpcByKey(npcKey);
  if (!m) return { handled: false, ok: true };
  const r = await adjustStock(m.npc.id, { [itemKey]: qty }, -cost);
  return { handled: true, ok: !!r, npcId: m.npc.id };
}

/** A request (a mission the NPC posted) was turned in. */
export async function onRequestTurnedIn(npc: NpcRow, mission: typeof missions.$inferSelect, characterId: number, playerName: string): Promise<void> {
  const p = profileFor(npc.key);
  if (!p || !mission.key.startsWith(`req_${npc.key}_`) || mission.requirement.type !== "collect") return;
  const { itemKey, qty } = mission.requirement;
  const r = await adjustStock(npc.id, { [itemKey]: qty }, -(mission.reward.coins ?? 0), true);
  await regardHelped(npc.id, characterId, 5);
  await remember(npc.id, `${playerName} brought ${qty} ${word(p, itemKey)}, as asked.`);
  // Enough now: close the request.
  if (r && (r.stock[itemKey] ?? 0) >= (p.asks[itemKey]?.low ?? 0) * 2) await db.update(missions).set({ active: false }).where(eq(missions.id, mission.id));
}

/** A line for her talk prompt: how she feels about this player and what she's up to. */
export async function mindNoteFor(npc: NpcRow, characterId: number, playerName: string): Promise<string | null> {
  const p = profileFor(npc.key);
  if (!p || !isMindNpc(npc.key)) return null;
  const m = await ensureMind(npc.id, p);
  const tier = await tierFor(npc.id, characterId);
  const feel = { dear: `${playerName} is a dear friend: greet them by name, warmly`, fond: `You're fond of ${playerName}`, neutral: `${playerName} is an acquaintance`, cool: `${playerName} keeps taking free bread and never helps: be polite but short with them` }[tier];
  const s = m.stock;
  const errand = m.intent.startsWith("errand:") ? m.intent.slice(7) : null;
  const doing = errand ? `You're on your way to ${p.supplies[errand]?.place ?? "buy supplies"} for ${word(p, errand)}.` : m.intent === "going_home" ? "You're heading home to work." : "";
  const shelf = Object.keys(p.shelf).map((k) => `${s[k] ?? 0} ${word(p, k)}`).join(", ");
  const left = [...new Set([...Object.keys(p.asks), ...Object.keys(p.supplies)])].map((k) => `${s[k] ?? 0} ${word(p, k)}`).join(", ");
  return `${feel}. ${doing} On your shelf: ${shelf}; ingredients left: ${left}.`;
}

// ── Thinking ─────────────────────────────────────────────────────────────
async function openRequests(npc: NpcRow): Promise<(OpenRequest & { key: string })[]> {
  const rows = await db.select().from(missions).where(and(eq(missions.npcId, npc.id), eq(missions.active, true), like(missions.key, `req_${npc.key}_%`)));
  return rows.flatMap((m) => m.requirement.type === "collect"
    ? [{ key: m.key, missionId: m.id, itemKey: m.requirement.itemKey, qty: m.requirement.qty, postedAt: Number(m.key.split("_").at(-1)) || 0 }]
    : []);
}

async function nearbyPlayers(npcId: number, pos: { x: number; y: number }, now: number): Promise<NearbyPlayer[]> {
  const rows = await db.select({ id: characters.id, name: characters.name, x: characters.x, y: characters.y }).from(characters)
    .where(and(gte(characters.lastSeenAt, new Date(now - 60_000)),
      sql`${characters.x} between ${pos.x - NEARBY_PX} and ${pos.x + NEARBY_PX}`, sql`${characters.y} between ${pos.y - NEARBY_PX} and ${pos.y + NEARBY_PX}`))
    .limit(10);
  const scores = await regardScores(npcId, rows.map((r) => r.id));
  return rows.map((r) => {
    const g = scores.get(r.id);
    const score = g?.score ?? 0;
    return { id: r.id, name: r.name, score, tier: regardTier(score), giftedToday: g?.lastGiftAt != null && now - g.lastGiftAt < 24 * 3600_000 };
  });
}

/** Say a line out loud (LLM, short; canned when there's no provider). */
async function say(npc: NpcRow, doing: string, canned: string): Promise<string> {
  const r = await Promise.race([
    chatWithFallback([
      { role: "system", content: `You are ${npc.name}, ${npc.role}, in a cozy pixel village. Persona: ${npc.persona}\nMood: ${npc.mood}. Write ONE short line (at most 18 words) you say out loud right now, in character. No quotes, no narration, no emoji.` },
      { role: "user", content: doing },
    ], { temperature: 0.9, maxTokens: 60 }).catch(() => null),
    new Promise<null>((res) => setTimeout(() => res(null), 6000)),
  ]);
  const text = r?.text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<\/?think>/gi, "").replace(/^["'\s]+|["'\s]+$/g, "").split("\n")[0].trim();
  return text && text.length <= 160 ? text : canned;
}

async function speak(npc: NpcRow, text: string, at: { x: number; y: number }, event: string): Promise<void> {
  await db.insert(worldChat).values({ speakerType: "npc", speakerId: npc.id, text: text.slice(0, 140) });
  await logEvent("mind", event, "npc", npc.id, at.x, at.y);
}

/** Carry an action out. Returns what they'll remember of it ("" = nothing worth it). */
async function act(npc: NpcRow, p: MindProfile, action: string, v: MindView, urgency: number, now: number): Promise<{ memory: string; intent?: MindIntent; crafted?: boolean }> {
  const pos = rowPositionAt(npc, now);
  const recipe = p.crafts[action];
  if (recipe) {
    const table = recipe.toTable > 0 ? BREAD_TABLES.find((t) => t.bakerKey === npc.key) : undefined;
    if (recipe.toTable > 0 && !table) return { memory: "" };
    const uses: NpcStock = {};
    for (const [k, n] of Object.entries(recipe.uses)) uses[k] = -n;
    const shelf = recipe.makes - recipe.toTable;
    if (!(await adjustStock(npc.id, { ...uses, [recipe.itemKey]: (uses[recipe.itemKey] ?? 0) + shelf }))) return { memory: "" };
    if (table) await setOutBatch(table.key, recipe.itemKey, recipe.toTable, now);
    const where = table ? `${recipe.toTable} out on the free table outside (one each!), the rest on your shelf` : "all on your shelf to sell";
    await speak(npc, await say(npc, `You just ${recipe.verb.replace(/^(\w+)/, (w) => ({ bake: "baked", forge: "forged", fletch: "fletched" })[w] ?? `${w}ed`)}: ${where}.`, recipe.line),
      table ? tablePoint(table) : pos, `${npc.name} made ${count(p, recipe.makes, recipe.itemKey)}.`);
    return { memory: `They made ${count(p, recipe.makes, recipe.itemKey)}${table ? `, ${recipe.toTable} for the free table and ${shelf} for the shelf` : " for the shelf"}.`, crafted: true };
  }
  if (action.startsWith("buy_")) {
    const item = action.slice(4);
    const sup = p.supplies[item];
    const [seller] = sup ? await db.select().from(npcs).where(eq(npcs.key, sup.supplierKey)) : [];
    if (!sup || !seller) return { memory: "" };
    const intent: MindIntent = `errand:${item}`;
    const r = await startTrip(npc.id, { key: intent, name: sup.place, x: seller.homeX, y: seller.homeY });
    if (!r.ok) return { memory: `They wanted to go to ${sup.place} but couldn't find the way.` };
    await speak(npc, await say(npc, `You're closing up for a bit to walk to ${sup.place} for ${word(p, item)}.`, `Off to ${sup.place} for ${word(p, item)}. Back soon!`), pos, `${npc.name} set off to ${sup.place}.`);
    return { memory: `They closed up and set off to ${sup.place} for ${word(p, item)}.`, intent };
  }
  if (action.startsWith("ask_")) {
    const item = action.slice(4);
    const a = p.asks[item];
    if (!a) return { memory: "" };
    const coins = Math.min(v.purse, requestReward(p, item, a.qty, urgency));
    const what = word(p, item);
    await db.insert(missions).values({
      key: `req_${npc.key}_${now}`, npcId: npc.id, title: `${title(what)} for ${npc.name}`,
      description: `${npc.name} is short of ${what}. Bring ${a.qty}.`,
      offerLine: `I'm nearly out of ${what}. Bring me ${a.qty} and I'll pay you ${coins} coins for your trouble.`,
      completeLine: `Just what I needed, thank you! Here's your ${coins} coins.`,
      requirement: { type: "collect", itemKey: item, qty: a.qty }, reward: { coins, xp: 10 }, repeatable: false, active: true,
    });
    await speak(npc, await say(npc, `You're running low on ${what} and are asking passers-by to bring you ${a.qty}; you'll pay ${coins} coins.`, `Anyone got ${what}? I'll pay ${coins} coins for ${a.qty}!`), pos, `${npc.name} is asking for ${a.qty} ${what}.`);
    return { memory: `They asked the village for ${a.qty} ${what}, offering ${coins} coins.` };
  }
  if (action.startsWith("gift:") && p.gift) {
    const id = Number(action.slice(5));
    const f = v.nearby.find((x) => x.id === id);
    const { itemKey, qty } = p.gift;
    if (!f || !(await adjustStock(npc.id, { [itemKey]: -qty }))) return { memory: "" };
    await addItem(id, itemKey, qty);
    await markGifted(npc.id, id, new Date(now));
    const what = qty > 1 ? `${qty} ${word(p, itemKey)}` : `a ${word(p, itemKey).replace(/s$/, "")}`;
    await speak(npc, await say(npc, `You're giving ${f.name}, whom you like a lot, ${what} from your shelf as a little gift.`, `${f.name}! ${title(what)} for you. On the house.`), pos, `${npc.name} gave ${f.name} ${what}.`);
    return { memory: `They gave ${f.name} ${what}.` };
  }
  if (action === "go_home") {
    const r = await startTrip(npc.id, { key: `home:${npc.key}`, name: "home", x: npc.homeX, y: npc.homeY });
    return r.ok ? { memory: "They headed home to work.", intent: "going_home" } : { memory: "" };
  }
  return { memory: "" }; // tend_shop, rest, wait
}

/** One think for one NPC: look, decide, act, remember. */
export async function think(npc: NpcRow, now = Date.now()): Promise<MindDecision | null> {
  const p = profileFor(npc.key);
  if (!p) return null;
  let mind = await ensureMind(npc.id, p);
  const [ws] = await db.select().from(worldState).where(eq(worldState.id, 1));
  const hour = ws ? gameHour(ws.epochStart.getTime(), ws.dayLengthMinutes, now) : 12;
  const pos = rowPositionAt(npc, now);
  const atHome = Math.hypot(pos.x - npc.homeX, pos.y - npc.homeY) <= HOME_PX;
  const [trip] = await db.select().from(npcTrips).where(eq(npcTrips.npcId, npc.id));
  const onTrip = trip?.status === "active";
  let intent = mind.intent;

  // Errands finish on their own: at the supplier they buy what they can afford.
  if (intent.startsWith("errand:") && trip?.destKey === intent && trip.status !== "active") {
    const item = intent.slice(7);
    const sup = p.supplies[item];
    if (trip.status === "arrived" && sup) {
      const n = Math.min(sup.buy, Math.floor(mind.purse / sup.price));
      if (n > 0 && (await adjustStock(npc.id, { [item]: n }, -n * sup.price))) await remember(npc.id, `They bought ${n} ${word(p, item)} at ${sup.place} for ${n * sup.price} coins.`, now);
    } else await remember(npc.id, `They couldn't reach ${sup?.place ?? "the supplier"}.`, now);
    intent = "going_home";
  }
  if (intent === "going_home" && atHome && !onTrip) intent = "";
  // Requests nobody answered close after a while.
  const requests = await openRequests(npc);
  for (const r of requests) {
    if (r.postedAt && now - r.postedAt > REQUEST_TTL_MS) {
      await db.update(missions).set({ active: false }).where(eq(missions.id, r.missionId));
      await remember(npc.id, `Nobody brought the ${word(p, r.itemKey)} they asked for.`, now);
    }
  }
  mind = (await db.select().from(npcMinds).where(eq(npcMinds.npcId, npc.id)))[0];
  const table = Object.values(p.crafts).some((r) => r.toTable > 0) ? BREAD_TABLES.find((t) => t.bakerKey === npc.key) : undefined;
  const batch = table ? await latestBatch(table.key) : null;
  const view: MindView = {
    now, hour, weather: ws?.weather ?? "clear", name: npc.name, atHome, onTrip, intent,
    errandArrived: intent.startsWith("errand:") && trip?.destKey === intent && trip.status === "arrived",
    stock: mind.stock, purse: mind.purse, lastCraftAt: mind.lastCraftAt?.getTime() ?? null,
    table: table ? { left: batch ? Math.max(0, batch.qty - batch.taken) : 0, itemKey: batch?.itemKey ?? null, bakedAt: batch?.bakedAt ?? null } : null,
    requests: requests.filter((r) => !r.postedAt || now - r.postedAt <= REQUEST_TTL_MS),
    nearby: await nearbyPlayers(npc.id, pos, now),
    memories: mind.memory,
  };
  const options = feasibleActions(p, view);
  const answers = await askJev(stateText(p, view), {
    action: { type: "choice", instructions: `What should ${npc.name} do next?`, criteria: Object.fromEntries(options.map((o) => [o.key, o.description])) },
    mood: { type: "score", instructions: `How is ${npc.name} feeling right now?`, criteria: ["Gloomy and fed up", "Tired", "Content", "Cheerful", "Delighted"] },
    urgency: { type: "score", instructions: `How badly does ${npc.name} need more ingredients?`, criteria: ["Plenty left", "It would help", "Needs some soon", "Has run out"] },
  });
  const pick = answers?.choices.action;
  const valid = !!pick && options.some((o) => o.key === pick.choice);
  const useJev = valid && pick!.confidence >= MIN_CONFIDENCE;
  const action = useJev ? pick!.choice : scriptedPick(p, view, options);
  const moodScore = answers?.scores.mood;
  const mood = moodScore ? MOODS[Math.max(0, Math.min(MOODS.length - 1, Math.round(moodScore.score)))] : undefined;
  const runOut = Object.keys(p.asks).some((k) => (view.stock[k] ?? 0) === 0);
  const urgency = answers?.scores.urgency?.score ?? (runOut ? URGENCY.length - 1 : 1);
  const decision: MindDecision = {
    at: now, source: useJev ? "jev" : "scripted", action, options: options.map((o) => o.key),
    probabilities: pick?.probabilities, confidence: pick?.confidence, mood, urgency,
    fallback: useJev ? undefined : !answers ? "jev unavailable" : !valid ? "invalid choice" : `low confidence ${pick!.confidence.toFixed(2)}`,
  };
  if (mood && mood !== npc.mood) await db.update(npcs).set({ mood }).where(eq(npcs.id, npc.id));
  const done = await act(npc, p, action, view, urgency, now);
  if (done.memory) await remember(npc.id, done.memory, now);
  await db.update(npcMinds).set({
    intent: done.intent ?? intent, lastThinkAt: new Date(now), decision,
    ...(done.crafted ? { lastCraftAt: new Date(now) } : {}),
  }).where(eq(npcMinds.npcId, npc.id));
  return decision;
}

/** tickd, every beat: each mind NPC that's due thinks once. */
export async function thinkMinds(now = Date.now()): Promise<number> {
  let n = 0;
  for (const key of mindNpcKeys()) {
    const m = await mindNpcByKey(key);
    if (!m || !m.npc.active) continue;
    const [mind] = await db.select({ at: npcMinds.lastThinkAt }).from(npcMinds).where(eq(npcMinds.npcId, m.npc.id));
    if (mind?.at && now - mind.at.getTime() < MIND_INTERVAL_MS) continue;
    await think(m.npc, now).catch((e) => console.warn(`[mind] ${key}:`, e instanceof Error ? e.message : e));
    n++;
  }
  return n;
}

/** The admin view of one mind. */
export async function mindReport(npcKey: string): Promise<MindReport | null> {
  const m = await mindNpcByKey(npcKey);
  if (!m) return null;
  const [row] = await db.select().from(npcMinds).where(eq(npcMinds.npcId, m.npc.id));
  return {
    npcKey, profile: m.profile.key, stock: row.stock, purse: row.purse, intent: row.intent, lastThinkAt: row.lastThinkAt?.getTime() ?? null,
    decision: row.decision ?? null, memories: row.memory, requests: (await openRequests(m.npc)).map(({ key: _k, ...r }) => r),
  };
}

/** Admin: set stock / purse (testing), and/or think right now. */
export async function adminMind(npcKey: string, opts: { stock?: NpcStock; purse?: number; think?: boolean }): Promise<MindReport | null> {
  const m = await mindNpcByKey(npcKey);
  if (!m) return null;
  if (opts.stock || opts.purse != null) {
    await db.update(npcMinds).set({
      ...(opts.stock ? { stock: sql`${npcMinds.stock} || ${JSON.stringify(opts.stock)}::jsonb` } : {}),
      ...(opts.purse != null ? { purse: Math.max(0, Math.floor(opts.purse)) } : {}),
    }).where(eq(npcMinds.npcId, m.npc.id));
  }
  if (opts.think) await think(m.npc);
  return mindReport(npcKey);
}

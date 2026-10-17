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
import { gatherAt } from "./gatherServer";
import { placeByKey } from "@/lib/nav/places";
import { chatWithFallback } from "@/lib/llm";
import { npcVoice, TALK_RULES } from "@/lib/npcPrompt";
import { plainSpeech } from "@/lib/streamedText";
import { askJev } from "./jev";
import { MIND_INCOME_SCALE, MIND_INTERVAL_MS, isMindNpc, mindNpcKeys } from "./config";
import { markGifted, regardHelped, regardScores, tierFor } from "./regard";
import { MOODS, REQUEST_TTL_MS, URGENCY, affordableQty, count, decisionBasis, errandHaul, feasibleActions, gameDayOf, incomeFor, incomeRate, needsJev, purseTarget, regardTier, requestReward, scriptedPick, stateText, word } from "./profile";
import { profileFor } from "./profiles";
import type { MindDecision, MindIntent, MindMemory, NpcCarry, MindProfile, MindReport, MindView, NearbyPlayer, NpcStock, OpenRequest } from "@/types/mind";

export type NpcRow = typeof npcs.$inferSelect;
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

/** Show what an NPC is carrying over its head (null: nothing). Written only when it changes. */
async function setCarry(npc: NpcRow, carry: NpcCarry | null): Promise<void> {
  const same = (npc.carry ?? null) === null ? carry === null : !!carry && npc.carry!.item === carry.item && npc.carry!.qty === carry.qty;
  if (same) return;
  await db.update(npcs).set({ carry }).where(eq(npcs.id, npc.id));
  npc.carry = carry;
}

/** Another NPC's mind (its stock and purse), when it has one: buying from it or selling to it moves real goods and coins. */
async function mindStock(npcKey: string): Promise<{ npcId: number; stock: NpcStock; purse: number } | null> {
  const m = await mindNpcByKey(npcKey);
  if (!m) return null;
  const [row] = await db.select({ stock: npcMinds.stock, purse: npcMinds.purse }).from(npcMinds).where(eq(npcMinds.npcId, m.npc.id));
  return row ? { npcId: m.npc.id, stock: row.stock, purse: row.purse } : null;
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
export async function say(npc: NpcRow, doing: string, canned: string): Promise<string> {
  const r = await Promise.race([
    chatWithFallback([
      { role: "system", content: `${npcVoice(npc)}\n\nHOW TO TALK:\n${TALK_RULES}\nWrite ONE short line (at most 18 words) that you say out loud right now about what's happening. Plain text, no quotes.` },
      { role: "user", content: doing },
    ], { temperature: 0.9, maxTokens: 60 }).catch(() => null),
    new Promise<null>((res) => setTimeout(() => res(null), 6000)),
  ]);
  const raw = r?.text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<\/?think>/gi, "").split("\n").find((l) => l.trim());
  const text = raw ? plainSpeech(raw).replace(/^["'\s]+|["'\s]+$/g, "") : "";
  return text && text.length <= 160 ? text : canned;
}

export async function speak(npc: NpcRow, text: string, at: { x: number; y: number }, event: string): Promise<void> {
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
    const [seller] = sup?.supplierKey ? await db.select().from(npcs).where(eq(npcs.key, sup.supplierKey)) : [];
    // A supplier's shop, or (gathering) a spot out in the world.
    const at = seller ? { x: seller.homeX, y: seller.homeY } : sup?.spot ? { x: sup.spot.tx * 16 + 8, y: sup.spot.ty * 16 + 8 } : null;
    if (!sup || !at) return { memory: "" };
    const intent: MindIntent = `errand:${item}`;
    const r = await startTrip(npc.id, { key: intent, name: sup.place, ...at });
    if (!r.ok) return { memory: `They wanted to go to ${sup.place} but couldn't find the way.` };
    const verb = seller ? "for" : "to gather";
    await speak(npc, await say(npc, `You're closing up for a bit to walk to ${sup.place} ${verb} ${word(p, item)}.`, `Off to ${sup.place} ${verb} ${word(p, item)}. Back soon!`), pos, `${npc.name} set off to ${sup.place}.`);
    return { memory: `They closed up and set off to ${sup.place} ${verb} ${word(p, item)}.`, intent };
  }
  if (action.startsWith("sell_")) {
    const item = action.slice(5);
    const d = p.sells?.[item];
    const [buyer] = d ? await db.select().from(npcs).where(eq(npcs.key, d.buyerKey)) : [];
    if (!d || !buyer) return { memory: "" };
    const intent: MindIntent = `deliver:${item}`;
    const r = await startTrip(npc.id, { key: intent, name: d.place, x: buyer.homeX, y: buyer.homeY });
    if (!r.ok) return { memory: `They wanted to take their ${word(p, item)} to ${d.place} but couldn't find the way.` };
    await setCarry(npc, { item, qty: v.stock[item] ?? 0 }); // the load, on their back
    await speak(npc, await say(npc, `You're carrying your ${word(p, item)} to ${d.place} to sell.`, `Off to ${d.place} with the ${word(p, item)}!`), pos, `${npc.name} set off to ${d.place}.`);
    return { memory: `They set off to ${d.place} with their ${word(p, item)}.`, intent };
  }
  if (action.startsWith("outing:")) {
    const o = p.outings?.[action.slice(7)];
    const place = o?.placeKey ? await placeByKey(o.placeKey) : undefined;
    const at = place ? { x: place.x, y: place.y } : o?.spot ? { x: o.spot.tx * 16 + 8, y: o.spot.ty * 16 + 8 } : null;
    if (!o || !at) return { memory: "" };
    const intent = action as MindIntent;
    const r = await startTrip(npc.id, { key: intent, name: o.place, ...at });
    if (!r.ok) return { memory: `They meant to ${o.doing} but couldn't find the way.` };
    await speak(npc, await say(npc, `You're closing up for a while to ${o.doing}.`, `Closing up for a bit: off to ${o.place}!`), pos, `${npc.name} set off to ${o.place}.`);
    return { memory: `They closed up to ${o.doing}.`, intent };
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
      // Bought at the supplier's (out of their real stock, when they have a mind), or gathered there
      // for free: with `gather`, really cut from the world (wheat stalks, trees), so it shows.
      const seller = sup.supplierKey ? await mindStock(sup.supplierKey) : null;
      const cut = !sup.supplierKey && sup.gather ? await gatherAt(sup.gather, pos.x, pos.y, sup.buy, now) : null;
      const { qty: n, cost } = errandHaul(sup, mind.purse, seller ? seller.stock[item] ?? 0 : cut);
      const sold = n > 0 && seller ? await adjustStock(seller.npcId, { [item]: -n }, cost) : true;
      if (n > 0 && sold && (await adjustStock(npc.id, { [item]: n }, -cost))) {
        await remember(npc.id, sup.supplierKey ? `They bought ${n} ${word(p, item)} at ${sup.place} for ${cost} coins.` : `They gathered ${n} ${word(p, item)} in ${sup.place}.`, now);
        if (seller) await remember(seller.npcId, `${npc.name} came by and bought ${n} ${item.replace(/_/g, " ")} for ${cost} coins.`, now);
        await setCarry(npc, { item, qty: n }); // carried home, shown over their head
      } else if (n > 0 && seller && sold) await adjustStock(seller.npcId, { [item]: n }, -cost); // couldn't pay after all: put it back
      else if (n === 0) await remember(npc.id, sup.supplierKey ? `${sup.place} had no ${word(p, item)} to sell.` : `They found no ${word(p, item)} in ${sup.place}.`, now);
    } else await remember(npc.id, `They couldn't reach ${sup?.place ?? "the supplier"}.`, now);
    intent = "going_home";
  }
  // A delivery that got there: sell what they carried (the buyer pays from their purse when they have a mind).
  if (intent.startsWith("deliver:") && trip?.destKey === intent && trip.status !== "active") {
    const item = intent.slice(8);
    const d = p.sells?.[item];
    const carried = mind.stock[item] ?? 0;
    if (trip.status === "arrived" && d && carried > 0) {
      const buyer = await mindStock(d.buyerKey);
      const qty = affordableQty(carried, d.price, buyer ? buyer.purse : null);
      const coins = qty * d.price;
      const paid = qty > 0 && buyer ? await adjustStock(buyer.npcId, { [item]: qty }, -coins) : qty > 0;
      if (paid && (await adjustStock(npc.id, { [item]: -qty }, coins))) {
        await setCarry(npc, null);
        await remember(npc.id, `They sold ${qty} ${word(p, item)} at ${d.place} for ${coins} coins.`, now);
        if (buyer) await remember(buyer.npcId, `${npc.name} brought ${qty} ${item.replace(/_/g, " ")} and was paid ${coins} coins.`, now);
      } else await remember(npc.id, `${d.place} couldn't pay for their ${word(p, item)} today.`, now);
    } else if (trip.status !== "arrived") await remember(npc.id, `They couldn't reach ${d?.place ?? "the buyer"}.`, now);
    intent = "going_home";
  }
  // An outing whose way was lost: just head home.
  if (intent.startsWith("outing:") && trip?.destKey === intent && trip.status !== "active" && trip.status !== "arrived") intent = "";
  if (intent === "going_home" && atHome && !onTrip) { intent = ""; await setCarry(npc, null); } // home: the load goes on the pile
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
  const prev = mind.decision ?? null;
  const view: MindView = {
    now, hour, weather: ws?.weather ?? "clear", name: npc.name, atHome, onTrip, intent,
    errandArrived: (intent.startsWith("errand:") || intent.startsWith("deliver:")) && trip?.destKey === intent && trip.status === "arrived",
    arrivedAt: trip?.status === "arrived" && trip.destKey === intent ? trip.updatedAt.getTime() : null,
    gameDay: ws ? gameDayOf(ws.epochStart.getTime(), ws.dayLengthMinutes, now) : 0,
    outingDay: prev?.outingDay ?? {},
    stock: mind.stock, purse: mind.purse, lastCraftAt: mind.lastCraftAt?.getTime() ?? null,
    table: table ? { left: batch ? Math.max(0, batch.qty - batch.taken) : 0, itemKey: batch?.itemKey ?? null, bakedAt: batch?.bakedAt ?? null } : null,
    requests: requests.filter((r) => !r.postedAt || now - r.postedAt <= REQUEST_TTL_MS),
    nearby: await nearbyPlayers(npc.id, pos, now),
    memories: mind.memory,
  };
  const options = feasibleActions(p, view);
  // Only ask Jev for a real choice that changed (src/lib/mind/profile.ts needsJev).
  const basis = decisionBasis(options, view);
  const need = needsJev(prev, basis, options, now);
  const answers = need !== "ask" ? null : await askJev(stateText(p, view), {
    action: { type: "choice", instructions: `What should ${npc.name} do next?`, criteria: Object.fromEntries(options.map((o) => [o.key, o.description])) },
    mood: { type: "score", instructions: `How is ${npc.name} feeling right now?`, criteria: ["Gloomy and fed up", "Tired", "Content", "Cheerful", "Delighted"] },
    urgency: { type: "score", instructions: `How badly does ${npc.name} need more ingredients?`, criteria: ["Plenty left", "It would help", "Needs some soon", "Has run out"] },
  });
  const pick = answers?.choices.action;
  const valid = !!pick && options.some((o) => o.key === pick.choice);
  const useJev = valid && pick!.confidence >= MIN_CONFIDENCE;
  const action = need === "only" ? options[0].key : need === "same" ? prev!.action : useJev ? pick!.choice : scriptedPick(p, view, options);
  const moodScore = answers?.scores.mood;
  const mood = moodScore ? MOODS[Math.max(0, Math.min(MOODS.length - 1, Math.round(moodScore.score)))] : need !== "ask" ? prev?.mood : undefined;
  const runOut = Object.keys(p.asks).some((k) => (view.stock[k] ?? 0) === 0);
  const urgency = answers?.scores.urgency?.score ?? (need !== "ask" ? prev?.urgency : undefined) ?? (runOut ? URGENCY.length - 1 : 1);
  const outingDay = action.startsWith("outing:") ? { ...view.outingDay, [action.slice(7)]: view.gameDay } : view.outingDay;
  const decision: MindDecision = {
    at: now, source: need !== "ask" ? need : useJev ? "jev" : "scripted", action, options: options.map((o) => o.key),
    probabilities: need === "ask" ? pick?.probabilities : prev?.probabilities, confidence: need === "ask" ? pick?.confidence : prev?.confidence, mood, urgency,
    fallback: need !== "ask" || useJev ? undefined : !answers ? "jev unavailable" : !valid ? "invalid choice" : `low confidence ${pick!.confidence.toFixed(2)}`,
    // Jev's answer stands until the situation changes (or REASK_MS): remember when, and from what.
    askedAt: need === "ask" ? now : need === "same" ? prev?.askedAt : undefined,
    basis: need === "only" ? undefined : basis,
    outingDay,
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
  const active = await activePlayers(now);
  for (const key of mindNpcKeys()) {
    const m = await mindNpcByKey(key);
    if (!m || !m.npc.active) continue;
    const [mind] = await db.select({ at: npcMinds.lastThinkAt }).from(npcMinds).where(eq(npcMinds.npcId, m.npc.id));
    if (mind?.at && now - mind.at.getTime() < MIND_INTERVAL_MS) continue;
    // Takings since they last thought, then think with them in the purse.
    if (mind?.at) await payIncome(m.npc.id, m.profile, active, now - mind.at.getTime()).catch((e) => console.warn(`[mind] ${key} income:`, e instanceof Error ? e.message : e));
    await think(m.npc, now).catch((e) => console.warn(`[mind] ${key}:`, e instanceof Error ? e.message : e));
    n++;
  }
  return n;
}

/** Players active in the last day: the income scales with them. */
async function activePlayers(now: number): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(characters).where(gte(characters.lastSeenAt, new Date(now - ACTIVE_WINDOW_MS)));
  return r?.n ?? 0;
}
const ACTIVE_WINDOW_MS = 24 * 3600_000;

/**
 * Add a mind's takings from villagers you don't see (`elapsedMs` of them),
 * up to its purse target. A purse already above the target (sales) is left
 * alone, never cut.
 */
async function payIncome(npcId: number, p: MindProfile, active: number, elapsedMs: number): Promise<void> {
  const coins = incomeFor(incomeRate(p, active, MIND_INCOME_SCALE), elapsedMs);
  if (coins <= 0) return;
  const target = purseTarget(p, active, MIND_INCOME_SCALE);
  await db.update(npcMinds)
    .set({ purse: sql`least(${target}, ${npcMinds.purse} + ${coins})` })
    .where(and(eq(npcMinds.npcId, npcId), sql`${npcMinds.purse} < ${target}`));
}

/** What a mind NPC has in its purse right now; null for NPCs without a mind (they always pay). */
export async function mindPurse(npcKey: string): Promise<number | null> {
  const m = await mindNpcByKey(npcKey);
  if (!m) return null;
  const [row] = await db.select({ purse: npcMinds.purse }).from(npcMinds).where(eq(npcMinds.npcId, m.npc.id));
  return row?.purse ?? 0;
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

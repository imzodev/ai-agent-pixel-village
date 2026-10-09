// Business agents, the server part. A sponsor's agent walks its patrol,
// pitches the business to players close by, and buys what its shopping list
// says from real sellers, spending only its budget. Jev chooses the action
// (src/lib/mind/jev.ts); the scripted policy decides when Jev can't. Pure
// rules are in src/lib/mind/business.ts; settings are validated in
// src/lib/businessConfig.ts.
//
// Money: the purse is the budget left this period (npc_minds.purse), changed
// only through adjustStock. Every purchase and grant is a row in agent_ledger.
// Coins a business agent spends go to the seller's purse or are a sink at an
// infinite shop; nothing is paid to players here.
//
// Safe for tickd: imports no seed code.

import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { agentLedger, agentOptouts, agentProfiles, characters, conversations, npcMinds, npcTrips, npcs, pitchLog, sponsorEvents, sponsors, worldState } from "@/db/schema";
import { rowPositionAt } from "@/lib/motion";
import { gameHour } from "@/lib/worldmap";
import { allPlaces } from "@/lib/nav/places";
import { startTrip } from "@/lib/nav/trips";
import { SHOP_STOCK, stockForNpc } from "@/lib/trade";
import { cleanAgentText } from "@/lib/moderation";
import { isMindNpc } from "./config";
import { askJev } from "./jev";
import { MIN_CONFIDENCE, adjustStock, remember, say, shelfSale, speak, undoShelfSale, type NpcRow } from "./mindServer";
import { businessActions, businessScriptedPick, businessStateText } from "./business";
import { DEFAULT_COOLDOWN_MIN, type BusinessSettings } from "@/lib/businessConfig";
import type { MindDecision, MindIntent } from "@/types/mind";
import type { BudgetPeriod, BusinessConfig, BusinessView, PitchTarget, ShopOption, ShoppingRule } from "@/types/businessAgent";

/** Within this of their business they're "at home". */
const HOME_PX = 12 * 16;
/** Players this close can be pitched. */
const PITCH_PX = 200;
const PITCH_ACTIVE_MS = 60_000;
/** Per agent, per hour. */
const PITCH_HOURLY_CAP = 6;
/** Per player, per day, across every agent. */
const PITCH_DAILY_PLAYER_CAP = 10;
const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;
const PERIOD_MS: Record<BudgetPeriod, number> = { day: DAY_MS, week: 7 * DAY_MS };

const intervalMs = () => Number(process.env.BUSINESS_MIND_INTERVAL_MS ?? 60_000);
const maxPerTick = () => Number(process.env.BUSINESS_AGENTS_MAX_PER_TICK ?? 5);
export const businessEnabled = () => process.env.BUSINESS_AGENTS_ENABLED !== "0";

type ProfileRow = typeof agentProfiles.$inferSelect;

// ── Rows ──────────────────────────────────────────────────────────────────

/** Make sure an NPC has its settings row and its purse. Defaults give no budget: no free coins. */
export async function ensureBusiness(npcId: number, sponsorId: number, now = Date.now()): Promise<void> {
  await db.insert(agentProfiles).values({ npcId, sponsorId, periodStart: new Date(now) }).onConflictDoNothing();
  await db.insert(npcMinds).values({ npcId, stock: {}, purse: 0 }).onConflictDoNothing();
}

/** The settings as the mind reads them (pitch falls back to the sponsor's own pitch). */
async function loadConfig(profile: ProfileRow): Promise<{ cfg: BusinessConfig; sponsorName: string; sponsorPitch: string }> {
  const [sp] = await db.select().from(sponsors).where(eq(sponsors.id, profile.sponsorId));
  const pitchLines = profile.pitchLines.length ? profile.pitchLines : sp ? [sp.pitch] : [];
  return {
    cfg: {
      npcId: profile.npcId,
      sponsorId: profile.sponsorId,
      pitchLines,
      patrol: profile.patrol,
      shopping: profile.shopping as ShoppingRule[],
      budgetCoins: profile.budgetCoins,
      budgetPeriod: profile.budgetPeriod as BudgetPeriod,
      pitchCooldownMs: (profile.pitchCooldownMin ?? DEFAULT_COOLDOWN_MIN) * 60_000,
      enabled: profile.enabled,
    },
    sponsorName: sp?.businessName ?? "the business",
    sponsorPitch: sp?.pitch ?? "",
  };
}

/** Start a new budget period when the old one has run out. Purse is reset, never accumulated. */
export async function refillBudgets(now = Date.now()): Promise<number> {
  const profiles = await db.select().from(agentProfiles);
  let n = 0;
  for (const p of profiles) {
    const period = PERIOD_MS[p.budgetPeriod as BudgetPeriod] ?? DAY_MS;
    if (p.periodStart.getTime() + period > now) continue;
    await db.update(npcMinds).set({ purse: p.budgetCoins }).where(eq(npcMinds.npcId, p.npcId));
    await db.update(agentProfiles).set({ periodStart: new Date(now) }).where(eq(agentProfiles.npcId, p.npcId));
    if (p.budgetCoins > 0) await db.insert(agentLedger).values({ npcId: p.npcId, sponsorId: p.sponsorId, kind: "grant", coins: p.budgetCoins, note: `${p.budgetPeriod} budget` });
    n++;
  }
  return n;
}

/** How many of this item the agent has bought this period. */
async function boughtThisPeriod(profile: ProfileRow, itemKey: string): Promise<number> {
  const rows = await db.select({ qty: agentLedger.qty }).from(agentLedger).where(and(
    eq(agentLedger.npcId, profile.npcId), eq(agentLedger.kind, "purchase"), eq(agentLedger.itemKey, itemKey),
    gte(agentLedger.at, profile.periodStart),
  ));
  return rows.reduce((s, r) => s + (r.qty ?? 0), 0);
}

// ── What the agent can see and do ──────────────────────────────────────────

/** Players close by that it may pitch right now (cooldowns, opt-outs and caps applied). */
async function pitchTargets(npc: NpcRow, cfg: BusinessConfig, pos: { x: number; y: number }, now: number): Promise<PitchTarget[]> {
  const perHour = await db.select({ at: pitchLog.at }).from(pitchLog).where(and(eq(pitchLog.npcId, npc.id), gte(pitchLog.at, new Date(now - HOUR_MS))));
  if (perHour.length >= PITCH_HOURLY_CAP) return [];
  const close = await db.select({ id: characters.id, name: characters.name, x: characters.x, y: characters.y }).from(characters).where(and(
    gte(characters.lastSeenAt, new Date(now - PITCH_ACTIVE_MS)),
    gte(characters.x, pos.x - PITCH_PX), lte(characters.x, pos.x + PITCH_PX),
    gte(characters.y, pos.y - PITCH_PX), lte(characters.y, pos.y + PITCH_PX),
  )).limit(40);
  if (!close.length) return [];
  const ids = close.map((c) => c.id);
  const optedOut = new Set((await db.select({ characterId: agentOptouts.characterId }).from(agentOptouts).where(and(
    inArray(agentOptouts.characterId, ids), inArray(agentOptouts.sponsorId, [0, cfg.sponsorId]),
  ))).map((r) => r.characterId));
  const recent = new Set((await db.select({ characterId: pitchLog.characterId }).from(pitchLog).where(and(
    eq(pitchLog.npcId, npc.id), gte(pitchLog.at, new Date(now - cfg.pitchCooldownMs)),
  ))).map((r) => r.characterId));
  const day = await db.select({ characterId: pitchLog.characterId }).from(pitchLog).where(and(
    inArray(pitchLog.characterId, ids), gte(pitchLog.at, new Date(now - DAY_MS)),
  ));
  const perPlayer = new Map<number, number>();
  for (const r of day) perPlayer.set(r.characterId, (perPlayer.get(r.characterId) ?? 0) + 1);
  return close
    .filter((c) => !optedOut.has(c.id) && !recent.has(c.id) && (perPlayer.get(c.id) ?? 0) < PITCH_DAILY_PLAYER_CAP)
    .sort((a, b) => Math.hypot(a.x - pos.x, a.y - pos.y) - Math.hypot(b.x - pos.x, b.y - pos.y))
    .map((c) => ({ id: c.id, name: c.name }));
}

/** The cheapest reachable seller for each shopping rule the budget can pay for now. */
async function shopOptions(profile: ProfileRow, cfg: BusinessConfig, purse: number): Promise<{ options: ShopOption[]; sellers: Map<string, NpcRow> }> {
  const options: ShopOption[] = [];
  const sellerKeys = Object.keys(SHOP_STOCK);
  const rows = await db.select().from(npcs).where(inArray(npcs.key, sellerKeys));
  const sellers = new Map(rows.map((r) => [r.key, r]));
  const stock = rows.length ? await db.select().from(npcMinds).where(inArray(npcMinds.npcId, rows.map((r) => r.id))) : [];
  const stockOf = new Map(stock.map((m) => [m.npcId, m.stock]));
  for (const rule of cfg.shopping) {
    const left = rule.perPeriod - (await boughtThisPeriod(profile, rule.itemKey));
    if (left <= 0) continue;
    let best: ShopOption | null = null;
    for (const key of sellerKeys) {
      const seller = sellers.get(key);
      const item = stockForNpc(key).find((i) => i.itemKey === rule.itemKey);
      if (!seller || !item) continue;
      if (item.price > rule.maxPrice || item.price > purse) continue;
      // A mind seller keeps a shelf: it must have one to sell.
      if (isMindNpc(key) && (stockOf.get(seller.id)?.[rule.itemKey] ?? 0) < 1) continue;
      if (!best || item.price < best.price) best = { itemKey: rule.itemKey, sellerKey: key, price: item.price, purchasesLeft: left };
    }
    if (best) options.push(best);
  }
  return { options, sellers };
}

// ── Acting ─────────────────────────────────────────────────────────────────

async function pitchPlayer(npc: NpcRow, cfg: BusinessConfig, sponsorName: string, sponsorPitch: string, target: PitchTarget, pos: { x: number; y: number }, now: number): Promise<void> {
  const pitch = cfg.pitchLines.length ? cfg.pitchLines[Math.floor(Math.random() * cfg.pitchLines.length)] : sponsorPitch;
  const canned = `${target.name}, ${pitch}`;
  const line = cleanAgentText(await say(npc, `You're chatting with ${target.name} about ${sponsorName}. Say one friendly line about it: ${pitch}. No links, no promises.`, canned), 140);
  await speak(npc, line, pos, `${npc.name} told ${target.name} about ${sponsorName}.`);
  await db.insert(conversations).values({ characterId: target.id, npcId: npc.id, role: "npc", text: line });
  await db.insert(pitchLog).values({ npcId: npc.id, characterId: target.id, at: new Date(now) });
  await db.insert(sponsorEvents).values({ sponsorId: cfg.sponsorId, characterId: target.id, type: "impression", meta: { npcId: npc.id, source: "business_agent" } });
  await remember(npc.id, `Told ${target.name} about ${sponsorName}.`, now);
}

/** Buy one unit at the seller. The buyer is debited first; a refused sale is refunded. */
async function buyAt(npc: NpcRow, profile: ProfileRow, cfg: BusinessConfig, itemKey: string, sellerKey: string, sellerName: string, pos: { x: number; y: number }, now: number): Promise<void> {
  const item = stockForNpc(sellerKey).find((i) => i.itemKey === itemKey);
  const price = item?.price ?? Infinity;
  const left = (cfg.shopping.find((r) => r.itemKey === itemKey)?.perPeriod ?? 0) - (await boughtThisPeriod(profile, itemKey));
  if (!item || left <= 0) return;
  const paid = await adjustStock(npc.id, { [itemKey]: 1 }, -price);
  if (!paid) {
    await remember(npc.id, `Couldn't afford ${itemKey.replace(/_/g, " ")} at ${sellerName}.`, now);
    return;
  }
  const sale = await shelfSale(sellerKey, itemKey, 1, price);
  if (sale.handled && !sale.ok) {
    await adjustStock(npc.id, { [itemKey]: -1 }, price);
    await remember(npc.id, `${sellerName} had sold out of ${itemKey.replace(/_/g, " ")}.`, now);
    return;
  }
  await db.insert(agentLedger).values({ npcId: npc.id, sponsorId: cfg.sponsorId, kind: "purchase", coins: -price, itemKey, qty: 1, counterparty: `npc:${sellerKey}`, note: sellerName });
  await remember(npc.id, `Bought ${itemKey.replace(/_/g, " ")} from ${sellerName} for ${price} coins.`, now);
  await speak(npc, await say(npc, `You just bought ${itemKey.replace(/_/g, " ")} from ${sellerName}.`, `Lovely, one ${itemKey.replace(/_/g, " ")} from ${sellerName}.`), pos, `${npc.name} bought ${itemKey.replace(/_/g, " ")} from ${sellerName}.`);
}

/** Carry the chosen action out. Returns the new intent, if any. */
async function act(
  npc: NpcRow, profile: ProfileRow, cfg: BusinessConfig, sponsorName: string, sponsorPitch: string,
  action: string, v: BusinessView, sellers: Map<string, NpcRow>, now: number,
): Promise<MindIntent | undefined> {
  const pos = rowPositionAt(npc, now);
  if (action.startsWith("pitch:p")) {
    const id = Number(action.slice(7));
    const target = v.pitchTargets.find((t) => t.id === id);
    if (target) await pitchPlayer(npc, cfg, sponsorName, sponsorPitch, target, pos, now);
    return undefined;
  }
  if (action.startsWith("shop:")) {
    const item = action.slice(5);
    const opt = v.shopOptions.find((o) => o.itemKey === item);
    const seller = opt ? sellers.get(opt.sellerKey) : undefined;
    if (!opt || !seller) return undefined;
    const sellerName = seller.name;
    const dest = `shop:${item}|${opt.sellerKey}` as MindIntent;
    const r = await startTrip(npc.id, { key: dest, name: sellerName, x: seller.homeX, y: seller.homeY });
    if (!r.ok) {
      await remember(npc.id, `Couldn't find the way to ${sellerName}.`, now);
      return undefined;
    }
    await remember(npc.id, `Walked to ${sellerName} to buy ${item.replace(/_/g, " ")}.`, now);
    return dest;
  }
  if (action.startsWith("patrol:")) {
    const key = action.slice(7);
    const place = (await allPlaces()).find((p) => p.key === key);
    if (!place) return undefined;
    const dest = `patrol:${key}` as MindIntent;
    const r = await startTrip(npc.id, { key: dest, name: place.name, x: place.x, y: place.y });
    if (!r.ok) {
      await remember(npc.id, `Couldn't find the way to ${place.name}.`, now);
      return undefined;
    }
    return dest;
  }
  if (action === "go_home") {
    const r = await startTrip(npc.id, { key: "going_home", name: "the business", x: npc.homeX, y: npc.homeY });
    return r.ok ? "going_home" : undefined;
  }
  if (action === "tend") {
    const eat = Object.entries(v.pantry).find(([, n]) => n > 0)?.[0];
    if (eat) {
      await adjustStock(npc.id, { [eat]: -1 });
      await remember(npc.id, `Had a ${eat.replace(/_/g, " ")} from the pantry.`, now);
    }
  }
  return undefined;
}

// ── One think ─────────────────────────────────────────────────────────────

export async function thinkBusiness(profile: ProfileRow, now = Date.now()): Promise<MindDecision | null> {
  const [npc] = await db.select().from(npcs).where(eq(npcs.id, profile.npcId));
  if (!npc) return null;
  await ensureBusiness(npc.id, profile.sponsorId, now);
  const { cfg, sponsorName, sponsorPitch } = await loadConfig(profile);
  const [mind] = await db.select().from(npcMinds).where(eq(npcMinds.npcId, npc.id));
  const [ws] = await db.select().from(worldState).where(eq(worldState.id, 1));
  const hour = ws ? gameHour(ws.epochStart.getTime(), ws.dayLengthMinutes, now) : 12;
  const pos = rowPositionAt(npc, now);
  const atHome = Math.hypot(pos.x - npc.homeX, pos.y - npc.homeY) <= HOME_PX;
  const [trip] = await db.select().from(npcTrips).where(eq(npcTrips.npcId, npc.id));
  const onTrip = trip?.status === "active";
  let intent = mind.intent;

  // A trip that just finished: buy at the shop, or note the visit.
  if (intent && trip && trip.destKey === intent && trip.status !== "active") {
    if (intent.startsWith("shop:") && trip.status === "arrived") {
      const [item, sellerKey] = intent.slice(5).split("|");
      const [seller] = await db.select().from(npcs).where(eq(npcs.key, sellerKey));
      if (seller) await buyAt(npc, profile, cfg, item, sellerKey, seller.name, pos, now);
    } else if (intent.startsWith("patrol:") && trip.status === "arrived") {
      await remember(npc.id, `Looked around ${trip.destName}.`, now);
    } else if (trip.status === "failed") {
      await remember(npc.id, `Couldn't reach ${trip.destName}.`, now);
    }
    intent = intent.startsWith("patrol:") ? "" : "going_home";
  }
  if (intent === "going_home" && atHome && !onTrip) intent = "";

  const pitch = await pitchTargets(npc, cfg, pos, now);
  const { options: shops, sellers } = await shopOptions(profile, cfg, mind.purse);
  const places = await allPlaces();
  const placeNames = Object.fromEntries(places.map((p) => [p.key, p.name]));
  const patrolCandidates = cfg.patrol.filter((k) => {
    const p = places.find((x) => x.key === k);
    return !!p && Math.hypot(p.x - pos.x, p.y - pos.y) > 32;
  });
  const view: BusinessView = {
    now, hour, atHome, onTrip, intent, purse: mind.purse,
    pantry: mind.stock, pitchTargets: pitch, shopOptions: shops,
    patrolCandidates, placeNames: { ...placeNames, ...Object.fromEntries([...sellers].map(([k, s]) => [k, s.name])) },
    memories: mind.memory.map((m) => m.text),
  };
  // Not every mind seller can be named; fall back to the key.
  for (const o of shops) view.placeNames[o.sellerKey] ??= o.sellerKey;

  const options = businessActions(view);
  const answers = await askJev(businessStateText(view), {
    action: { type: "choice", instructions: `What should ${npc.name} do next?`, criteria: Object.fromEntries(options.map((o) => [o.key, o.description])) },
  });
  const pick = answers?.choices.action;
  const valid = !!pick && options.some((o) => o.key === pick.choice);
  const useJev = valid && pick!.confidence >= MIN_CONFIDENCE;
  const action = useJev ? pick!.choice : businessScriptedPick(options);
  const decision: MindDecision = {
    at: now, source: useJev ? "jev" : "scripted", action, options: options.map((o) => o.key),
    probabilities: pick?.probabilities, confidence: pick?.confidence,
    fallback: useJev ? undefined : !answers ? "jev unavailable" : !valid ? "invalid choice" : `low confidence ${pick!.confidence.toFixed(2)}`,
  };

  const newIntent = await act(npc, profile, cfg, sponsorName, sponsorPitch, action, view, sellers, now);
  await db.update(npcMinds).set({
    intent: newIntent ?? intent, lastThinkAt: new Date(now), decision,
  }).where(eq(npcMinds.npcId, npc.id));
  return decision;
}

/**
 * tickd, every beat: each enabled sponsored agent whose think is due thinks
 * once (capped per tick). Sponsored NPCs with no settings row get defaults.
 */
export async function thinkBusinessAgents(now = Date.now()): Promise<number> {
  if (!businessEnabled()) return 0;
  await refillBudgets(now).catch((err) => console.warn("[business] budget refill failed:", err instanceof Error ? err.message : err));
  const sponsored = await db.select({ id: npcs.id, sponsorId: npcs.sponsorId }).from(npcs).innerJoin(sponsors, eq(sponsors.id, npcs.sponsorId))
    .where(and(eq(npcs.active, true), eq(npcs.kind, "builtin"), eq(sponsors.status, "active")));
  for (const s of sponsored) if (s.sponsorId) await ensureBusiness(s.id, s.sponsorId, now);

  const profiles = await db.select({ profile: agentProfiles, npcKey: npcs.key }).from(agentProfiles).innerJoin(npcs, eq(npcs.id, agentProfiles.npcId))
    .innerJoin(sponsors, eq(sponsors.id, agentProfiles.sponsorId))
    .where(and(eq(agentProfiles.enabled, true), eq(agentProfiles.mode, "builtin"), eq(npcs.active, true), eq(sponsors.status, "active")));
  if (!profiles.length) return 0;
  const minds = await db.select({ npcId: npcMinds.npcId, at: npcMinds.lastThinkAt }).from(npcMinds).where(inArray(npcMinds.npcId, profiles.map((p) => p.profile.npcId)));
  const lastThink = new Map(minds.map((m) => [m.npcId, m.at?.getTime() ?? 0]));
  let n = 0;
  for (const row of profiles) {
    if (n >= maxPerTick()) break;
    const controllerUntil = row.profile.controllerUntil;
    if (controllerUntil && controllerUntil > now) continue;
    if (now - (lastThink.get(row.profile.npcId) ?? 0) < intervalMs()) continue;
    await thinkBusiness(row.profile, now).catch((e) => console.warn(`[business] ${row.npcKey}:`, e instanceof Error ? e.message : e));
    n++;
  }
  return n;
}

/** Sponsor dashboard: settings, the recent ledger and pitch counts. */
export async function businessSummary(sponsorId: number, now = Date.now()) {
  const [profile] = await db.select().from(agentProfiles).where(eq(agentProfiles.sponsorId, sponsorId)).limit(1);
  if (!profile) return null;
  const [mind] = await db.select().from(npcMinds).where(eq(npcMinds.npcId, profile.npcId));
  const ledger = await db.select().from(agentLedger).where(eq(agentLedger.npcId, profile.npcId)).orderBy(desc(agentLedger.id)).limit(20);
  const pitches = await db.select({ at: pitchLog.at }).from(pitchLog).where(and(eq(pitchLog.npcId, profile.npcId), gte(pitchLog.at, new Date(now - DAY_MS))));
  return {
    settings: {
      pitchLines: profile.pitchLines, patrol: profile.patrol, shopping: profile.shopping,
      budgetCoins: profile.budgetCoins, budgetPeriod: profile.budgetPeriod, pitchCooldownMin: profile.pitchCooldownMin,
      enabled: profile.enabled, mode: profile.mode,
    },
    purse: mind?.purse ?? 0,
    pantry: mind?.stock ?? {},
    lastDecision: mind?.decision ?? null,
    pitchesLast24h: pitches.length,
    ledger: ledger.map((l) => ({ at: l.at.getTime(), kind: l.kind, coins: l.coins, itemKey: l.itemKey, counterparty: l.counterparty, note: l.note })),
  };
}

/**
 * Save the sponsor's settings. A budget is granted to the purse once per
 * period (the first time it's set), so re-saving it can't mint coins; after
 * that a lower budget only trims the purse.
 */
export async function saveSettings(npcId: number, sponsorId: number, value: Partial<BusinessSettings>, now = Date.now()): Promise<void> {
  await ensureBusiness(npcId, sponsorId, now);
  const { budgetCoins, ...rest } = value;
  if (Object.keys(rest).length) await db.update(agentProfiles).set({ ...rest, updatedAt: new Date(now) }).where(eq(agentProfiles.npcId, npcId));
  if (budgetCoins === undefined) return;
  const [profile] = await db.select().from(agentProfiles).where(eq(agentProfiles.npcId, npcId));
  await db.update(agentProfiles).set({ budgetCoins, updatedAt: new Date(now) }).where(eq(agentProfiles.npcId, npcId));
  const [granted] = await db.select({ id: agentLedger.id }).from(agentLedger).where(and(
    eq(agentLedger.npcId, npcId), eq(agentLedger.kind, "grant"), gte(agentLedger.at, profile.periodStart),
  )).limit(1);
  if (!granted) {
    await db.update(npcMinds).set({ purse: budgetCoins }).where(eq(npcMinds.npcId, npcId));
    await db.insert(agentLedger).values({ npcId, sponsorId, kind: "grant", coins: budgetCoins, note: "budget set" });
  } else {
    await db.update(npcMinds).set({ purse: sql`least(${npcMinds.purse}, ${budgetCoins})` }).where(eq(npcMinds.npcId, npcId));
  }
}

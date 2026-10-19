// A mind, the pure part shared by every kind of NPC (profiles in
// src/lib/mind/profiles.ts): which actions it can take right now (only
// those reach Jev), the scripted policy used when Jev is unavailable or
// unsure, and the plain-words state Jev decides from. No DB here
// (src/lib/mind/mindServer.ts carries the decision out).

import { caravanActions } from "./caravan";
import type { CraftRecipe, MindDecision, MindOption, MindProfile, MindView, NpcStock, RegardTier, SellDef, SellTarget, SupplyDef } from "@/types/mind";

/** The five moods Jev scores, low to high. */
export const MOODS = ["gloomy", "tired", "content", "cheerful", "delighted"] as const;
/** How much they need what they ask for, low to high (reward ×). */
export const URGENCY = [0.8, 1, 1.4, 2] as const;
/** Open requests close after this. */
export const REQUEST_TTL_MS = 2 * 3600_000;
/** With nothing changed, Jev's last answer stands this long before it's asked again. */
export const REASK_MS = 30 * 60_000;

// ── When to ask Jev ───────────────────────────────────────────────────
// Every think used to ask, once a minute, all day: ~1,440 calls per NPC,
// most of them with one thing to do or the same choice as a minute ago.

/** What a decision depends on: what they can do, who's around, what they're in the middle of. */
export function decisionBasis(options: readonly MindOption[], v: Pick<MindView, "nearby" | "intent">): string {
  return `${options.map((o) => o.key).sort().join(",")}|${v.nearby.map((x) => x.id).sort((a, b) => a - b).join(",")}|${v.intent}`;
}

/**
 * Does this think need Jev? Not with a single thing to do, nor when nothing
 * changed since Jev last chose (same options, same people, same intent)
 * less than REASK_MS ago: its answer still stands.
 */
export function needsJev(prev: MindDecision | null, basis: string, options: readonly MindOption[], now: number): "ask" | "only" | "same" {
  if (options.length <= 1) return "only";
  if (prev?.basis === basis && prev.askedAt != null && now - prev.askedAt < REASK_MS && options.some((o) => o.key === prev.action)) return "same";
  return "ask";
}

const have = (s: NpcStock, k: string) => s[k] ?? 0;
export const word = (p: MindProfile, item: string) => p.words[item] ?? item.replace(/_/g, " ");
/** "1 stone sword", "20 arrows". */
export const count = (p: MindProfile, n: number, item: string) => `${n} ${n === 1 ? word(p, item).replace(/s$/, "") : word(p, item)}`;
/** A trade between villagers, for the news ticker: "🌾 Rowan sold 12 wheat to Hollis's mill." */
export const tradeEventText = (icon: string | undefined, name: string, sold: boolean, qty: number, what: string, place: string) =>
  `${icon ? `${icon} ` : ""}${name} ${sold ? "sold" : "bought"} ${qty} ${what} ${sold ? "to" : "at"} ${place}.`;

// ── Income ────────────────────────────────────────────────────────────
// A mind's purse refills from villagers you don't see, in step with how many
// players there are (active in the last day): more players selling to them,
// more coins to pay with.

/** Income is paid for at most this much time away (a stopped tickd doesn't pay a week at once). */
export const INCOME_MAX_ELAPSED_MS = 24 * 3600_000;

/** Coins an hour, with `active` players. */
export function incomeRate(p: MindProfile, active: number, scale = 1): number {
  return (p.income.basePerHour + p.income.perPlayerPerHour * Math.max(0, active)) * scale;
}

/** The purse refills up to this, with `active` players. */
export function purseTarget(p: MindProfile, active: number, scale = 1): number {
  return Math.round((p.income.baseTarget + p.income.perPlayerTarget * Math.max(0, active)) * scale);
}

/** Whole coins earned at `perHour` over `elapsedMs` (capped). */
export function incomeFor(perHour: number, elapsedMs: number): number {
  const ms = Math.min(Math.max(0, elapsedMs), INCOME_MAX_ELAPSED_MS);
  return Math.floor((perHour * ms) / 3600_000);
}

/** How many of a sale a buyer with `purse` coins can pay for at `unit` each (all if no purse limit). */
export function affordableQty(qty: number, unit: number, purse: number | null): number {
  if (purse == null || unit <= 0) return qty;
  return Math.max(0, Math.min(qty, Math.floor(purse / unit)));
}

/** Why a buyer turned a sale down: how much they have against what one costs them. */
export function cantAffordText(buyer: string, purse: number, itemKey: string, unit: number): string {
  return `${buyer} only has ${purse} 🪙 right now (one ${itemKey.replace(/_/g, " ")} costs ${Math.round(unit)}). Come back a little later.`;
}

/** Regard score → how they feel. */
export function regardTier(score: number): RegardTier {
  return score >= 10 ? "dear" : score >= 4 ? "fond" : score <= -3 ? "cool" : "neutral";
}

/** Did this change of regard just make the player a dear friend? */
export const becameDear = (before: number, after: number): boolean => regardTier(after) === "dear" && regardTier(before) !== "dear";

/**
 * What an errand brings back: bought (as many as the purse pays for, up to
 * `buy`, and no more than the supplier has when it keeps real stock) or, with
 * no supplier, gathered (`buy`, free).
 */
export function errandHaul(s: SupplyDef, purse: number, supplierHas: number | null = null): { qty: number; cost: number } {
  if (!s.supplierKey || s.price <= 0) return { qty: Math.min(s.buy, supplierHas ?? s.buy), cost: 0 };
  const qty = Math.max(0, Math.min(s.buy, Math.floor(purse / s.price), supplierHas ?? Infinity));
  return { qty, cost: qty * s.price };
}

/** Which game day it is (days turn at midnight, as gameHour counts them: the world starts at 7:00). */
export function gameDayOf(epochStartMs: number, dayLengthMinutes: number, now: number): number {
  return Math.floor(((now - epochStartMs) / (dayLengthMinutes * 60_000)) + 7 / 24);
}

/** Can they make a batch from their stock? */
export function canCraft(stock: NpcStock, r: CraftRecipe): boolean {
  return Object.entries(r.uses).every(([k, n]) => have(stock, k) >= n);
}

/** Reward for a request: per-item pay × urgency, at least 3 coins. */
export function requestReward(p: MindProfile, itemKey: string, qty: number, urgency: number): number {
  const mult = URGENCY[Math.max(0, Math.min(URGENCY.length - 1, Math.round(urgency)))];
  return Math.max(3, Math.round((p.asks[itemKey]?.pay ?? 2) * qty * mult));
}

/** Who a delivery can go to: its `to` list, or its one buyer. */
export const sellTargets = (d: SellDef): readonly SellTarget[] => (d.to?.length ? d.to : [{ buyerKey: d.buyerKey, place: d.place }]);

/** "Hettie's inn or Ivy's inn": the places a delivery may go, in words. */
const placesOf = (d: SellDef) => { const t = sellTargets(d).map((x) => x.place); return t.length > 1 ? `${t.slice(0, -1).join(", ")} or ${t[t.length - 1]}` : t[0]; };

/** The item of a delivery intent (`deliver:cheese@1` → cheese) and which buyer it's for. */
export function deliveryOf(intent: string): { item: string; target: number } | null {
  if (!intent.startsWith("deliver:")) return null;
  const [item, i] = intent.slice(8).split("@");
  return { item, target: Number(i) || 0 };
}

/** The actions they can take right now, each with what it means. */
export function feasibleActions(p: MindProfile, v: MindView): MindOption[] {
  // A caravan travels its circuit (src/lib/mind/caravan.ts).
  if (p.circuit?.length) return caravanActions(p, v);
  // Walking somewhere: nothing to decide until they get there (and no Jev call: one option).
  if (v.onTrip) return [{ key: "wait", description: "Keep walking" }];
  const out: MindOption[] = [];
  const working = v.atHome && !v.onTrip;
  const rested = v.lastCraftAt == null || v.now - v.lastCraftAt >= p.minCraftGapMs;
  const tableFree = !!v.table && (v.table.left === 0 || (v.table.bakedAt != null && v.now - v.table.bakedAt >= p.tableStaleMs));
  if (working && rested) {
    for (const [key, r] of Object.entries(p.crafts)) {
      if (!canCraft(v.stock, r) || have(v.stock, r.itemKey) >= (p.shelfCap?.[r.itemKey] ?? p.shelfFull)) continue;
      if (r.toTable > 0 && !tableFree) continue;
      const uses = Object.entries(r.uses).map(([k, n]) => `${n} ${word(p, k)}`).join(" and ");
      out.push({ key, description: `${r.verb[0].toUpperCase()}${r.verb.slice(1)} (uses ${uses}${r.toTable ? `; ${r.toTable} go on the free table, the rest on the shelf to sell` : "; for the shelf, to sell"})` });
    }
  }
  const errand = v.intent.startsWith("errand:") || v.intent.startsWith("deliver:");
  // Gatherers carry what they've gathered to whoever buys it (the farmhand's wheat to the mill).
  for (const [item, d] of Object.entries(p.sells ?? {})) {
    const n = have(v.stock, item) - (d.keep ?? 0);
    if (working && !errand && n >= d.min) {
      out.push({ key: `sell_${item}`, description: d.to?.length ? `Carry their ${n} ${word(p, item)} to ${placesOf(d)}, whichever pays most now, and sell them` : `Carry their ${n} ${word(p, item)} to ${d.place} and sell them (${d.price} coins each)` });
    }
  }
  for (const [item, s] of Object.entries(p.supplies)) {
    if (working && !errand && have(v.stock, item) < s.low && v.purse >= s.price * 2) {
      out.push({ key: `buy_${item}`, description: s.supplierKey ? `Close up and walk to ${s.place} to buy ${word(p, item)} (${s.price} coins each)` : `Close up and walk to ${s.place} to gather ${word(p, item)} (free, but a walk)` });
    }
  }
  // Outings: somewhere to go at this time of day, once a game day.
  for (const [key, o] of Object.entries(p.outings ?? {})) {
    const inHours = v.hour >= o.hours[0] && v.hour < o.hours[1];
    if (working && !errand && inHours && v.outingDay[key] !== v.gameDay) out.push({ key: `outing:${key}`, description: `Close up for a while and ${o.doing}` });
  }
  const asked = new Set(v.requests.map((r) => r.itemKey));
  for (const [item, a] of Object.entries(p.asks)) {
    if (have(v.stock, item) < a.low && !asked.has(item) && v.purse >= 3) {
      out.push({ key: `ask_${item}`, description: `Ask the villagers to bring ${a.qty} ${word(p, item)}, paying for them from the purse` });
    }
  }
  if (p.gift && have(v.stock, p.gift.itemKey) >= p.gift.qty) {
    for (const f of v.nearby.filter((x) => (x.tier === "fond" || x.tier === "dear") && !x.giftedToday).slice(0, 3)) {
      out.push({ key: `gift:${f.id}`, description: `Give ${f.name} (${f.tier === "dear" ? "a dear friend" : "someone they're fond of"}) ${p.gift.qty > 1 ? `${p.gift.qty} ${word(p, p.gift.itemKey)}` : `a ${word(p, p.gift.itemKey).replace(/s$/, "")}`} from the shelf` });
    }
  }
  // Home again: after an errand, or once an outing has lasted its while.
  const outing = v.intent.startsWith("outing:") ? p.outings?.[v.intent.slice(7)] : undefined;
  const outingDone = !outing || (v.arrivedAt != null && v.now - v.arrivedAt >= outing.lingerMs);
  if (!v.atHome && !v.onTrip && (!errand || v.errandArrived) && outingDone) out.push({ key: "go_home", description: outing ? `Head back home to work (they've been at ${outing.place} a while)` : "Walk back home to work" });
  if (v.atHome) out.push({ key: "tend_shop", description: "Stay and mind the shop, chatting with whoever comes by" });
  if (v.hour >= 20 || v.hour < 6) out.push({ key: "rest", description: "Put their feet up and rest for the evening" });
  if (!out.length) out.push({ key: "wait", description: "Carry on with what they're doing" });
  return out;
}

/** Without Jev (or when it's unsure): the sensible thing, in order. */
export function scriptedPick(p: MindProfile, v: MindView, options: readonly MindOption[]): string {
  const has = (k: string) => options.some((o) => o.key === k);
  if (has("go_home")) return "go_home";
  const crafts = Object.keys(p.crafts).filter(has).sort((a, b) => have(v.stock, p.crafts[a].itemKey) - have(v.stock, p.crafts[b].itemKey));
  if (crafts.length) return crafts[0]; // whatever the shelf has least of
  const sell = options.find((o) => o.key.startsWith("sell_"));
  if (sell) return sell.key;
  const buy = options.find((o) => o.key.startsWith("buy_"));
  if (buy) return buy.key;
  const ask = options.find((o) => o.key.startsWith("ask_"));
  if (ask) return ask.key;
  const gift = options.find((o) => o.key.startsWith("gift:"));
  if (gift && v.nearby.some((x) => x.tier === "dear")) return gift.key;
  const outing = options.find((o) => o.key.startsWith("outing:"));
  if (outing) return outing.key; // nothing else to be done: go
  return options[0].key;
}

/** Their situation in plain words: the `state` Jev decides from. */
export function stateText(p: MindProfile, v: MindView): string {
  const s = v.stock;
  const ingredients = [...new Set([...Object.values(p.crafts).flatMap((r) => Object.keys(r.uses)), ...Object.keys(p.supplies), ...Object.keys(p.asks), ...Object.keys(p.sells ?? {})])];
  const errandItem = v.intent.startsWith("errand:") ? v.intent.slice(7) : null;
  const delivery = deliveryOf(v.intent);
  const deliverItem = delivery?.item ?? null;
  const deliverTo = deliverItem && p.sells?.[deliverItem] ? sellTargets(p.sells[deliverItem])[delivery!.target]?.place : undefined;
  const errand = errandItem ? ` (to ${p.supplies[errandItem]?.place ?? "buy supplies"} for ${word(p, errandItem)})`
    : deliverItem ? ` (to ${deliverTo ?? "a buyer"} to sell ${word(p, deliverItem)})` : "";
  const outing = v.intent.startsWith("outing:") ? p.outings?.[v.intent.slice(7)] : undefined;
  const t = v.table;
  const lines = [
    `${v.name} is ${p.trade}. It is ${Math.floor(v.hour)}:00 and the weather is ${v.weather}.`,
    v.onTrip ? `They are walking somewhere right now${errand}${outing ? ` (to ${outing.place})` : ""}.`
      : v.atHome ? "They are at work." : `They are away from work${errandItem ? (v.errandArrived ? `, at ${p.supplies[errandItem]?.place}, done` : errand) : outing ? `, at ${outing.place}` : ""}.`,
    `Ingredients: ${ingredients.map((k) => `${have(s, k)} ${word(p, k)}`).join(", ")}. On the shelf to sell: ${Object.keys(p.shelf).map((k) => `${have(s, k)} ${word(p, k)}`).join(", ")}. Purse: ${v.purse} coins.`,
    !t ? "" : t.itemKey == null ? "The free table outside has nothing on it yet."
      : t.left === 0 ? `The free table is empty; the last batch (${word(p, t.itemKey)}) was all taken.`
      : `The free table has ${t.left} ${word(p, t.itemKey)} left${t.bakedAt ? `, made ${Math.round((v.now - t.bakedAt) / 60_000)} minutes ago` : ""}.`,
    v.requests.length ? `They have asked the villagers for: ${v.requests.map((r) => `${r.qty} ${word(p, r.itemKey)}`).join(", ")}.` : "",
    v.nearby.length ? `Nearby: ${v.nearby.map((x) => `${x.name} (${x.tier === "dear" ? "a dear friend" : x.tier === "fond" ? "they're fond of them" : x.tier === "cool" ? "takes and never helps" : "an acquaintance"})`).join("; ")}.` : "Nobody is nearby.",
    v.memories.length ? `Recently: ${v.memories.slice(0, 8).map((m) => m.text).join(" ")}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

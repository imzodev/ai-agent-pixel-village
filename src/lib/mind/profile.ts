// A mind, the pure part shared by every kind of NPC (profiles in
// src/lib/mind/profiles.ts): which actions it can take right now (only
// those reach Jev), the scripted policy used when Jev is unavailable or
// unsure, and the plain-words state Jev decides from. No DB here
// (src/lib/mind/mindServer.ts carries the decision out).

import type { CraftRecipe, MindOption, MindProfile, MindView, NpcStock, RegardTier } from "@/types/mind";

/** The five moods Jev scores, low to high. */
export const MOODS = ["gloomy", "tired", "content", "cheerful", "delighted"] as const;
/** How much they need what they ask for, low to high (reward ×). */
export const URGENCY = [0.8, 1, 1.4, 2] as const;
/** Open requests close after this. */
export const REQUEST_TTL_MS = 2 * 3600_000;

const have = (s: NpcStock, k: string) => s[k] ?? 0;
export const word = (p: MindProfile, item: string) => p.words[item] ?? item.replace(/_/g, " ");
/** "1 stone sword", "20 arrows". */
export const count = (p: MindProfile, n: number, item: string) => `${n} ${n === 1 ? word(p, item).replace(/s$/, "") : word(p, item)}`;

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

/** Can they make a batch from their stock? */
export function canCraft(stock: NpcStock, r: CraftRecipe): boolean {
  return Object.entries(r.uses).every(([k, n]) => have(stock, k) >= n);
}

/** Reward for a request: per-item pay × urgency, at least 3 coins. */
export function requestReward(p: MindProfile, itemKey: string, qty: number, urgency: number): number {
  const mult = URGENCY[Math.max(0, Math.min(URGENCY.length - 1, Math.round(urgency)))];
  return Math.max(3, Math.round((p.asks[itemKey]?.pay ?? 2) * qty * mult));
}

/** The actions they can take right now, each with what it means. */
export function feasibleActions(p: MindProfile, v: MindView): MindOption[] {
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
  const errand = v.intent.startsWith("errand:");
  for (const [item, s] of Object.entries(p.supplies)) {
    if (working && !errand && have(v.stock, item) < s.low && v.purse >= s.price * 2) {
      out.push({ key: `buy_${item}`, description: `Close up and walk to ${s.place} to buy ${word(p, item)} (${s.price} coins each)` });
    }
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
  if (!v.atHome && !v.onTrip && (!errand || v.errandArrived)) out.push({ key: "go_home", description: "Walk back home to work" });
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
  const buy = options.find((o) => o.key.startsWith("buy_"));
  if (buy) return buy.key;
  const ask = options.find((o) => o.key.startsWith("ask_"));
  if (ask) return ask.key;
  const gift = options.find((o) => o.key.startsWith("gift:"));
  if (gift && v.nearby.some((x) => x.tier === "dear")) return gift.key;
  return options[0].key;
}

/** Their situation in plain words: the `state` Jev decides from. */
export function stateText(p: MindProfile, v: MindView): string {
  const s = v.stock;
  const ingredients = [...new Set([...Object.values(p.crafts).flatMap((r) => Object.keys(r.uses)), ...Object.keys(p.supplies), ...Object.keys(p.asks)])];
  const errandItem = v.intent.startsWith("errand:") ? v.intent.slice(7) : null;
  const errand = errandItem ? ` (to ${p.supplies[errandItem]?.place ?? "buy supplies"} for ${word(p, errandItem)})` : "";
  const t = v.table;
  const lines = [
    `${v.name} is ${p.trade}. It is ${Math.floor(v.hour)}:00 and the weather is ${v.weather}.`,
    v.onTrip ? `They are walking somewhere right now${errand}.`
      : v.atHome ? "They are at work." : `They are away from work${errandItem ? (v.errandArrived ? `, at ${p.supplies[errandItem]?.place}, done buying` : errand) : ""}.`,
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

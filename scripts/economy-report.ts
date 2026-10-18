// What the main ways of earning pay per hour, before supply & demand and now,
// and how long a homestead parcel takes. Run: npx tsx scripts/economy-report.ts
//
// Rates (units an hour) are rough, from the economy audit: a busy player
// doing just that one thing. "Now" sells every 10 minutes into one market
// (the glut decays in between), or spread over three markets.

import { DEMAND_HALF_LIFE_MS, bulkPay, decayGlut } from "../src/lib/market";
import { findBuyer, marketDepth } from "../src/lib/trade";
import { marketOf } from "../src/lib/economy";
import { FISH_DEFS } from "../src/lib/fishing";
import { PARCEL_PRICE } from "../src/lib/homestead";

type Activity = { name: string; perHour: Record<string, number>; market: string; oldPrice: Record<string, number> };

const fishMix = (() => {
  const pond = FISH_DEFS.filter((f) => f.waters.includes("pond") && f.time !== "night" && !f.weather);
  const total = pond.reduce((s, f) => s + f.weight, 0);
  return Object.fromEntries(pond.map((f) => [f.key, (360 * f.weight) / total])); // ~360 catches an hour
})();

const ACTIVITIES: Activity[] = [
  { name: "Common Field wheat", perHour: { wheat: 3000 }, market: "village", oldPrice: { wheat: 1 } },
  { name: "Fishing (pond, day)", perHour: fishMix, market: "brightwater", oldPrice: Object.fromEntries(FISH_DEFS.map((f) => [f.key, f.price])) },
  { name: "Village Ranch picks (eggs, milk)", perHour: { egg: 500, milk: 250 }, market: "village", oldPrice: { egg: 2, milk: 4 } },
  { name: "Wood", perHour: { wood: 450 }, market: "brightwater", oldPrice: { wood: 3 } },
  { name: "Pumpkin field", perHour: { pumpkin: 6 }, market: "village", oldPrice: { pumpkin: 20 } },
  { name: "Cherry orchard", perHour: { cherry: 80 }, market: "village", oldPrice: { cherry: 6 } },
  { name: "Far lands (tier 6 hunting)", perHour: { troll_hide: 12, rime_essence: 6 }, market: "hollowmere", oldPrice: { troll_hide: 0, rime_essence: 0 } },
];

/** Coins an hour selling into `markets` markets in turn, every 10 minutes, averaged over `hours`. */
function earn(a: Activity, markets: number, hours: number): number {
  const gluts = new Map<string, number>();
  let coins = 0;
  const steps = hours * 6;
  for (let s = 0; s < steps; s++) {
    const m = s % markets;
    for (const [item, perHour] of Object.entries(a.perHour)) {
      const buyer = findBuyer(item, a.market) ?? findBuyer(item);
      if (!buyer) continue;
      const key = `${m}:${item}`;
      const g = gluts.get(key) ?? 0;
      const qty = Math.round(perHour / 6);
      coins += bulkPay(buyer.trade.price, g, marketDepth(marketOf(buyer.npcKey), item), qty);
      gluts.set(key, g + qty);
    }
    for (const [k, g] of gluts) gluts.set(k, decayGlut(g, 10 * 60_000));
  }
  return coins / hours;
}

const rows = ACTIVITIES.map((a) => {
  const before = Object.entries(a.perHour).reduce((s, [k, n]) => s + n * (a.oldPrice[k] ?? 0), 0);
  const one = earn(a, 1, 4), three = earn(a, 3, 4);
  return { activity: a.name, before: Math.round(before), "now, one town": Math.round(one), "now, 3 towns": Math.round(three), "hours / parcel": +(PARCEL_PRICE / Math.max(1, three)).toFixed(1) };
});
console.log(`Parcel: ${PARCEL_PRICE} coins. Demand half-life: ${DEMAND_HALF_LIFE_MS / 3600_000} h. Averages over 4 hours of play.`);
console.table(rows);

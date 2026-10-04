// The inns (village, Hollowmere, Brightwater): a warm place to meet.
// Rest heals you, hot stew heals you on the road, the rumour board points
// at what's worth doing right now, and the patrons list shows who's here.
// Pure data + rules; the route is src/app/api/inn/route.ts.

import { fishFor } from "./fishing";
import { SETTLEMENT_NPCS, TOWNS } from "./settlements";
import type { InnWorld } from "@/types/inn";

export type { InnPatron, InnView, InnWorld } from "@/types/inn";

/** Inn building key → its innkeeper's NPC key. */
export const INNS: Record<string, string> = {
  inn_village: "village_hettie",
  inn_hollowmere: "hollowmere_ivy",
  inn_brightwater: "brightwater_coral",
};
// The continent's towns: st_<town>_inn → that town's innkeeper.
for (const t of TOWNS) {
  const keeper = SETTLEMENT_NPCS.find((n) => n.town === t.key && n.job === "innkeeper");
  if (keeper) INNS[`st_${t.key}_inn`] = keeper.key;
}
export const INN_REACH_PX = 160;
/** Patrons: players within this distance of the inn door. */
export const INN_PATRON_PX = 200;
export const REST_COST = 5;
/** Below this share of max HP, resting is free. */
export const REST_FREE_BELOW = 0.25;
export const STEW_COST = 8;
/** HP restored by eating each consumable (anything else: 4). */
export const CONSUMABLE_HEAL: Readonly<Record<string, number>> = { honey_bun: 8, hot_stew: 12 };

/** HP a consumable restores. */
export const healOf = (itemKey: string): number => CONSUMABLE_HEAL[itemKey] ?? 4;

const until = (ms: number): string => {
  const h = Math.round(ms / 3_600_000);
  if (h < 1) return "within the hour";
  if (h < 24) return `in about ${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return `in ${d} day${d === 1 ? "" : "s"}`;
};

/** What the innkeeper's heard, most pressing first. */
export function rumours(w: InnWorld): string[] {
  const out: string[] = [];
  const night = w.hour >= 20 || w.hour < 5;
  out.push(w.boss.active
    ? "🌳 The Old Rootking is awake in the north woods! Everyone's heading there — strength in numbers."
    : `🌳 They say the Old Rootking stirs again ${until(w.boss.at - w.now)}. Gather friends before then.`);
  const special = (water: "river" | "pond") => fishFor(water, w.hour, w.weather).filter((f) => f.rarity === "rare" || f.rarity === "legendary").map((f) => f.name);
  const river = special("river"), pond = special("pond");
  if (river.length) out.push(`🎣 Right now the Silverrun has ${river.join(" and ")} biting.`);
  if (pond.length) out.push(`🎣 The ponds are giving up ${pond.join(" and ")} at this hour.`);
  if (w.weather === "rain") out.push("🌧️ Rain brings the storm eels up — anglers are out with their rods.");
  out.push(night
    ? "👻 Shade wisps drift through the oak forest after dark. Their essence fetches a fine price."
    : "🐺 Grey wolves hunt in Whisperwood. Don't wander there alone without a blade.");
  if (w.lastCatch) out.push(`🐟 ${w.lastCatch} The whole bar heard about it.`);
  if (w.freeFields > 0) out.push(`🌾 ${w.freeFields} field${w.freeFields === 1 ? " is" : "s are"} still free south of the village. Claim one and plant.`);
  if (w.freeRanches > 0) out.push(`🐔 ${w.freeRanches} ranch${w.freeRanches === 1 ? " is" : "es are"} waiting for someone to raise animals.`);
  out.push("🔨 Bjorn in Hollowmere will upgrade your gear if you bring him materials.");
  return out;
}

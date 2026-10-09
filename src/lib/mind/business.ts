// A business agent's mind, the pure part: which actions it can take right
// now (only those reach Jev), the scripted choice when Jev is unavailable or
// unsure, and the plain-words state Jev decides from. No db here
// (src/lib/mind/businessServer.ts carries the decision out).
//
// What a business agent can do is fixed here by construction: pitch, shop,
// patrol, go home, tend its pantry, rest, wait. It can't farm, fight, craft
// or collect coins.

import type { MindOption } from "@/types/mind";
import type { BusinessView } from "@/types/businessAgent";

/** Daytime: when the agent is out and about. */
export const isDaytime = (hour: number) => hour >= 7 && hour < 20;
/** Night: when it rests. */
export const isNight = (hour: number) => hour >= 21 || hour < 6;
/** Most pitch options offered in one think. */
const MAX_PITCH_OPTIONS = 2;
/** Most patrol places offered in one think. */
const MAX_PATROL_OPTIONS = 3;

/** The actions this agent can take right now. */
export function businessActions(v: BusinessView): MindOption[] {
  const out: MindOption[] = [];
  const free = !v.onTrip;

  if (free) {
    for (const t of v.pitchTargets.slice(0, MAX_PITCH_OPTIONS)) {
      out.push({ key: `pitch:p${t.id}`, description: `Tell ${t.name}, who is close by, about the business` });
    }
    for (const o of v.shopOptions) {
      out.push({ key: `shop:${o.itemKey}`, description: `Walk to ${v.placeNames[o.sellerKey] ?? o.sellerKey} and buy ${o.itemKey.replace(/_/g, " ")} for ${o.price} coins` });
    }
    if (isDaytime(v.hour)) {
      for (const p of v.patrolCandidates.slice(0, MAX_PATROL_OPTIONS)) {
        out.push({ key: `patrol:${p}`, description: `Stroll over to ${v.placeNames[p] ?? p} and look around` });
      }
    }
    if (!v.atHome) out.push({ key: "go_home", description: "Walk back to the business" });
    if (v.atHome && Object.values(v.pantry).some((n) => n > 0)) out.push({ key: "tend", description: "Eat something from the pantry and mind the shop" });
    else if (v.atHome) out.push({ key: "tend", description: "Stay and mind the shop, greeting whoever passes" });
  }
  if (isNight(v.hour)) out.push({ key: "rest", description: "Rest for the night" });
  if (!out.length) out.push({ key: "wait", description: "Carry on with what they're doing" });
  return out;
}

/** Without Jev (or when it's unsure): the sensible thing, in order. */
export function businessScriptedPick(options: readonly MindOption[]): string {
  const has = (prefix: string) => options.find((o) => o.key.startsWith(prefix))?.key;
  return has("pitch:") ?? has("shop:") ?? has("patrol:") ?? (options.some((o) => o.key === "go_home") ? "go_home" : undefined)
    ?? (options.some((o) => o.key === "tend") ? "tend" : undefined) ?? (options.some((o) => o.key === "rest") ? "rest" : undefined) ?? options[0].key;
}

/** Their situation in plain words: the `state` Jev decides from. */
export function businessStateText(v: BusinessView): string {
  const pantry = Object.entries(v.pantry).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`);
  const lines = [
    `It runs a local business. It is ${Math.floor(v.hour)}:00.`,
    v.onTrip ? `It is walking somewhere right now${v.intent ? ` (${v.intent})` : ""}.`
      : v.atHome ? "It is at its business, minding the shop." : "It is out and about, away from its business.",
    `Budget left this period: ${v.purse} coins.`,
    pantry.length ? `Pantry: ${pantry.join(", ")}.` : "Pantry is empty.",
    v.shopOptions.length ? `It could buy: ${v.shopOptions.map((o) => `${o.itemKey.replace(/_/g, " ")} from ${v.placeNames[o.sellerKey] ?? o.sellerKey} for ${o.price}`).join("; ")}.` : "Nothing to buy right now.",
    v.pitchTargets.length ? `Players nearby it could talk to: ${v.pitchTargets.map((t) => t.name).join(", ")}.` : "Nobody nearby to talk to.",
    v.memories.length ? `Recently: ${v.memories.slice(0, 6).join(" ")}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

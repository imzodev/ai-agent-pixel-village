// Random encounters: while players travel the continent's wilds, things
// happen around them — a traveller cornered by beasts, a merchant with a
// broken cart, an injured hunter, a lost child, an ambush. A stranger (a
// real NPC: everyone nearby sees them and can talk to them) asks for help;
// everyone who helps gets paid, and they leave after a while either way.
// Pure data and rules; the world side is src/lib/encountersServer.ts.

import type { EncounterDef, EncounterKind } from "@/types/encounter";
import type { TradeItem } from "./types";

export type { EncounterDef, EncounterKind, EncounterView } from "@/types/encounter";

/** Chance per beat that a travelling player meets something (≈ every 3 min). */
export const ENCOUNTER_CHANCE = 1 / 36;
/** No new encounter within this many px of an active one. */
export const ENCOUNTER_SPACING_PX = 80 * 16;
export const ENCOUNTER_TTL_MS = 6 * 60_000;
/** A helped stranger lingers this long (the merchant keeps trading). */
export const ENCOUNTER_LINGER_MS = 8 * 60_000;
/** A player in the wilds meets something at least this often (6 min). */
export const ENCOUNTER_PITY_BEATS = 72;
/** Players this close to the one who meets something are "in the group". */
export const ENCOUNTER_GROUP_PX = 300;
/** How close you must stand to hand something over. */
export const ENCOUNTER_REACH_PX = 110;

export const ENCOUNTERS: Readonly<Record<EncounterKind, EncounterDef>> = {
  beset: {
    title: "A traveller in trouble",
    stranger: {
      role: "❗ Cornered traveller",
      persona: "A frightened traveller cornered by wild beasts on the road. Breathless, panicked, begging anyone nearby to drive them off — and hugely grateful afterwards.",
      greeting: "Help! Please — get them away from me!",
    },
    need: null,
    call: "❗ Someone's screaming for help nearby!",
    thanks: "You saved my life, friend. Take this — it's all I've got.",
    reward: { coins: 35, xp: 45, rep: 10 },
  },
  merchant: {
    title: "A stranded merchant",
    stranger: {
      role: "❗ Stranded merchant",
      persona: "A travelling merchant whose cart wheel has cracked out in the wilds. Chatty and a little dramatic about it. Needs 5 wood to splint the wheel, and afterwards happily sells rare goods from the back of the cart.",
      greeting: "Ah, a traveller! My wheel's split clean through. Got any wood? Five would do it.",
    },
    need: { itemKeys: ["wood"], qty: 5, label: "5 wood" },
    call: "❗ A merchant's cart is stuck nearby — they're waving for help.",
    thanks: "Good as new! Here, for your trouble — and have a look at my wares while I'm here.",
    reward: { coins: 25, xp: 25, rep: 8 },
  },
  hunter: {
    title: "An injured hunter",
    stranger: {
      role: "❗ Injured hunter",
      persona: "A seasoned hunter with a nasty bite on the leg, sitting against a rock. Proud, gruff, won't ask twice — but would take some stew, bread or a healing herb, and knows the land well.",
      greeting: "Easy. Something got my leg... you wouldn't have any food? Or herbs?",
    },
    need: { itemKeys: ["hot_stew", "bread", "herb"], qty: 1, label: "stew, bread or a herb" },
    call: "❗ Someone's hurt nearby — they're calling out.",
    thanks: "That'll keep me going. Take these — and a tip: the big ones hunt at dusk.",
    reward: { coins: 20, xp: 25, rep: 8 },
  },
  lost_child: {
    title: "A lost child",
    stranger: {
      role: "❗ Lost child",
      persona: "A small child who wandered off from a nearby town and has lost their favourite doll somewhere close by. Tearful but brave, chatters a lot once comforted.",
      greeting: "I dropped my dolly and now I can't find it... can you help me look?",
    },
    need: { itemKeys: ["lost_doll"], qty: 1, label: "their lost doll (it's nearby)" },
    call: "❗ A child is crying somewhere nearby.",
    thanks: "My dolly! Thank you thank you! Mum said to give this to anyone who helps.",
    reward: { coins: 30, xp: 30, rep: 12 },
  },
  ambush: {
    title: "Ambush!",
    stranger: null,
    need: null,
    call: "⚔️ Ambush! Beasts are closing in!",
    thanks: "You fought them off.",
    reward: { coins: 20, xp: 40, rep: 6 },
  },
};

/** How often each kind turns up (ambushes only where it's dangerous). */
export function pickEncounter(tier: number, rand = Math.random): EncounterKind {
  const opts: [EncounterKind, number][] = [["beset", 3], ["merchant", 2], ["hunter", 2], ["lost_child", 2], ["ambush", tier >= 2 ? 2 : 0]];
  let r = rand() * opts.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of opts) { r -= w; if (r < 0) return k; }
  return "beset";
}

/** Does a travelling player meet something this beat? Random, but never
 *  more than ENCOUNTER_PITY_BEATS beats in the wilds without. */
export function rollsEncounter(beatsSince: number, rand = Math.random): boolean {
  return beatsSince >= ENCOUNTER_PITY_BEATS || rand() < ENCOUNTER_CHANCE;
}

/** Bigger groups face more beasts: +1 per extra player, up to +4. */
export const attackersFor = (base: number, players: number): number => base + Math.min(4, Math.max(0, players - 1));

/** What a helped merchant sells from the back of the cart. */
export const MERCHANT_STOCK: readonly TradeItem[] = [
  { itemKey: "pumpkin_seeds", qty: 1, price: 7, line: "Pumpkin seeds, seven coppers — straight from the coast." },
  { itemKey: "tomato_seeds", qty: 1, price: 4, line: "Tomato seeds, four coppers." },
  { itemKey: "honey_bun", qty: 1, price: 7, line: "Honey buns! Seven coppers, still fresh." },
  { itemKey: "fishing_rod", qty: 1, price: 24, line: "A fine rod — twenty-four coppers, cheaper than any town." },
  { itemKey: "sharp_axe", qty: 1, price: 60, line: "A sharp axe. Sixty coppers. You won't see one cheaper." },
];
/** Encounter strangers are NPCs keyed enc_<kind>_<id>. */
export const encounterNpcKey = (kind: EncounterKind, id: number): string => `enc_${kind}_${id}`;
export const isMerchantKey = (npcKey: string): boolean => npcKey.startsWith("enc_merchant_");

const FIRST = ["Ada", "Bertie", "Clem", "Dot", "Eli", "Fen", "Gil", "Hob", "Ivy", "Jem", "Kat", "Lou", "Mags", "Ned", "Oona", "Perry"];
export const strangerName = (rand = Math.random): string => FIRST[Math.floor(rand() * FIRST.length)];

// Who a character is: an origin and a couple of traits, picked when they
// start (changeable for their first day), and more traits earned by
// finishing stories (src/lib/story/). Pure: every number is here.
//
// Traits are small, smaller than perks, and none touches a price (the
// no-loop rule in economy.test.ts holds). Membership never grants one.
// Server: src/lib/traitsServer.ts. Effects are applied where the perks are.

import type { CharacterTraits, OriginDef, OriginKey, TraitDef, TraitKey } from "@/types/traits";
import type { StoryEventKind } from "@/types/story";

export type { CharacterTraits, OriginDef, OriginKey, TraitDef, TraitKey } from "@/types/traits";

/** Traits picked at the start. */
export const TRAIT_PICKS = 2;
/** Origin and picks can be changed for this long after they're first chosen. */
export const TRAIT_CHANGE_MS = 24 * 3_600_000;

// The effects.
/** Charming: regard rises this much faster with NPCs who have a mind. */
export const CHARMING_REGARD_MULT = 1.5;
/** Lucky: chance of a second roll of a beaten foe's drops. */
export const LUCKY_EXTRA_DROP = 0.15;
/** Angler: a wider catch zone on the reel. */
export const ANGLER_ZONE = 0.05;
/** Brave: harder blows against foes of this danger tier and up. */
export const BRAVE_MIN_TIER = 3;
export const BRAVE_DMG_MULT = 1.15;
/** Animal friend: extra affection when petting your own animals. */
export const ANIMAL_FRIEND_AFFECTION = 1;
/** Hardy: extra max HP. */
export const HARDY_HP = 10;
/** Patient: tools wear this much slower. */
export const PATIENT_WEAR_MULT = 0.6;
/** Storyteller: story chapters give this much more XP. */
export const STORYTELLER_XP_MULT = 1.2;

export const ORIGINS: readonly OriginDef[] = [
  { key: "farmhand", name: "Farmhand", icon: "🌾", description: "Grew up on a farm. Starts with seeds to plant.", past: "grew up on a farm", kit: { items: [{ itemKey: "radish_seeds", qty: 4 }, { itemKey: "carrot_seeds", qty: 2 }] } },
  { key: "woodsman", name: "Woodsman", icon: "🪓", description: "Raised in the deep woods. Starts with a stack of logs.", past: "was raised in the deep woods", kit: { items: [{ itemKey: "wood", qty: 8 }] } },
  { key: "sellsword", name: "Sellsword", icon: "⚔️", description: "Fought for coin once. Starts with food for the road.", past: "used to fight for coin", kit: { items: [{ itemKey: "bread", qty: 3 }, { itemKey: "berry", qty: 4 }] } },
  { key: "merchant", name: "Merchant's child", icon: "🪙", description: "Born behind a market stall. Starts with a few more coins.", past: "was born behind a market stall", kit: { coins: 40 } },
  { key: "wanderer", name: "Wanderer", icon: "🧭", description: "Never stayed anywhere long. Starts with travel food.", past: "has wandered from place to place all their life", kit: { items: [{ itemKey: "bread", qty: 2 }, { itemKey: "mushroom", qty: 3 }] } },
  { key: "scholar", name: "Scholar", icon: "📚", description: "Read every book in their old town. Starts with herbs and coins.", past: "spent their youth reading every book they could find", kit: { coins: 15, items: [{ itemKey: "herb", qty: 4 }] } },
];

export const TRAITS: readonly TraitDef[] = [
  { key: "charming", name: "Charming", icon: "😊", description: "Villagers warm to you faster (regard ×1.5).", seen: "easy to like" },
  { key: "lucky", name: "Lucky", icon: "🍀", description: "Beaten foes sometimes drop their loot twice (15%).", seen: "famously lucky" },
  { key: "angler", name: "Angler", icon: "🎣", description: "A wider catch zone when reeling in.", seen: "a born angler" },
  { key: "brave", name: "Brave", icon: "🦁", description: "Hit 15% harder against foes of danger tier 3 and up.", seen: "brave to a fault" },
  { key: "animal_friend", name: "Animal friend", icon: "🐾", description: "Your animals grow fond of you faster.", seen: "good with animals" },
  { key: "hardy", name: "Hardy", icon: "💪", description: `+${HARDY_HP} max HP.`, seen: "tough as old boots" },
  { key: "patient", name: "Patient", icon: "🕰️", description: "Your tools wear 40% slower.", seen: "patient and careful" },
  { key: "storyteller", name: "Storyteller", icon: "📜", description: "Story chapters give 20% more XP.", seen: "always full of stories" },
];

export const isOriginKey = (k: unknown): k is OriginKey => typeof k === "string" && ORIGINS.some((o) => o.key === k);
export const isTraitKey = (k: unknown): k is TraitKey => typeof k === "string" && TRAITS.some((t) => t.key === k);
export const originDef = (k: OriginKey): OriginDef => ORIGINS.find((o) => o.key === k)!;
export const traitDef = (k: TraitKey): TraitDef => TRAITS.find((t) => t.key === k)!;

/** Every trait a character has (picked and earned). */
export const allTraits = (t: CharacterTraits): Set<TraitKey> => new Set([...t.picked, ...t.earned]);

/** Why this choice can't be made, or null: a known origin and TRAIT_PICKS different known traits. */
export function choiceProblem(origin: unknown, picks: unknown): string | null {
  if (!isOriginKey(origin)) return "Pick where you come from.";
  if (!Array.isArray(picks) || picks.length !== TRAIT_PICKS || !picks.every(isTraitKey)) return `Pick ${TRAIT_PICKS} traits.`;
  if (new Set(picks).size !== picks.length) return "Pick two different traits.";
  return null;
}

/** Can the origin and picks be chosen now: never chosen, or chosen less than TRAIT_CHANGE_MS ago. */
export const canChoose = (chosenAt: number | null, now: number): boolean => chosenAt == null || now - chosenAt < TRAIT_CHANGE_MS;

/** Which trait each kind of chapter teaches, best first. */
const TAUGHT_BY: Record<StoryEventKind, TraitKey[]> = {
  defeat: ["brave", "hardy", "lucky"],
  talk: ["charming", "storyteller"],
  deliver: ["charming", "patient"],
  collect: ["patient", "lucky"],
  visit: ["storyteller", "hardy"],
  fish: ["angler", "patient"],
  plant: ["animal_friend", "patient"],
  sell: ["charming", "lucky"],
};

/**
 * The trait a finished story teaches: from what its chapters asked most,
 * the first the character doesn't have yet. Null when they have them all.
 */
export function earnedTraitFor(events: StoryEventKind[], have: Set<TraitKey>): TraitKey | null {
  const tally = new Map<StoryEventKind, number>();
  for (const e of events) tally.set(e, (tally.get(e) ?? 0) + 1);
  const order = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e);
  for (const e of order) for (const k of TAUGHT_BY[e]) if (!have.has(k)) return k;
  return TRAITS.find((t) => !have.has(t.key))?.key ?? null;
}

/** How NPCs see this character, one sentence for the talk prompt (null with no origin or traits). */
export function heroLine(name: string, t: CharacterTraits): string | null {
  const parts: string[] = [];
  if (t.origin) parts.push(`${name} ${originDef(t.origin).past}`);
  const seen = [...allTraits(t)].map((k) => traitDef(k).seen);
  if (seen.length) parts.push(`${parts.length ? "they're" : `${name} is`} ${seen.length > 1 ? `${seen.slice(0, -1).join(", ")} and ${seen.at(-1)}` : seen[0]}`);
  return parts.length ? `What people say about them: ${parts.join("; ")}.` : null;
}

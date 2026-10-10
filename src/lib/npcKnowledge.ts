// What an NPC knows about the world, for their dialogue prompt: their town,
// what they and their neighbours sell, buy and make, the other towns, and
// how a few things work. All of it is read from the game's own data (shops,
// trades, recipes, towns, ranch), so an NPC can point a player somewhere
// real instead of making someone up. Cheap to build (a few lookups), so it's
// built per conversation turn.

import { NPC_DEFS, npcDef } from "./npcDefs";
import { SETTLEMENT_NPCS, TOWNS } from "./settlements";
import { stockForNpc, tradesForNpc } from "./trade";
import { recipesForNpc } from "./recipes";
import { RANCH_SPECIES } from "./ranch";
import { TRAVEL_COST } from "./worldAtlas";
import type { ItemNameOf } from "@/types/npc";

/** The hand-written NPCs' places, by key prefix. */
const HOME_PLACES: Readonly<Record<string, string>> = {
  village: "the grove (the starting village, with the bakery, the mill, the cabins and the Wayfarer's Rest)",
  hollowmere: "Hollowmere (the woodcutters' town among the pines, with Bjorn's forge and the Sawdust & Ale inn)",
  brightwater: "Brightwater (the harbour town on the Silverrun, with the fishing dock and the Salted Gull inn)",
};
const HOME_NAMES: Readonly<Record<string, string>> = { village: "the grove", hollowmere: "Hollowmere", brightwater: "Brightwater" };


/** Where an NPC lives: a place key ("village", a town key…) and its name. */
function homeOf(npcKey: string): { place: string; name: string; describe: string } | null {
  const townsfolk = SETTLEMENT_NPCS.find((n) => n.key === npcKey);
  if (townsfolk) {
    const town = TOWNS.find((t) => t.key === townsfolk.town);
    const name = town?.name ?? townsfolk.town;
    return { place: townsfolk.town, name, describe: name };
  }
  const prefix = npcKey.split("_")[0];
  if (HOME_NAMES[prefix]) return { place: prefix, name: HOME_NAMES[prefix], describe: HOME_PLACES[prefix] };
  return null;
}

/** The NPCs living in the same place. */
function neighboursOf(npcKey: string, place: string): string[] {
  const town = TOWNS.find((t) => t.key === place);
  const keys = town
    ? SETTLEMENT_NPCS.filter((n) => n.town === place).map((n) => n.key)
    : NPC_DEFS.filter((n) => n.key.startsWith(`${place}_`)).map((n) => n.key);
  return keys.filter((k) => k !== npcKey);
}

const list = (xs: string[], max: number) => (xs.length > max ? `${xs.slice(0, max).join(", ")} and more` : xs.join(", "));

/** One line about what an NPC does: sells, buys, makes. */
function tradeLine(npcKey: string, detailed: boolean, itemName: ItemNameOf): string {
  const sells = stockForNpc(npcKey).map((t) => (detailed ? `${itemName(t.itemKey)}${t.qty > 1 ? ` ×${t.qty}` : ""} (${t.price} coins)` : itemName(t.itemKey)));
  const buys = tradesForNpc(npcKey).map((t) => (detailed ? `${itemName(t.itemKey)} (pays ${t.price})` : itemName(t.itemKey)));
  const makes = recipesForNpc(npcKey).map((r) => r.name);
  const parts: string[] = [];
  // Everything they sell, always: "who sells X?" must find X here.
  if (sells.length) parts.push(`sells ${sells.join(", ")}`);
  if (buys.length) parts.push(`buys ${list(buys, detailed ? 12 : 6)}`);
  if (makes.length) parts.push(`crafts ${list(makes, detailed ? 12 : 6)}`);
  return parts.join("; ");
}

/** How a few things in the world work (every line true to the game's rules). */
function howThingsWork(): string[] {
  const animals = Object.values(RANCH_SPECIES).map((s) => `a ${s.young.toLowerCase()} (${s.species}) for ${s.price} coins, up to ${s.cap}`).join("; ");
  return [
    `Nobody sells animals. Players buy them from the panel on their own ranch lot: ${animals}. They're fed with crops and give ${Object.values(RANCH_SPECIES).map((s) => s.produce).join(", ")}.`,
    "Lots (homes, farm land, ranches, vineyards, orchards, workshops) are claimed at their gate.",
    `Waystones: walking up to one attunes it; from beside a waystone, travel to any attuned one is free (${TRAVEL_COST} coins from anywhere else, from the map).`,
    "Every town has an inn where the innkeeper sells hot food and travellers can rest by the hearth.",
    `The ${TOWNS.length} towns out on the continent (${TOWNS.slice(0, 3).map((t) => t.name).join(", ")}…) each have a bounty board with jobs that pay.`,
    "Bjorn at the forge in Hollowmere upgrades swords, axes and fishing rods (up to +3) for coin and materials.",
  ];
}

/**
 * The knowledge sheet for one NPC: plain text for the prompt. Unknown keys
 * (remote agents) get only the general facts. `itemName` names items
 * (unknown keys fall back to the key, spaced out).
 */
export function knowledgeFor(npcKey: string, itemName: ItemNameOf = (k) => k.replace(/_/g, " ")): string {
  const lines: string[] = [];
  const home = homeOf(npcKey);
  if (home) lines.push(`You live in ${home.describe}.`);
  const own = tradeLine(npcKey, true, itemName);
  lines.push(own ? `What you do: ${own}.` : "You don't run a shop or buy goods.");
  if (home) {
    const neighbours = neighboursOf(npcKey, home.place)
      .map((k) => { const d = npcDef(k); if (!d) return null; const t = tradeLine(k, false, itemName); return `- ${d.name} (${d.role})${t ? `: ${t}` : ""}`; })
      .filter((x): x is string => !!x);
    if (neighbours.length) lines.push(`Your neighbours in ${home.name}:`, ...neighbours);
  }
  const otherPlaces = [...Object.entries(HOME_NAMES).filter(([k]) => k !== home?.place).map(([, n]) => n), ...TOWNS.filter((t) => t.key !== home?.place).map((t) => t.name)];
  lines.push(`Other towns on the continent: ${otherPlaces.join(", ")}.`);
  lines.push("How things work:", ...howThingsWork().map((l) => `- ${l}`));
  return lines.join("\n");
}

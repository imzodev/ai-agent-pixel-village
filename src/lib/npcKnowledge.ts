// What an NPC knows about the world, for their dialogue prompt: their town,
// what they and their neighbours sell, buy and make, the towns nearby, and
// how a few things work. All of it is read from the game's own data (shops,
// trades, recipes, towns, ranch), so an NPC can point a player somewhere
// real instead of making someone up. Cheap to build (a few lookups), so it's
// built per conversation turn.
//
// Not everyone knows everything. Beyond home and the towns nearby, knowledge
// comes in topics, spread by who people are (topicsOf): innkeepers hear every
// traveller (trade, craft, roads), shopkeepers know trade, bounty officers the
// roads, crafters who makes what; a few townsfolk are well travelled. For a
// topic they lack, the sheet names someone who really has it (whoToAsk), so
// "I don't know, but X does" is always true.

import { NPC_DEFS, npcDef } from "./npcDefs";
import { SETTLEMENT_NPCS, TOWNS } from "./settlements";
import { BUYERS, SHOP_STOCK, stockForNpc } from "./trade";
import { CATEGORY_WORDS } from "./economy";
import { profileFor } from "./mind/profiles";
import type { GoodsCategory } from "@/types/economy";
import { recipesForNpc } from "./recipes";
import { RANCH_SPECIES } from "./ranch";
import { PARCEL_PRICE } from "./homestead";
import { TRAVEL_COST } from "./worldAtlas";
import type { ItemNameOf, KnowledgePlace, KnowledgeTopic } from "@/types/npc";

/** The hand-written NPCs' places, by key prefix. */
const HOME_PLACES: Readonly<Record<string, string>> = {
  village: "the grove (the starting village, with the bakery, the cabins, the Wayfarer's Rest, the Common Field just to the north, a great wheat field where anyone may gather, and the Village Ranch just to the east, the village's own ranch open to everyone, where the cows, the pigs, the sheep, Paco and Luna the llamas, the ducks on their pond and the hens in their coop live; folk play the day's games for prizes: Whistle (herding sheep, the sheepfold in the plaza), Harvest Haul (Della's cart by the ranch's west gate), Fishing Derby (the jetty at the Western Meadow pond, a trophy fish a day) and Marigold's Oven (her morning bake, at the brick oven north of the bakery, on the way to the Common Field))",
  hollowmere: "Hollowmere (the woodcutters' town among the pines, with Bjorn's forge and the Sawdust & Ale inn)",
  brightwater: "Brightwater (the harbour town on the Silverrun, with the fishing dock and the Salted Gull inn)",
};
const HOME_NAMES: Readonly<Record<string, string>> = { village: "the grove", hollowmere: "Hollowmere", brightwater: "Brightwater" };

/** Towns within this many tiles of home are "nearby": everyone knows them. */
const NEARBY_TILES = 350;

/** What the hand-written NPCs know beyond home, by who they are. */
const NAMED_TOPICS: Readonly<Record<string, readonly KnowledgeTopic[]>> = {
  village_marigold: ["craft"],
  village_bram: [],
  village_pip: ["trade"],
  village_wren: ["craft"],
  village_oswin: ["roads"],
  village_tobin: [],
  village_greta: ["craft"],
  village_hollis: ["craft"],
  village_hettie: ["trade", "craft", "roads"],
  hollowmere_bjorn: ["craft"],
  hollowmere_ivy: ["trade", "craft", "roads"],
  hollowmere_sorrel: ["roads"],
  brightwater_marina: ["trade"],
  brightwater_tobias: ["craft"],
  brightwater_wynn: ["roads"],
  brightwater_coral: ["trade", "craft", "roads"],
};

/** Topics by a townsperson's job. */
const JOB_TOPICS: Readonly<Record<string, readonly KnowledgeTopic[]>> = {
  innkeeper: ["trade", "craft", "roads"],
  shopkeeper: ["trade"],
  bounty: ["roads"],
  folk: [],
};

/** How a topic is asked about, for the "who to ask" line. */
const TOPIC_ASK: Readonly<Record<KnowledgeTopic, string>> = {
  trade: "Where to buy things that aren't sold around here",
  craft: "Who makes things outside your town",
  roads: "The way to towns that aren't nearby",
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Every place an NPC can live in: the continent's towns and the hand-made places (their NPCs' middle). */
const PLACES: readonly KnowledgePlace[] = [
  ...Object.entries(HOME_NAMES).map(([key, name]) => {
    const tiles = NPC_DEFS.filter((n) => n.key.startsWith(`${key}_`)).map((n) => n.tilePos);
    const mid = (i: 0 | 1) => Math.round(tiles.reduce((s, t) => s + t[i], 0) / Math.max(1, tiles.length));
    return { key, name, tx: mid(0), ty: mid(1) };
  }),
  ...TOWNS.map((t) => ({ key: t.key, name: t.name, tx: t.sq.tx, ty: t.sq.ty })),
];
const placeByKey = new Map(PLACES.map((p) => [p.key, p]));

/** The place key an NPC lives in ("village", a town key…), if known. */
function placeKeyOf(npcKey: string): string | null {
  const townsfolk = SETTLEMENT_NPCS.find((n) => n.key === npcKey);
  if (townsfolk) return townsfolk.town;
  const prefix = npcKey.split("_")[0];
  return HOME_NAMES[prefix] ? prefix : null;
}

/** Where an NPC lives: a place key ("village", a town key…) and its name. */
function homeOf(npcKey: string): { place: string; name: string; describe: string } | null {
  const key = placeKeyOf(npcKey);
  if (!key) return null;
  if (HOME_PLACES[key]) return { place: key, name: HOME_NAMES[key], describe: HOME_PLACES[key] };
  const name = placeByKey.get(key)?.name ?? key;
  return { place: key, name, describe: name };
}

/** What this NPC knows beyond home and the towns nearby. */
export function topicsOf(npcKey: string): ReadonlySet<KnowledgeTopic> {
  const named = NAMED_TOPICS[npcKey];
  if (named) return new Set(named);
  const folk = SETTLEMENT_NPCS.find((n) => n.key === npcKey);
  if (!folk) return new Set();
  const own = JOB_TOPICS[folk.job] ?? [];
  if (own.length || folk.job !== "folk") return new Set(own);
  // About one townsperson in four has travelled: they know the roads, or the trade.
  const h = hash(npcKey);
  return new Set(h % 4 === 0 ? [(h >>> 4) % 2 ? "roads" : "trade"] : []);
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
const and = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const dist = (a: KnowledgePlace, b: KnowledgePlace) => Math.hypot(a.tx - b.tx, a.ty - b.ty);

/** "south-west, far": where `to` lies from `from` (tiles; ty grows south). */
function bearing(from: KnowledgePlace, to: KnowledgePlace): string {
  const dx = to.tx - from.tx, dy = to.ty - from.ty;
  const d = Math.hypot(dx, dy);
  const ns = dy > d * 0.38 ? "south" : dy < -d * 0.38 ? "north" : "";
  const ew = dx > d * 0.38 ? "east" : dx < -d * 0.38 ? "west" : "";
  const dir = ns && ew ? `${ns}-${ew}` : ns || ew || "right here";
  const how = d < 150 ? "close by" : d < NEARBY_TILES ? "a fair walk" : d < 700 ? "far" : "very far";
  return `${dir}, ${how}`;
}

/** One line about what an NPC does: sells, buys, makes. */
function tradeLine(npcKey: string, detailed: boolean, itemName: ItemNameOf): string {
  // A caravan's wagon changes as she travels: say what she does, not a list (src/lib/mind/caravan.ts).
  const circuit = profileFor(npcKey)?.circuit;
  if (circuit?.length) return `takes a wagon round ${circuit.map((c) => c.place).join(", ")}, selling goods from other towns and buying up what a town has too much of`;
  const sells = stockForNpc(npcKey).map((t) => (detailed ? `${itemName(t.itemKey)}${t.qty > 1 ? ` ×${t.qty}` : ""} (${t.price} coins)` : itemName(t.itemKey)));
  // What they buy, in words (categories stay categories); prices move with demand (src/lib/market.ts).
  const spec = BUYERS[npcKey];
  const word = (k: string) => CATEGORY_WORDS[k as GoodsCategory] ?? itemName(k);
  const buys = spec ? spec.buys.map(word) : [];
  const best = detailed && spec?.specialty?.length ? `; best prices for ${list(spec.specialty.map(word), 4)}` : "";
  const makes = recipesForNpc(npcKey).map((r) => r.name);
  const parts: string[] = [];
  // Everything they sell, always: "who sells X?" must find X here.
  if (sells.length) parts.push(`sells ${sells.join(", ")}`);
  if (buys.length) parts.push(`buys ${list(buys, detailed ? 8 : 4)}${best}`);
  if (makes.length) parts.push(`crafts ${list(makes, detailed ? 12 : 3)}`);
  return parts.join("; ");
}

// ---------- The world's shops (who sells what, everywhere) ----------

const jobOf = (key: string) => SETTLEMENT_NPCS.find((n) => n.key === key)?.job;
const TOWN_SHOPS = SETTLEMENT_NPCS.filter((n) => n.job === "shopkeeper").map((n) => n.key);
const TOWN_INNS = SETTLEMENT_NPCS.filter((n) => n.job === "innkeeper").map((n) => n.key);

/** Item → the NPCs who sell it. */
function sellersByItem(): Map<string, string[]> {
  const by = new Map<string, string[]>();
  for (const [npcKey, stock] of Object.entries(SHOP_STOCK)) for (const t of stock) by.set(t.itemKey, [...(by.get(t.itemKey) ?? []), npcKey]);
  return by;
}

/** Usual goods: sold by every town's general store and/or every inn (not worth naming each seller). */
function commonGroups(sellers: string[]): string[] {
  const groups: string[] = [];
  if (TOWN_SHOPS.every((k) => sellers.includes(k))) groups.push("every town's general store");
  if (TOWN_INNS.every((k) => sellers.includes(k))) groups.push("every inn");
  return groups;
}

const placeName = (npcKey: string) => placeByKey.get(placeKeyOf(npcKey) ?? "")?.name ?? "?";

/** "Pip (the grove)" — or, when they're all town shops, "the general stores of A, B and C". */
function describeSellers(keys: string[]): string {
  if (keys.every((k) => jobOf(k) === "shopkeeper")) return `the general store${keys.length > 1 ? "s" : ""} of ${and(keys.map(placeName))}`;
  // A caravan is never in one place for long (src/lib/mind/caravan.ts).
  return and(keys.map((k) => profileFor(k)?.circuit?.length ? `${npcDef(k)?.name ?? k}'s travelling wagon, when she has them` : `${npcDef(k)?.name ?? k} (${placeName(k)})`));
}

/** Where every item in the world is sold. */
function tradeIndex(itemName: ItemNameOf): string[] {
  // Items with the same sellers share a line ("plank, stool, chair: Maren (Hollowmere)").
  const byWho = new Map<string, string[]>();
  for (const [item, sellers] of sellersByItem()) {
    const groups = commonGroups(sellers);
    const covered = new Set([...(groups.includes("every inn") ? TOWN_INNS : []), ...(groups.includes("every town's general store") ? TOWN_SHOPS : [])]);
    const others = sellers.filter((k) => !covered.has(k));
    const who = groups.length ? `${and(groups)}${others.length ? `, plus ${describeSellers(others)}` : ""}` : describeSellers(others);
    byWho.set(who, [...(byWho.get(who) ?? []), itemName(item)]);
  }
  const lines = [...byWho].map(([who, items]) => `${items.join(", ")}: ${who}`);
  lines.push("Fruit tree saplings (other than apple) are sold only in towns whose land suits them, as listed here.");
  return lines;
}

/** Rare goods sold in one place (not the usual store and inn goods). */
function rareGoodsIn(placeKey: string, itemName: ItemNameOf): string[] {
  const out: string[] = [];
  for (const [item, sellers] of sellersByItem()) {
    if (commonGroups(sellers).length) continue;
    if (sellers.some((k) => placeKeyOf(k) === placeKey)) out.push(itemName(item));
  }
  return out;
}

/** Who makes what, everywhere. */
function craftIndex(): string[] {
  return [...NPC_DEFS].flatMap((n) => {
    const makes = recipesForNpc(n.key).map((r) => r.name);
    const where = placeByKey.get(placeKeyOf(n.key) ?? "")?.name;
    return makes.length ? [`${n.name} (${where ?? n.role}) makes ${makes.join(", ")}`] : [];
  });
}

/** The nearest NPC (same place first) who knows `topic`, as "Name (Role, here)" / "(Role, in Town)". */
function whoToAsk(npcKey: string, topic: KnowledgeTopic): string | null {
  const homeKey = placeKeyOf(npcKey);
  const home = homeKey ? placeByKey.get(homeKey) : undefined;
  let best: { key: string; d: number } | null = null;
  for (const n of NPC_DEFS) {
    if (n.key === npcKey || !topicsOf(n.key).has(topic)) continue;
    const pk = placeKeyOf(n.key);
    const p = pk ? placeByKey.get(pk) : undefined;
    // Same place first, an innkeeper (who knows it all) before anyone else there; then the nearest town.
    const d = pk === homeKey ? (jobOf(n.key) === "innkeeper" || n.trades.includes("innkeeper") ? -2 : -1) : home && p ? dist(home, p) : Infinity;
    if (!best || d < best.d) best = { key: n.key, d };
  }
  if (!best) return null;
  const d = npcDef(best.key)!;
  const pk = placeKeyOf(best.key);
  const where = pk === homeKey ? "here" : `in ${placeByKey.get(pk ?? "")?.name ?? "another town"}`;
  return `${d.name} (${d.role}, ${where})`;
}

/** How a few things in the world work (every line true to the game's rules). */
function howThingsWork(): string[] {
  const animals = Object.values(RANCH_SPECIES).map((s) => `${s.young.toLowerCase()}s ${s.price} coins`).join(", ");
  return [
    `Homesteads lie south of the village: claim a free site at its "For sale" sign, then buy land next to it at ${PARCEL_PRICE} coins a parcel. Each parcel is a field, pasture, vineyard, orchard, the barn or the workshop.`,
    `Nobody sells animals. Players buy them on their own homestead, as many as its pastures hold (${animals}). Fed with crops, they give ${Object.values(RANCH_SPECIES).map((s) => s.produce).join(", ")}.`,
    "Jobs: Hettie (the post), the makers (suppliers), Old Sorrel, Mayor Wynn and the bounty keepers (guards) and Tamsin (escorts) hire for a daily shift and a wage.",
    "Selling: specialists pay most; Odo (village plaza) buys nearly anything for less; Vesna (Hollowmere) buys far-land curios and boss trophies. A town that's had plenty of something pays less for it for a while.",
    `Waystones: walking up to one attunes it; from beside a waystone, travel to any attuned one is free (${TRAVEL_COST} coins from anywhere else, from the map).`,
    "Every town has an inn where the innkeeper sells hot food and travellers can rest by the hearth.",
    `The ${TOWNS.length} towns out on the continent (${TOWNS.slice(0, 3).map((t) => t.name).join(", ")}…) each have a bounty board with jobs that pay.`,
    "Bjorn at the forge in Hollowmere upgrades swords, axes and fishing rods (up to +3) for coin and materials, and repairs worn tools (they wear with use and work worse when worn).",
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
  const homePlace = home ? placeByKey.get(home.place) : undefined;
  const topics = topicsOf(npcKey);
  if (home) lines.push(`You live in ${home.describe}.`);
  const own = tradeLine(npcKey, true, itemName);
  lines.push(own ? `What you do: ${own}.` : "You don't run a shop or buy goods.");
  if (home) {
    const neighbours = neighboursOf(npcKey, home.place)
      .map((k) => { const d = npcDef(k); if (!d) return null; const t = tradeLine(k, false, itemName); return `- ${d.name} (${d.role})${t ? `: ${t}` : ""}`; })
      .filter((x): x is string => !!x);
    if (neighbours.length) lines.push(`Your neighbours in ${home.name}:`, ...neighbours);
  }

  // The towns nearby (everyone knows them), or every town's way (roads).
  const others = PLACES.filter((p) => p.key !== home?.place);
  if (homePlace) {
    const byDist = [...others].sort((a, b) => dist(homePlace, a) - dist(homePlace, b));
    const near = byDist.filter((p) => dist(homePlace, p) < NEARBY_TILES);
    if (near.length) {
      lines.push("Towns nearby:");
      for (const p of near) { const rare = rareGoodsIn(p.key, itemName); lines.push(`- ${p.name}: ${bearing(homePlace, p)}${rare.length ? `; sells ${rare.join(", ")}` : ""}`); }
    }
    const far = byDist.filter((p) => dist(homePlace, p) >= NEARBY_TILES);
    if (far.length && topics.has("roads")) lines.push(`The other towns and where they lie from here: ${far.map((p) => `${p.name} (${bearing(homePlace, p)})`).join("; ")}.`);
    else if (far.length) lines.push(`Other towns you've only heard the names of: ${far.map((p) => p.name).join(", ")}.`);
  } else {
    lines.push(`Towns on the continent: ${others.map((p) => p.name).join(", ")}.`);
  }

  if (topics.has("trade")) lines.push("Where things are sold, anywhere in the world:", ...tradeIndex(itemName).map((l) => `- ${l}`));
  if (topics.has("craft")) lines.push("Who makes things, anywhere in the world:", ...craftIndex().map((l) => `- ${l}`));

  // For what they don't know: someone who really does.
  const ask = (["trade", "craft", "roads"] as const).filter((t) => !topics.has(t)).map((t) => [t, whoToAsk(npcKey, t)] as const).filter(([, who]) => who);
  if (ask.length) lines.push("What you don't know, and who does (they know about it; that doesn't mean they sell or make it):", ...ask.map(([t, who]) => `- ${TOPIC_ASK[t]}: you don't know, but ${who} does.`));

  lines.push("How things work:", ...howThingsWork().map((l) => `- ${l}`));
  return lines.join("\n");
}

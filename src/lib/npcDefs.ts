// The seeded NPCs: who they are, where they live and what trades they do.
// Pure data (no DB) so the HUD, API routes and tickd can read it; the
// seeder (src/lib/seed.ts) keeps the npcs table in step with it.
//
// Keys are `<place>_<name>` and never name a job: jobs live in `trades`,
// and recipes and shop rules key off trades, so any number of NPCs can
// share one. Renamed keys are mapped in src/lib/npcKeys.ts.

import { SETTLEMENT_NPCS } from "./settlements";
import type { NpcDef, NpcTrade } from "@/types/npc";
import type { TownJob } from "@/types/settlement";

export type { NpcDef, NpcTrade } from "@/types/npc";

export const NPC_DEFS: NpcDef[] = [
  {
    key: "village_marigold",
    name: "Marigold",
    trades: ["baker"],
    role: "Village Baker",
    persona:
      "Marigold is a warm, flour-dusted baker who calls everyone 'love'. She runs the little bakery by the cabins, with its windows full of loaves and pies, bakes far more than she sells, and is happier talking than selling. Loves sharing a warm bun.",
    greeting: "Oh, hello love! Mind the flour. You look like someone who could use a warm bun.",
    tilePos: [51, 20], // between her bread table and her door (bakery_village)
    wanderRadius: 90,
    appearance: { body: "female", skin: "#f1c9a5", hair: "bob", hairColor: "#c94f2a", shirtColor: "#f7e7d3", pantsColor: "#7a4a2a" },
    mood: "cheerful",
  },
  {
    key: "village_bram",
    name: "Bram",
    trades: [],
    role: "Cabin Dweller",
    persona:
      "Bram is a jolly cabin dweller with a big laugh and an even bigger beard. Remembers every neighbor's name. Loves a good story by the fire and a bowl of root stew on a cold night.",
    greeting: "Welcome, neighbor! Stew's on. Sit, sit — tell me where you've been.",
    tilePos: [4, 40],
    wanderRadius: 80,
    appearance: { body: "male", skin: "#d9a066", hair: "messy1", hairColor: "#3b2a1a", shirtColor: "#7a3e2e", pantsColor: "#2e2e3a" },
    mood: "jolly",
  },
  {
    key: "village_pip",
    name: "Pip",
    trades: ["shopkeeper"],
    role: "Cabin Dweller",
    persona:
      "Pip is a quick, curious cabin dweller who collects interesting rocks and odds. Trades small favours for small stories and is delighted by anything shiny.",
    greeting: "Ah! A visitor. Or a neighbor. Both welcome. Do you have any interesting rocks?",
    tilePos: [16, 8],
    wanderRadius: 70,
    appearance: { body: "male", skin: "#f1c9a5", hair: "spiked", hairColor: "#e8c14a", shirtColor: "#4a7c59", pantsColor: "#3a3a3a" },
    mood: "curious",
  },
  {
    key: "village_wren",
    name: "Wren",
    trades: ["herbalist"],
    role: "Wandering Cabin Dweller",
    persona:
      "Wren is a soft-spoken cabin dweller who never stays put. Knows every plant in the grove by name and prefers quiet corners to crowds. Trades plant knowledge for the herbs themselves.",
    greeting: "Shh — do you hear that? The mint is blooming. Bring me herbs and I'll teach you something.",
    tilePos: [16, 56],
    wanderRadius: 260,
    appearance: { body: "female", skin: "#c68e5a", hair: "long", hairColor: "#2f4f3f", shirtColor: "#6b8f71", pantsColor: "#5a4632" },
    mood: "serene",
  },
  {
    key: "village_oswin",
    name: "Elder Oswin",
    trades: ["elder"],
    role: "Cabin Elder",
    persona:
      "Elder Oswin has lived in the grove longer than anyone. Slow, kind, endlessly patient. Remembers when the cabin site was a meadow. Gives small tasks that bind the village together and tells stories about the old days.",
    greeting: "Ah, a new face. Or an old one I've forgotten — forgive me. Sit with me a moment.",
    tilePos: [12, 12],
    wanderRadius: 60,
    appearance: { body: "male", skin: "#e8c39e", hair: "buzzcut", hairColor: "#dcdcdc", shirtColor: "#8a7f9e", pantsColor: "#4a4a5a" },
    mood: "calm",
  },
  {
    key: "village_tobin",
    name: "Tobin",
    trades: [],
    role: "Village Kid",
    persona:
      "Tobin is a small kid who lives at one of the cabins and mostly just wants someone to talk to. Full of questions, collects feathers, afraid of the fox but also wants to be its friend.",
    greeting: "Hi! Hi. Do you want to see my feather collection? It's mostly one feather.",
    tilePos: [22, 18],
    wanderRadius: 200,
    appearance: { body: "male", skin: "#f1c9a5", hair: "cowlick", hairColor: "#6b4226", shirtColor: "#e9c46a", pantsColor: "#264653" },
    mood: "lonely",
  },
  {
    key: "village_greta",
    name: "Greta",
    trades: ["tinker", "smith"],
    role: "Cabin Dweller",
    persona:
      "Greta is a focused cabin dweller with a workshop corner. Clanking, whirring, the occasional small explosion. Always glad to show a working gadget and trade repair work for firewood. Buys oak logs from the west forest and turns them into chairs, tables and bookshelves.",
    greeting: "Careful with that wrench — the small explosion was on purpose. Need something fixed?",
    tilePos: [50, 32],
    wanderRadius: 80,
    appearance: { body: "female", skin: "#d9a066", hair: "bangs", hairColor: "#222222", shirtColor: "#a07a4a", pantsColor: "#3d3d3d" },
    mood: "focused",
  },
  {
    key: "village_hollis",
    name: "Hollis",
    trades: ["miller"],
    role: "Miller",
    persona:
      "Hollis is a steady, methodical miller who runs the windmill just north of the wheat field. Proud of the grain. Knows everyone's name in the village and never lets a baker run out of flour.",
    greeting: "Sheaf of wheat, eh? Good haul. Bring it here, I'll get it ground.",
    tilePos: [40, -48],
    wanderRadius: 80,
    appearance: { body: "male", skin: "#f1c9a5", hair: "buzzcut", hairColor: "#5a4632", shirtColor: "#c8a06a", pantsColor: "#3a3a3a" },
    mood: "steady",
  },
  // ── Hollowmere (woodcutters' town on the King's Road, west of Whisperwood)
  {
    key: "hollowmere_bjorn",
    name: "Bjorn",
    trades: ["smith"],
    role: "Blacksmith of Hollowmere",
    persona:
      "Bjorn is a broad, soot-streaked blacksmith with a booming laugh and a soft spot for good steel. He forges blades from stone, thorns and boar hide, buys the raw stuff off anyone brave enough to fetch it from Whisperwood, and at his forge on the south side of town he'll upgrade a sword, an axe or a fishing rod (up to +3) for coin and materials. Proud of Hollowmere, wary of the Greyspine caverns.",
    greeting: "Hah! Another traveller off the King's Road. Need an edge on something? Step into my forge with thorns and hide and I'll make your gear sing.",
    tilePos: [-363, 24],
    wanderRadius: 70,
    appearance: { body: "male", skin: "#c68e5a", hair: "buzzcut", hairColor: "#2b1d14", shirtColor: "#3a3a4a", pantsColor: "#5a4632" },
    mood: "hearty",
  },
  {
    key: "hollowmere_ivy",
    name: "Ivy",
    trades: ["innkeeper"],
    role: "Innkeeper of Hollowmere",
    persona:
      "Ivy runs the Sawdust & Ale, Hollowmere's inn, with brisk warmth. She sells bread and calming tea to tired woodcutters, knows every rumour on the road, and worries about whoever went into the Greyspine cave last.",
    greeting: "Come in out of the pines, traveller. Bread's fresh and the tea will put the colour back in you.",
    tilePos: [-337, -1],
    wanderRadius: 60,
    appearance: { body: "female", skin: "#f1c9a5", hair: "long", hairColor: "#8c5a2b", shirtColor: "#4a7c59", pantsColor: "#3d3d3d" },
    mood: "warm",
  },
  {
    key: "hollowmere_sorrel",
    name: "Old Sorrel",
    trades: ["elder"],
    role: "Hollowmere Elder",
    persona:
      "Old Sorrel has felled more pines than anyone alive and now keeps the town's ledger of jobs. Dry humour, long memory. Worries about the bramble boars growing bolder in Whisperwood and always needs more wood for winter.",
    greeting: "Mm. You've the look of someone who can swing an axe. Hollowmere has work, if you want it.",
    tilePos: [-342, 5],
    wanderRadius: 50,
    appearance: { body: "male", skin: "#e8c39e", hair: "plain", hairColor: "#dcdcdc", shirtColor: "#7a4a2a", pantsColor: "#4a4a5a" },
    mood: "dry",
  },
  // ── Brightwater (fishing town past the Silverrun bridge)
  {
    key: "brightwater_marina",
    name: "Marina",
    trades: ["fishmonger"],
    role: "Fishmonger of Brightwater",
    persona:
      "Marina is quick-witted and sun-browned, mends nets while she talks, and runs the fishing dock on the Silverrun's west bank. Buys garden produce for the fish stews she sells to sailors, and pays better than anyone east of the river.",
    greeting: "Mind the nets! The dock's just there if you fancy a cast — and if you've grown anything, I'll buy it for the stew pot.",
    tilePos: [-632, 3],
    wanderRadius: 60,
    appearance: { body: "female", skin: "#a86a3d", hair: "bob", hairColor: "#2b1d14", shirtColor: "#2a9d8f", pantsColor: "#264653" },
    mood: "lively",
  },
  {
    key: "brightwater_tobias",
    name: "Tobias",
    trades: ["boatwright"],
    role: "Boatwright of Brightwater",
    persona:
      "Tobias builds the little boats of Brightwater by the bridge and is always short of good oak. Gentle, slow-spoken, pays well for logs carried all the way from Whisperwood.",
    greeting: "Ah, good timber's hard to come by this side of the mountains. Bring me logs and I'll pay you fair — fairer than Greta, I'd wager.",
    tilePos: [-628, 11],
    wanderRadius: 70,
    appearance: { body: "male", skin: "#d9a066", hair: "messy1", hairColor: "#5a3a1a", shirtColor: "#5b7db1", pantsColor: "#3a3a3a" },
    mood: "gentle",
  },
  {
    key: "brightwater_wynn",
    name: "Mayor Wynn",
    trades: ["mayor"],
    role: "Mayor of Brightwater",
    persona:
      "Mayor Wynn is a cheerful, slightly pompous mayor who loves ceremonies and fears the wisps that drift out of the Greyspine caverns at night. Offers generous bounties for brave deeds and trophies from the Old Rootking.",
    greeting: "Welcome, welcome to Brightwater, jewel of the Silverrun! We do so need heroes — the caverns grow restless.",
    tilePos: [-712, 4],
    wanderRadius: 60,
    appearance: { body: "male", skin: "#f1c9a5", hair: "bedhead", hairColor: "#c94f2a", shirtColor: "#7b5ea7", pantsColor: "#2e2e3a" },
    mood: "cheerful",
  },
  {
    key: "brightwater_coral",
    name: "Coral",
    trades: ["innkeeper"],
    role: "Innkeeper of the Salted Gull",
    persona:
      "Coral keeps the Salted Gull, Brightwater's harbour inn, full of fishermen's stories and fish stew. Quick-witted, a little salty, and the first to hear when someone lands a legendary catch. Sells stew, bread and tea; lets weary travellers rest by the fire.",
    greeting: "In you come, out of the spray! Stew's on, and there's a story going round about a giant pike.",
    tilePos: [-709, -1],
    wanderRadius: 40,
    appearance: { body: "female", skin: "#8d5524", hair: "long", hairColor: "#1a1a1a", shirtColor: "#2a6a7a", pantsColor: "#3a3a3a" },
    mood: "wry",
  },
  // ── The village inn
  {
    key: "village_hettie",
    name: "Hettie",
    trades: ["innkeeper"],
    role: "Innkeeper of the Wayfarer's Rest",
    persona:
      "Hettie runs the Wayfarer's Rest on the village plaza: a round, rosy woman who remembers every face and every rumour. Sells hot stew, bread and tea, lets the weary rest by the hearth, and loves to tell newcomers what's worth doing — the Rootking, the rare fish, the wolves in Whisperwood.",
    greeting: "Welcome to the Wayfarer's Rest, dear! Sit, eat, and I'll tell you what's going on in the grove.",
    tilePos: [31, 19],
    wanderRadius: 40,
    appearance: { body: "female", skin: "#f1c9a5", hair: "bob", hairColor: "#a04a2a", shirtColor: "#a43a32", pantsColor: "#4a3a2a" },
    mood: "warm",
  },
];

// The continent's townsfolk (scripts/gen-settlements.ts → settlementsData.json).
const JOB_TRADES: Readonly<Record<TownJob, NpcTrade[]>> = { innkeeper: ["innkeeper"], shopkeeper: ["shopkeeper"], bounty: ["bounty"], folk: [] };
for (const n of SETTLEMENT_NPCS) {
  NPC_DEFS.push({ key: n.key, name: n.name, role: n.role, persona: n.persona, greeting: n.greeting, tilePos: n.tilePos, wanderRadius: n.wanderRadius, appearance: n.appearance, mood: n.mood, trades: JOB_TRADES[n.job] });
}

const BY_KEY: ReadonlyMap<string, NpcDef> = new Map(NPC_DEFS.map((n) => [n.key, n]));

/** The NPC with this key, if it's a seeded one. */
export function npcDef(key: string): NpcDef | undefined {
  return BY_KEY.get(key);
}

/** The trades of the NPC with this key (none for unknown keys). */
export function npcTrades(key: string): readonly NpcTrade[] {
  return BY_KEY.get(key)?.trades ?? [];
}

/** Every seeded NPC that does this trade. */
export function npcsWithTrade(trade: NpcTrade): NpcDef[] {
  return NPC_DEFS.filter((n) => n.trades.includes(trade));
}

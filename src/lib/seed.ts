import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/db";
import {
  activities,
  animals,
  buildings,
  cosmeticItems,
  enemies,
  items,
  missions,
  npcs,
  resourceNodes,
  sponsors,
  worldState,
  worldEvents,
  type Appearance,
  type MissionRequirement,
  type MissionReward,
} from "@/db/schema";
import { TILE, WILD_ZONES, tilePoint, tileRect } from "./worldmap";
import { isWalkableServer } from "./chunkCollisionServer";
import { getBuildingsManifest, getTemplate } from "./buildingsServer";
import { doorWorldPx, footprintOf } from "./buildingManifest";
import { getCropKind } from "@/lib/crops";
import { syncLotsFromManifest } from "./lots";
import { forestTrees } from "./forest";
import { REGION_NODES } from "./regions";
import { SETTLEMENT_NPCS } from "./settlements";
import { forageSpots } from "./forage";
import { BOSS_KIND } from "./progression";

export const ITEM_DEFS = [
  { key: "herb", name: "Wild Herb", kind: "material", icon: "🌿", description: "Fragrant and slightly minty.", value: 2 },
  { key: "berry", name: "Grove Berry", kind: "consumable", icon: "🫐", description: "Restores 4 HP.", value: 3 },
  { key: "stone", name: "River Stone", kind: "material", icon: "🪨", description: "Smooth and cool.", value: 1 },
  { key: "mushroom", name: "Speckled Mushroom", kind: "material", icon: "🍄", description: "Probably edible.", value: 4 },
  { key: "flour", name: "Bag of Flour", kind: "material", icon: "🌾", description: "Milled fresh.", value: 3 },
  { key: "wheat", name: "Sheaf of Wheat", kind: "material", icon: "🌾", description: "Golden and ready to mill.", value: 1 },
  { key: "radish_seeds", name: "Radish Seeds", kind: "seed", icon: "🌱", description: "Plant in your garden. Ready in about 15 minutes.", value: 2 },
  { key: "carrot_seeds", name: "Carrot Seeds", kind: "seed", icon: "🌱", description: "Plant in your garden. Ready in about 30 minutes.", value: 3 },
  { key: "tomato_seeds", name: "Tomato Seeds", kind: "seed", icon: "🌱", description: "Plant in your garden. Ready in about 1½ hours.", value: 5 },
  { key: "pumpkin_seeds", name: "Pumpkin Seeds", kind: "seed", icon: "🌱", description: "Plant in your garden. Ready in about 3 hours.", value: 8 },
  { key: "radish", name: "Radish", kind: "material", icon: "🔴", description: "Crisp and peppery.", value: 2 },
  { key: "carrot", name: "Carrot", kind: "material", icon: "🥕", description: "Sweet, earthy, garden-fresh.", value: 2 },
  { key: "tomato", name: "Tomato", kind: "material", icon: "🍅", description: "Sun-warm and juicy.", value: 3 },
  { key: "pumpkin", name: "Pumpkin", kind: "material", icon: "🎃", description: "Heavy. Worth it.", value: 20 },
  { key: "wood", name: "Log of Wood", kind: "material", icon: "🪵", description: "Oak, freshly chopped. Greta turns it into furniture.", value: 2 },
  { key: "fishing_rod", name: "Fishing Rod", kind: "tool", icon: "🎣", description: "Face deep water and press F to cast. Keep it in your bag.", value: 30 },
  { key: "silver_minnow", name: "Silver Minnow", kind: "material", icon: "🐟", description: "Tiny, quick and everywhere.", value: 2 },
  { key: "river_trout", name: "River Trout", kind: "material", icon: "🐟", description: "Speckled and strong against the current.", value: 4 },
  { key: "pond_perch", name: "Pond Perch", kind: "material", icon: "🐠", description: "Striped, curious, always hungry.", value: 3 },
  { key: "mud_carp", name: "Mud Carp", kind: "material", icon: "🐟", description: "Lives in the soft mud at the bottom.", value: 4 },
  { key: "bluegill", name: "Bluegill", kind: "material", icon: "🐠", description: "A flash of blue under the lily pads.", value: 7 },
  { key: "rainbow_trout", name: "Rainbow Trout", kind: "material", icon: "🐠", description: "Every colour of the Silverrun at noon.", value: 9 },
  { key: "catfish", name: "Whiskered Catfish", kind: "material", icon: "🐡", description: "Comes up from the deep after dark.", value: 10 },
  { key: "golden_carp", name: "Golden Carp", kind: "material", icon: "🐠", description: "Said to bring luck. Nobody lets it go.", value: 22 },
  { key: "moonfin", name: "Moonfin", kind: "material", icon: "🐟", description: "Its fins glow faintly under the moon.", value: 24 },
  { key: "storm_eel", name: "Storm Eel", kind: "material", icon: "🐍", description: "Only rises when rain churns the water.", value: 26 },
  { key: "ghost_koi", name: "Ghost Koi", kind: "material", icon: "🐠", description: "Pale as mist. Maybe it isn't there at all.", value: 80 },
  { key: "silverrun_pike", name: "Silverrun Pike", kind: "material", icon: "🦈", description: "The old king of the river.", value: 90 },
  { key: "egg", name: "Fresh Egg", kind: "material", icon: "🥚", description: "Still warm.", value: 2 },
  { key: "wool", name: "Tuft of Wool", kind: "material", icon: "🧶", description: "Soft and springy.", value: 3 },
  { key: "bat_wing", name: "Bat Wing", kind: "material", icon: "🦇", description: "Leathery and light. Wren buys them.", value: 2 },
  { key: "thorn", name: "Thornling Thorn", kind: "material", icon: "🌵", description: "Wickedly sharp. Greta makes blades from them.", value: 2 },
  { key: "boar_hide", name: "Boar Hide", kind: "material", icon: "🐗", description: "Tough and bristly. Good for grips and gear.", value: 5 },
  { key: "lost_doll", name: "Lost Doll", kind: "material", icon: "🧸", description: "A well-loved rag doll. Somebody small is missing this.", value: 0 },
  { key: "treasure_map", name: "Treasure Map", kind: "material", icon: "🗺️", description: "A hand-drawn scrap with a red X. Read it, find the spot, and dig.", value: 0 },
  { key: "sunken_cutlass", name: "Sunken Cutlass", kind: "tool", icon: "🗡️", description: "+12 attack. Pulled from a legendary cache; there's salt in its grain still.", value: 200, equippable: true },
  { key: "parcel", name: "Sealed Parcel", kind: "material", icon: "📦", description: "A bounty delivery. Take it to the bounty board of the town it's addressed to.", value: 0 },
  { key: "chitin", name: "Scorpion Chitin", kind: "material", icon: "🦂", description: "A plate of hard, sun-bleached shell from a sand scorpion.", value: 4 },
  { key: "lurker_hide", name: "Lurker Hide", kind: "material", icon: "🐸", description: "Slick, warty hide from a bog lurker. Waterproof, and smelly.", value: 7 },
  { key: "frost_pelt", name: "Frost Pelt", kind: "material", icon: "🐺", description: "Thick white fur from a frost wolf. The warmest thing you'll ever wear.", value: 9 },
  { key: "shade_essence", name: "Shade Essence", kind: "material", icon: "🟢", description: "A cold green glow, caught from a darkwood shade.", value: 8 },
  { key: "milk", name: "Fresh Milk", kind: "consumable", icon: "🥛", description: "Creamy milk from your ranch. Drink it, or sell it at an inn.", value: 4 },
  { key: "hot_stew", name: "Hot Stew", kind: "consumable", icon: "🍲", description: "A steaming bowl from the inn. Restores 12 HP.", value: 4 },
  { key: "wolf_pelt", name: "Wolf Pelt", kind: "material", icon: "🐺", description: "Thick grey fur from a Whisperwood wolf. Warm, and worth a fair price.", value: 6 },
  { key: "wisp_essence", name: "Wisp Essence", kind: "material", icon: "✨", description: "A cold glow from the night forest.", value: 10 },
  { key: "rootking_heartwood", name: "Rootking Heartwood", kind: "trophy", icon: "🌳", description: "Still warm. Proof you fought the Old Rootking.", value: 40 },
  { key: "slime_gel", name: "Slime Gel", kind: "material", icon: "🟢", description: "Wobbly.", value: 2 },
  { key: "honey_bun", name: "Honey Bun", kind: "consumable", icon: "🥐", description: "Restores 8 HP. Sticky fingers guaranteed.", value: 6 },
  { key: "bread", name: "Fresh Bread", kind: "consumable", icon: "🍞", description: "Still warm. Baked by Marigold.", value: 3 },
  { key: "tea", name: "Calming Tea", kind: "consumable", icon: "🍵", description: "Restores 6 HP. A Wren original.", value: 4 },
  { key: "cinnamon_knot", name: "Cinnamon Knot", kind: "consumable", icon: "🥯", description: "Restores 10 HP. Sticky-sweet.", value: 8 },
  { key: "recipe_cinnamon", name: "Recipe: Cinnamon Knots", kind: "recipe", icon: "📜", description: "A handwritten recipe card from the bakery.", value: 10 },
  { key: "recipe_tea", name: "Recipe: Calming Tea", kind: "recipe", icon: "📜", description: "Three herbs, hot water, patience.", value: 10 },
  { key: "wooden_sword", name: "Wooden Sword", kind: "tool", icon: "🗡️", description: "+2 attack. Splinters included.", value: 15, equippable: true },
  { key: "stone_sword", name: "Stone Sword", kind: "tool", icon: "🗡️", description: "+4 attack. Heavy, honest, sharp enough.", value: 20, equippable: true },
  { key: "thorn_blade", name: "Thorn Blade", kind: "tool", icon: "🗡️", description: "+6 attack. Bound in boar hide.", value: 40, equippable: true },
  { key: "wisp_blade", name: "Wisp Blade", kind: "tool", icon: "🗡️", description: "+9 attack. Hums faintly at night.", value: 80, equippable: true },
  { key: "sharp_axe", name: "Sharp Axe", kind: "tool", icon: "🪓", description: "+1 wood per chop. Keep it in your bag.", value: 45 },
  { key: "axe", name: "Woodcutter's Axe", kind: "tool", icon: "🪓", description: "Chops oaks in the west forest. Keep it in your bag.", value: 25 },
  { key: "lantern", name: "Brass Lantern", kind: "tool", icon: "🏮", description: "Glows softly at night.", value: 12, equippable: true },
  { key: "chair", name: "Oak Chair", kind: "furniture", icon: "🪑", description: "Sturdy. Place it at home.", value: 10, placeable: true },
  { key: "table", name: "Round Table", kind: "furniture", icon: "🟤", description: "Fits four friends.", value: 14, placeable: true },
  { key: "plant", name: "Potted Fern", kind: "furniture", icon: "🪴", description: "Purifies the air, allegedly.", value: 8, placeable: true },
  { key: "rug", name: "Woven Rug", kind: "furniture", icon: "🟥", description: "Ties the room together.", value: 12, placeable: true },
  { key: "bed", name: "Cozy Bed", kind: "furniture", icon: "🛏️", description: "For resting between adventures.", value: 20, placeable: true },
  { key: "lamp", name: "Paper Lamp", kind: "furniture", icon: "💡", description: "Warm glow.", value: 9, placeable: true },
  { key: "bookshelf", name: "Bookshelf", kind: "furniture", icon: "📚", description: "Mostly cookbooks.", value: 16, placeable: true },
  { key: "painting", name: "Landscape Painting", kind: "furniture", icon: "🖼️", description: "The grove at dusk.", value: 15, placeable: true },
  { key: "discount", name: "Discount Code", kind: "discount", icon: "🎟️", description: "A real code from a real sponsor.", value: 0 },
  { key: "fox_charm", name: "Fox Charm", kind: "trophy", icon: "🦊", description: "The fox trusts you now.", value: 25 },
  { key: "elder_seal", name: "Elder's Seal", kind: "trophy", icon: "🔏", description: "Proof you helped the village.", value: 30 },
] as const;

export const NPC_DEFS: {
  key: string;
  name: string;
  role: string;
  persona: string;
  greeting: string;
  /** Chunk-world tile units (ty grows down). Converted to pixels via tilePoint. */
  tilePos: [number, number];
  wanderRadius: number;
  appearance: Appearance;
  mood: string;
}[] = [
  {
    key: "baker",
    name: "Marigold",
    role: "Cabin Dweller",
    persona:
      "Marigold is a warm, flour-dusted cabin dweller who calls everyone 'love'. She keeps a tidy cabin, bakes out of habit more than trade, and is happier talking than selling. Loves sharing a warm bun.",
    greeting: "Oh, hello love! Mind the flour. You look like someone who could use a warm bun.",
    tilePos: [44, 14],
    wanderRadius: 90,
    appearance: { body: "female", skin: "#f1c9a5", hair: "bob", hairColor: "#c94f2a", shirtColor: "#f7e7d3", pantsColor: "#7a4a2a" },
    mood: "cheerful",
  },
  {
    key: "innkeeper",
    name: "Bram",
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
    key: "shopkeeper",
    name: "Pip",
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
    key: "herbalist",
    name: "Wren",
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
    key: "elder",
    name: "Elder Oswin",
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
    key: "orphan",
    name: "Tobin",
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
    key: "tinker",
    name: "Greta",
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
    key: "miller",
    name: "Hollis",
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
    key: "blacksmith",
    name: "Bjorn",
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
    key: "hm_innkeeper",
    name: "Ivy",
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
    key: "hm_elder",
    name: "Old Sorrel",
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
    key: "bw_fishmonger",
    name: "Marina",
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
    key: "bw_boatwright",
    name: "Tobias",
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
    key: "bw_mayor",
    name: "Mayor Wynn",
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
    key: "bw_innkeeper",
    name: "Coral",
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
    key: "innkeeper",
    name: "Hettie",
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
for (const n of SETTLEMENT_NPCS) {
  NPC_DEFS.push({ key: n.key, name: n.name, role: n.role, persona: n.persona, greeting: n.greeting, tilePos: n.tilePos, wanderRadius: n.wanderRadius, appearance: n.appearance, mood: n.mood });
}

// Animal roam zones in world-tile units (tileRect, ty grows downward).
// Village species stay near the houses (chunks 1..2, south of them);
// wild species live in the WILD_ZONES outskirts ring.
const ANIMAL_DEFS: { species: string; names: string[]; zone: { x: number; y: number; w: number; h: number } }[] = [
  { species: "sheep", names: ["Clover", "Dumpling", "Mabel"], zone: tileRect(6, 48, 24, 11) },
  { species: "cow", names: ["Buttercup", "Juniper"], zone: tileRect(126, -12, 24, 21) },
  // Pigs share the cows' pasture (the farm).
  { species: "pig", names: ["Truffle", "Hamlet"], zone: tileRect(126, -12, 24, 21) },
  // Llamas get their own meadow east of the village (chunk 3_0, fully open).
  { species: "llama", names: ["Paco", "Luna"], zone: tileRect(76, 5, 18, 12) },
  { species: "chicken", names: ["Nugget", "Pecky", "Henrietta", "Biscuit"], zone: tileRect(24, 33, 20, 12) },
  { species: "duck", names: ["Puddle", "Waddles", "Quilliam"], zone: tileRect(0, 49, 22, 10) },
  { species: "rabbit", names: ["Thimble", "Moss"], zone: tileRect(6, -54, 30, 20) },
  { species: "fox", names: ["Ember"], zone: tileRect(36, -59, 30, 24) },
  { species: "cat", names: ["Marmalade"], zone: tileRect(28, 18, 18, 9) },
  { species: "dog", names: ["Biscuit"], zone: tileRect(38, 30, 20, 14) },
  // Out west along the King's Road.
  { species: "sheep", names: ["Bracken", "Thistle"], zone: tileRect(-366, 22, 20, 8) },
  { species: "duck", names: ["Pebble", "Skipper", "Reed"], zone: tileRect(-646, 14, 22, 14) },
];

// Resource nodes scattered through the wild ring (world-tile units), all in
// unauthored chunks so they never collide with map art.
const NODE_DEFS: [string, string, number, number][] = [
  ["herb_patch", "herb", 8, 54], ["herb_patch", "herb", 26, 55], ["herb_patch", "herb", 48, 51],
  ["herb_patch", "herb", 22, -55], ["herb_patch", "herb", 44, -57],
  ["berry_bush", "berry", 14, 49], ["berry_bush", "berry", 64, 56], ["berry_bush", "berry", 130, -21],
  ["rock", "stone", 123, 12], ["rock", "stone", 135, 39], ["rock", "stone", -77, 6], ["rock", "stone", 52, 54],
  ["mushroom_ring", "mushroom", -76, -6], ["mushroom_ring", "mushroom", 130, 54],
  ["wheat_field", "wheat", 38, -45], ["wheat_field", "wheat", 44, -47], ["wheat_field", "wheat", 32, -42],
  // The regions west of the village place their own nodes (props keep clear of them).
  ...REGION_NODES.map((n): [string, string, number, number] => [n.kind, n.itemKey, n.tx, n.ty]),
];

const MISSION_DEFS: {
  key: string;
  npc: string;
  title: string;
  description: string;
  offerLine: string;
  completeLine: string;
  requirement: MissionRequirement;
  reward: MissionReward;
  repeatable?: boolean;
  sponsored?: boolean;
}[] = [
  {
    key: "baker_eggs",
    npc: "baker",
    title: "Three Eggs for Marigold",
    description: "Marigold needs 3 fresh eggs for the weekend cinnamon knots. The chickens near the apothecary drop them.",
    offerLine: "Tell you what, love — bring me three fresh eggs and I'll teach you my cinnamon knot recipe. The chickens by the apothecary are generous if you're kind to them.",
    completeLine: "Three perfect eggs! Here — my cinnamon knot recipe, written in my own hand. Don't tell my sister.",
    requirement: { type: "collect", itemKey: "egg", qty: 3 },
    reward: { coins: 15, xp: 20, items: [{ itemKey: "recipe_cinnamon", qty: 1 }, { itemKey: "honey_bun", qty: 2 }] },
    sponsored: true,
  },
  {
    key: "herbalist_herbs",
    npc: "herbalist",
    title: "Gather Wild Herbs",
    description: "Wren wants 3 wild herbs from the herb patches at the edges of the grove.",
    offerLine: "Bring me three herbs — the good ones grow where the trees thin out — and I'll teach you a recipe for calming tea.",
    completeLine: "Perfect. Smell that? That's the good stuff. Here's the tea recipe. Steep it slow.",
    requirement: { type: "collect", itemKey: "herb", qty: 3 },
    reward: { coins: 10, xp: 20, items: [{ itemKey: "recipe_tea", qty: 1 }] },
  },
  {
    key: "elder_pet",
    npc: "elder",
    title: "Say Hello to the Sheep",
    description: "Elder Oswin thinks the sheep have been lonely. Pet 2 of them.",
    offerLine: "The sheep out west have seemed glum. Would you go and say hello? Pet two of them for me — my knees aren't what they were.",
    completeLine: "You went? Wonderful. I can hear them bleating happier already. Take this seal — it marks you as a friend of the village.",
    requirement: { type: "pet", species: "sheep", qty: 2 },
    reward: { coins: 8, xp: 25, items: [{ itemKey: "elder_seal", qty: 1 }] },
  },
  {
    key: "orphan_talk",
    npc: "orphan",
    title: "Visit the Inn with Tobin",
    description: "Tobin wants you to go see Bram at the inn and tell him Tobin says hi.",
    offerLine: "Can you go tell Bram I said hi? He's at the inn. He makes a funny face when you say my name.",
    completeLine: "Did he make the face?? He always makes the face. Here, take this sweet bun my friend baked for me.",
    requirement: { type: "talk", npcKey: "innkeeper" },
    reward: { coins: 3, xp: 15, items: [{ itemKey: "honey_bun", qty: 1 }] },
  },
  {
    key: "innkeeper_slimes",
    npc: "innkeeper",
    title: "Slimes in the Cellar Field",
    description: "Slimes keep creeping toward the inn from the wild edges. Defeat 3.",
    offerLine: "Those slimes out past the trees have been getting bold. Knock three of them back and there's stew and a proper sword in it for you.",
    completeLine: "Ha! Knew you had it in you. Here — take this sword, it's better than the stick you've been using.",
    requirement: { type: "defeat", enemyKind: "slime", qty: 3 },
    reward: { coins: 20, xp: 40, items: [{ itemKey: "wooden_sword", qty: 1 }, { itemKey: "honey_bun", qty: 1 }] },
  },
  {
    key: "shopkeeper_stones",
    npc: "shopkeeper",
    title: "Interesting Rocks",
    description: "Pip will trade furniture for 4 river stones from the rocks near the pond.",
    offerLine: "Bring me four river stones from near the pond and I'll give you a chair. A good chair. Possibly the best chair.",
    completeLine: "Look at the SHEEN on these. Deal's a deal — one chair, as promised. And a fern, because I like you.",
    requirement: { type: "collect", itemKey: "stone", qty: 4 },
    reward: { coins: 5, xp: 20, items: [{ itemKey: "chair", qty: 1 }, { itemKey: "plant", qty: 1 }] },
    repeatable: true,
  },
  {
    key: "tinker_gel",
    npc: "tinker",
    title: "Gel for the Gears",
    description: "Greta needs 2 slime gel to grease her contraption. She'll build you a table.",
    offerLine: "Slime gel! Best lubricant in the grove. Bring me two blobs of it and I'll build you a table. Round. Very round.",
    completeLine: "Perfect viscosity. Here's your table — and a rug, I had it lying around.",
    requirement: { type: "collect", itemKey: "slime_gel", qty: 2 },
    reward: { coins: 6, xp: 20, items: [{ itemKey: "table", qty: 1 }, { itemKey: "rug", qty: 1 }] },
    repeatable: true,
  },
  {
    key: "miller_wheat",
    npc: "miller",
    title: "Grind the Wheat",
    description: "Hollis will turn your wheat into flour. Bring 4 sheaves.",
    offerLine: "Four wheat and I'll grind you four flour, straight off the millstone. Don't let it sit in the rain.",
    completeLine: "There you go — a full sack of flour, fresh from this morning's grind. Bakery's open, says I.",
    requirement: { type: "collect", itemKey: "wheat", qty: 4 },
    reward: { coins: 8, xp: 15, items: [{ itemKey: "flour", qty: 4 }] },
    repeatable: true,
  },
  {
    key: "tinker_wool",
    npc: "tinker",
    title: "Spinning a New Hat",
    description: "Greta can weave a straw hat if you bring her 3 tufts of wool.",
    offerLine: "Three tufts of wool and I'll stitch you a proper hat. I make them breathable, I promise.",
    completeLine: "Try the fit. Sun off your ears, just like the old country. There's the rug too — I had it lying around.",
    requirement: { type: "collect", itemKey: "wool", qty: 3 },
    reward: { coins: 4, xp: 15, items: [{ itemKey: "rug", qty: 1 }] },
    repeatable: true,
  },
  {
    key: "herbalist_mushroom",
    npc: "herbalist",
    title: "Tincture of the Cap",
    description: "Wren will trade a calming tincture for 3 speckled mushrooms.",
    offerLine: "Three mushrooms and I'll brew you a tincture. Tastes the way the woods smell after rain.",
    completeLine: "Here's a flask. Two drops under the tongue and the world gets quieter. I'll put a rug down for you while you wait it out.",
    requirement: { type: "collect", itemKey: "mushroom", qty: 3 },
    reward: { coins: 6, xp: 12, items: [{ itemKey: "tea", qty: 1 }, { itemKey: "rug", qty: 1 }] },
  },
  {
    key: "shopkeeper_slimy",
    npc: "shopkeeper",
    title: "Slime-Gel Stockroom",
    description: "Pip buys slime gel in bulk. Bring him 5 blobs.",
    offerLine: "Five slime gel and I'll do the lamp. Brass and everything, and the rug to put under it.",
    completeLine: "Lovely consistency. Here's a lamp and a rug — and a little left over for a bookcase, why not.",
    requirement: { type: "collect", itemKey: "slime_gel", qty: 5 },
    reward: { coins: 10, xp: 18, items: [{ itemKey: "lantern", qty: 1 }, { itemKey: "rug", qty: 1 }, { itemKey: "bookshelf", qty: 1 }] },
    repeatable: true,
  },
  {
    key: "orphan_bunny",
    npc: "orphan",
    title: "Catching the Sunset Bunny",
    description: "Tobin lost his favorite rabbit. Pet two of them to calm them down.",
    offerLine: "The bunnies at the north end get nervous around dusk. Pet a couple and see if one of them is BunBun.",
    completeLine: "You found her! She's OK, just shy. Here — feather for your trouble, and a painting for your wall.",
    requirement: { type: "pet", species: "rabbit", qty: 2 },
    reward: { coins: 5, xp: 12, items: [{ itemKey: "painting", qty: 1 }] },
  },
  {
    key: "shopkeeper_cabins",
    npc: "shopkeeper",
    title: "Visit a Cabin",
    description: "Pip wants you to drop by one of the cabins and say hello.",
    offerLine: "Stick your head in a cabin, any cabin, and tell me what the kettle's doing. I'll furnish the rest.",
    completeLine: "Kettle on, is it? Lovely. A bookcase and a lamp for the trouble — and a bed, if you'll take it.",
    requirement: { type: "visit", buildingKey: "cabin_1" },
    reward: { coins: 4, xp: 10, items: [{ itemKey: "bookshelf", qty: 1 }, { itemKey: "lamp", qty: 1 }, { itemKey: "bed", qty: 1 }] },
  },
  {
    key: "innkeeper_bats",
    npc: "innkeeper",
    title: "Bats in the Belfry",
    description: "Bats are roosting where they shouldn't. Defeat 2 of them.",
    offerLine: "Two bats in the belfry and I'll throw in a painting and a round on the house.",
    completeLine: "Belfry's clear. Here's the painting and dinner's on the inn tonight.",
    requirement: { type: "defeat", enemyKind: "bat", qty: 2 },
    reward: { coins: 12, xp: 20, items: [{ itemKey: "painting", qty: 1 }, { itemKey: "honey_bun", qty: 2 }] },
  },
  {
    key: "hm_boars",
    npc: "hm_elder",
    title: "Thin the Boars of Whisperwood",
    description: "Bramble boars have been charging woodcutters near Hollowmere. Old Sorrel wants 5 of them driven off.",
    offerLine: "The boars have grown bold — tusked half a cart to splinters last week. Drive off five of 'em and Hollowmere will owe you.",
    completeLine: "Five! The lads can work the west woods again. Here — coin, and some hides for Bjorn to make you something sharp.",
    requirement: { type: "defeat", enemyKind: "boar", qty: 5 },
    reward: { coins: 40, xp: 60, items: [{ itemKey: "boar_hide", qty: 2 }] },
  },
  {
    key: "hm_wood",
    npc: "hm_elder",
    title: "Wood for the Winter",
    description: "Hollowmere needs firewood before the frost. Bring Old Sorrel 30 logs.",
    offerLine: "Winter comes early this close to the Greyspine. Thirty logs would see the town through. Oaks grow in the grove past the pines.",
    completeLine: "That's a fine stack. Warm hearths all winter — and a little something for your trouble.",
    requirement: { type: "collect", itemKey: "wood", qty: 30 },
    reward: { coins: 50, xp: 40, items: [{ itemKey: "bread", qty: 3 }] },
    repeatable: true,
  },
  {
    key: "bw_wisps",
    npc: "bw_mayor",
    title: "Lights in the Dark",
    description: "Shade wisps drift out of the Greyspine caverns. Mayor Wynn will pay a bounty for 3.",
    offerLine: "Those cold little lights from the caverns — they frighten the fishermen something terrible. Three of them, and the town treasury is yours! Well, part of it.",
    completeLine: "Splendid! Brightwater sleeps easier tonight. A bounty, as promised, from a grateful town.",
    requirement: { type: "defeat", enemyKind: "wisp", qty: 3 },
    reward: { coins: 80, xp: 120, items: [{ itemKey: "wisp_essence", qty: 1 }] },
  },
  {
    key: "bw_heartwood",
    npc: "bw_mayor",
    title: "A Trophy for the Town Hall",
    description: "Mayor Wynn wants a Rootking Heartwood to display in the town hall.",
    offerLine: "They say the Old Rootking rises in the north woods each week. A piece of its heartwood in our town hall! Imagine the ceremony!",
    completeLine: "Magnificent! Look at the grain on it! Brightwater will never forget you.",
    requirement: { type: "collect", itemKey: "rootking_heartwood", qty: 1 },
    reward: { coins: 150, xp: 100 },
  },
];

let seededPromise: Promise<void> | null = null;
let buildingsSynced = false;
let wildlifeSynced = false;
let npcSynced = false;

// Move seeded NPCs to their chunk-world cabin-village positions and update
// role/persona/greeting for any existing rows. Runs once per process — edit
// NPC_DEFS and restart the dev server to re-apply. If the configured tile
// sits on a Collision tile, snap to the nearest walkable neighbour so NPCs
// stay reachable (the player can't walk to them otherwise, and the world
// heartbeat would reject any teleport to their feet).
async function syncNpcLayout() {
  if (npcSynced) return;
  npcSynced = true;
  try {
    for (const n of NPC_DEFS) {
      const p = tilePoint(n.tilePos[0], n.tilePos[1]);
      let x = p.x;
      let y = p.y;
      if (!(await isWalkableServer(x, y))) {
        const snap = await nearestWalkable(n.tilePos[0], n.tilePos[1]);
        x = snap.x;
        y = snap.y;
      }
      await db.update(npcs)
        .set({
          x, y, homeX: x, homeY: y,
          role: n.role, persona: n.persona, greeting: n.greeting,
          mood: n.mood, wanderRadius: n.wanderRadius,
          buildingId: null, sponsorId: null,
        })
        .where(eq(npcs.key, n.key));
    }
    // Ensure every NPC_DEFS entry has a row — catches new NPCs added since
    // the initial seed (seed() early-returns when worldState exists, so new
    // NPCs only land via this once-per-process upsert).
    for (const n of NPC_DEFS) {
      const p = tilePoint(n.tilePos[0], n.tilePos[1]);
      let x = p.x;
      let y = p.y;
      if (!(await isWalkableServer(x, y))) {
        const snap = await nearestWalkable(n.tilePos[0], n.tilePos[1]);
        x = snap.x;
        y = snap.y;
      }
      await db.insert(npcs).values({
        key: n.key, name: n.name, role: n.role,
        persona: n.persona, greeting: n.greeting,
        x, y, homeX: x, homeY: y,
        appearance: n.appearance, mood: n.mood, wanderRadius: n.wanderRadius,
        buildingId: null, sponsorId: null, active: true,
      }).onConflictDoNothing();
    }
  } catch (e) {
    npcSynced = false;
    console.warn("[seed] NPC layout sync failed:", e instanceof Error ? e.message : e);
  }
}

async function nearestWalkable(tx: number, ty: number): Promise<{ x: number; y: number }> {
  // Spiral search within a small radius; chicken-zones are big enough that
  // almost any random tile around a village core is reachable.
  for (let r = 1; r <= 8; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const p = tilePoint(tx + dx, ty + dy);
        if (await isWalkableServer(p.x, p.y)) return p;
      }
    }
  }
  // Fallback to the original position (should be unreachable for the rest
  // of this process since the chunk is fully walled — caller will see the
  // NPC but can't interact).
  return tilePoint(tx, ty);
}

// Adopt the chunk-world wildlife layout for an already-seeded DB: rebuild
// resource nodes at their new spots, clear enemies (they respawn from the new
// WILD_ZONES), and re-zone animals. Runs once per process — restart the dev
// server after changing the layout. NPCs are deliberately untouched.
async function syncWildlifeLayout() {
  if (wildlifeSynced) return;
  wildlifeSynced = true;
  try {
    // Wild nodes only: garden crops (owner_id set) belong to players.
    await db.delete(resourceNodes).where(isNull(resourceNodes.ownerId));
    const trees = forestTrees().map(([tx, ty]): [string, string, number, number] => ["oak_tree", "wood", tx, ty]);
    // The village's hand-placed nodes, the oak grove, and the forage
    // patches scattered over the continent (src/lib/forage.ts).
    const rows = [...NODE_DEFS, ...trees, ...forageSpots()].map(([kind, itemKey, tx, ty]) => {
      const p = tilePoint(tx, ty);
      const cfg = getCropKind(kind);
      // Crop kinds start fully grown (stage = stages-1). Non-crop kinds
      // use stages=2 (ready) from the config; missing config means a
      // legacy kind with no regrowth — start at the only stage (0).
      const stages = cfg?.stages ?? 1;
      return { kind, itemKey, x: p.x, y: p.y, qty: cfg?.yield ?? 1, stage: stages - 1 };
    });
    for (let i = 0; i < rows.length; i += 200) await db.insert(resourceNodes).values(rows.slice(i, i + 200));
    // Enemies respawn from the current zones; a risen world boss stays.
    await db.delete(enemies).where(ne(enemies.kind, BOSS_KIND));
    for (const def of ANIMAL_DEFS) {
      // Re-zone to the centre and drop any scheduled move: it was planned
      // from the old position, so clients would replay it from there.
      await db.update(animals)
        .set({
          zone: def.zone, x: def.zone.x + def.zone.w / 2, y: def.zone.y + def.zone.h / 2, targetX: null, targetY: null,
          movePath: null, moveStartAt: null, moveSpeed: null, moveAfter: null,
        })
        // By name too: a species can have several herds in different places.
        // Ranch animals (owned) keep their pens.
        .where(and(eq(animals.species, def.species), inArray(animals.name, def.names), isNull(animals.ownerId)));
      // Species / names added to ANIMAL_DEFS after the DB was seeded
      // (e.g. pigs) are created here so existing worlds get them too.
      const existing = await db.select({ name: animals.name }).from(animals).where(and(eq(animals.species, def.species), inArray(animals.name, def.names), isNull(animals.ownerId)));
      const have = new Set(existing.map((r) => r.name));
      for (const name of def.names) {
        if (have.has(name)) continue;
        await db.insert(animals).values({
          species: def.species, name,
          x: def.zone.x + def.zone.w / 2, y: def.zone.y + def.zone.h / 2,
          zone: def.zone, hunger: Math.floor(Math.random() * 40),
        });
      }
    }
  } catch (e) {
    wildlifeSynced = false;
    console.warn("[seed] wildlife layout sync failed:", e instanceof Error ? e.message : e);
  }
}

// Upsert manifest buildings into the DB and drop rows no longer in the
// manifest. Runs once per process (i.e. once per dev-server start): edit the
// manifest and restart to sync.
async function syncBuildingsFromManifest() {
  if (buildingsSynced) return;
  buildingsSynced = true;
  try {
    const manifest = await getBuildingsManifest();
    for (const entry of manifest.buildings) {
      if (entry.kind === "scenery") continue; // stamped art only (town squares): no building row
      const template = await getTemplate(entry);
      const fp = footprintOf(template);
      const values = {
        key: entry.key,
        name: entry.name,
        kind: entry.kind,
        description: entry.description ?? "",
        color: entry.color ?? "#d9a066",
        tx: entry.tx,
        ty: entry.ty,
        tw: fp.tw,
        th: fp.th,
        menu: entry.menu ?? [],
        reservable: entry.reservable ?? true,
      };
      await db.insert(buildings).values(values).onConflictDoUpdate({ target: buildings.key, set: values });
    }
    const keep = new Set(manifest.buildings.filter((b) => b.kind !== "scenery").map((b) => b.key));
    const rows = await db.select().from(buildings);
    for (const row of rows) {
      if (!keep.has(row.key)) await db.delete(buildings).where(eq(buildings.key, row.key));
    }
  } catch (e) {
    // A broken manifest must not take the world API down.
    buildingsSynced = false;
    console.warn("[seed] building manifest sync failed:", e instanceof Error ? e.message : e);
  }
}

/** Idempotent: creates the world if it does not exist. Safe to call on every request. */
export function ensureSeeded() {
  if (!seededPromise) seededPromise = seed().catch((e) => { seededPromise = null; throw e; });
  return seededPromise
    .then(() => syncBuildingsFromManifest())
    .then(() => syncLots())
    .then(() => syncWildlifeLayout())
    .then(() => syncNpcLayout())
    .then(() => syncItems())
    .then(() => syncMissions())
    .then(() => syncCosmetics())
    .then(() => seedActivities());
}

let lotsSynced = false;
async function syncLots() {
  if (lotsSynced) return;
  lotsSynced = true;
  try {
    await syncLotsFromManifest();
  } catch (e) {
    lotsSynced = false;
    console.warn("[seed] lot sync failed:", e instanceof Error ? e.message : e);
  }
}

/** The fishing dock's spot, just north of the land lots' road. */
const FISHING_DOCK = { x: 1080, y: 900 };
/** Brightwater's fishing dock, on the Silverrun's west bank by the bridge. */
const RIVER_DOCK = tilePoint(-615, 2); // the end of the pier
/** Pixel rows of the land-lot strip (chunk row cy −4, ty 60..74). */
const LAND_STRIP_Y0 = 60 * 16, LAND_STRIP_Y1 = 75 * 16;

async function seedActivities() {
  // Existing worlds: a dock seeded inside the land-lot strip moves out.
  await db
    .update(activities)
    .set(FISHING_DOCK)
    .where(sql`${activities.kind} = 'fishing_dock' and ${activities.y} >= ${LAND_STRIP_Y0} and ${activities.y} < ${LAND_STRIP_Y1}`);
  // Brightwater's dock on the Silverrun (added to existing worlds too).
  const all = await db.select({ kind: activities.kind, x: activities.x, y: activities.y }).from(activities);
  const hasRiverDock = all.some((a) => a.kind === "fishing_dock" && Math.hypot(a.x - RIVER_DOCK.x, a.y - RIVER_DOCK.y) < 300);
  if (all.length > 0 && !hasRiverDock) {
    await db.insert(activities).values({ kind: "fishing_dock", status: "live", ...RIVER_DOCK, config: { capacity: 2, durationSec: 60, rewardCoins: 30, rewardXp: 15 } });
  }
  if (all.length > 0) return;
  // Fishing dock — 2-player co-op.
  await db.insert(activities).values({
    kind: "fishing_dock",
    status: "live",
    ...FISHING_DOCK,
    config: { capacity: 2, durationSec: 60, rewardCoins: 25, rewardXp: 12 },
  });
  await db.insert(activities).values({ kind: "fishing_dock", status: "live", ...RIVER_DOCK, config: { capacity: 2, durationSec: 60, rewardCoins: 30, rewardXp: 15 } });
}

async function syncItems() {
  try {
    for (const it of ITEM_DEFS) {
      const values = {
        key: it.key,
        name: it.name,
        kind: it.kind,
        icon: it.icon,
        description: it.description,
        value: it.value,
        equippable: "equippable" in it ? it.equippable : false,
        placeable: "placeable" in it ? it.placeable : false,
      };
      await db.insert(items).values(values).onConflictDoUpdate({
        target: items.key,
        set: { name: values.name, kind: values.kind, icon: values.icon, description: values.description, value: values.value, equippable: values.equippable, placeable: values.placeable },
      });
    }
  } catch (e) {
    console.warn("[seed] item sync failed:", e instanceof Error ? e.message : e);
  }
}

async function syncMissions() {
  try {
    const npcRows = await db.select({ id: npcs.id, key: npcs.key }).from(npcs);
    const npcIdByKey = new Map(npcRows.map((r) => [r.key, r.id]));
    for (const m of MISSION_DEFS) {
      const npcId = npcIdByKey.get(m.npc);
      if (!npcId) continue;
      const values = {
        key: m.key, npcId, title: m.title, description: m.description, offerLine: m.offerLine, completeLine: m.completeLine,
        requirement: m.requirement, reward: m.reward, sponsorId: null,
      };
      await db.insert(missions).values(values).onConflictDoUpdate({
        target: missions.key,
        set: { npcId, title: m.title, description: m.description, offerLine: m.offerLine, completeLine: m.completeLine, requirement: m.requirement, reward: m.reward },
      });
    }
  } catch (e) {
    console.warn("[seed] mission sync failed:", e instanceof Error ? e.message : e);
  }
}

async function syncCosmetics() {
  try {
    for (const it of COSMETIC_CATALOG) {
      // Schema declares timestamp (Date | null); the canonical catalog type
      // uses strings for portability across server/client boundaries. Parse
      // ISO strings to Dates here so Drizzle's typed insert is happy.
      const from = it.availableFrom ? new Date(it.availableFrom) : null;
      const until = it.availableUntil ? new Date(it.availableUntil) : null;
      const values = {
        key: it.key,
        name: it.name,
        slot: it.slot,
        assetRef: it.assetRef,
        tintColor: it.tintColor,
        rarity: it.rarity,
        coinPrice: it.coinPrice,
        gemPrice: it.gemPrice,
        sponsorGrantedOnly: it.sponsorGrantedOnly,
        sponsorId: it.sponsorId,
        availableFrom: from,
        availableUntil: until,
      };
      await db.insert(cosmeticItems).values(values).onConflictDoUpdate({
        target: cosmeticItems.key,
        set: {
          name: values.name,
          slot: values.slot,
          assetRef: values.assetRef,
          tintColor: values.tintColor,
          rarity: values.rarity,
          coinPrice: values.coinPrice,
          gemPrice: values.gemPrice,
          sponsorGrantedOnly: values.sponsorGrantedOnly,
          sponsorId: values.sponsorId,
          availableFrom: values.availableFrom,
          availableUntil: values.availableUntil,
        },
      });
    }
  } catch (e) {
    console.warn("[seed] cosmetic sync failed:", e instanceof Error ? e.message : e);
  }
}

const COSMETIC_CATALOG = await import("./cosmetics").then((m) => m.COSMETIC_CATALOG);

async function seed() {
  const [ws] = await db.select().from(worldState).where(eq(worldState.id, 1));
  if (ws) return;
  await db.transaction(async (tx) => {
    await tx.insert(worldState).values({ id: 1 }).onConflictDoNothing();
    for (const it of ITEM_DEFS) {
      await tx
        .insert(items)
        .values({
          key: it.key,
          name: it.name,
          kind: it.kind,
          icon: it.icon,
          description: it.description,
          value: it.value,
          equippable: "equippable" in it ? it.equippable : false,
          placeable: "placeable" in it ? it.placeable : false,
        })
        .onConflictDoNothing();
    }
    // Interactive buildings come from the manifest (public/buildings/
    // buildings.json); the Tiled template supplies footprint and door.
    const manifest = await getBuildingsManifest();
    for (const entry of manifest.buildings) {
      if (entry.kind === "scenery") continue; // stamped art only (town squares): no building row
      const template = await getTemplate(entry);
      const fp = footprintOf(template);
      await tx
        .insert(buildings)
        .values({
          key: entry.key,
          name: entry.name,
          kind: entry.kind,
          description: entry.description ?? "",
          color: entry.color ?? "#d9a066",
          tx: entry.tx,
          ty: entry.ty,
          tw: fp.tw,
          th: fp.th,
          menu: entry.menu ?? [],
          reservable: entry.reservable ?? true,
        })
        .onConflictDoUpdate({
          target: buildings.key,
          set: {
            name: entry.name,
            kind: entry.kind,
            description: entry.description ?? "",
            color: entry.color ?? "#d9a066",
            tx: entry.tx,
            ty: entry.ty,
            tw: fp.tw,
            th: fp.th,
            menu: entry.menu ?? [],
            reservable: entry.reservable ?? true,
          },
        });
    }
    const bRows = await tx.select().from(buildings);
    const bByKey = new Map(bRows.map((b) => [b.key, b]));

    // Sponsored buildings are intentionally disabled for now — keep the
    // schema in place but skip the demo sponsor insert so the bakery shows
    // up unreserved during initial development.
    void bByKey;

    const npcIds = new Map<string, number>();
    for (const n of NPC_DEFS) {
      const p = tilePoint(n.tilePos[0], n.tilePos[1]);
      const x = p.x;
      const y = p.y;
      const [row] = await tx
        .insert(npcs)
        .values({
          key: n.key,
          name: n.name,
          role: n.role,
          persona: n.persona,
          greeting: n.greeting,
          x, y, homeX: x, homeY: y,
          wanderRadius: n.wanderRadius,
          appearance: n.appearance,
          mood: n.mood,
          buildingId: null,
          sponsorId: null,
        })
        .onConflictDoNothing()
        .returning();
      if (row) npcIds.set(n.key, row.id);
    }
    for (const m of MISSION_DEFS) {
      const npcId = npcIds.get(m.npc);
      if (!npcId) continue;
      await tx
        .insert(missions)
        .values({
          key: m.key, npcId, title: m.title, description: m.description, offerLine: m.offerLine, completeLine: m.completeLine,
          requirement: m.requirement, reward: m.reward, repeatable: !!m.repeatable, sponsorId: null,
        })
        .onConflictDoNothing();
    }
    for (const a of ANIMAL_DEFS) {
      for (const name of a.names) {
        await tx.insert(animals).values({
          species: a.species, name,
          x: a.zone.x + Math.random() * a.zone.w, y: a.zone.y + Math.random() * a.zone.h,
          zone: a.zone, hunger: Math.floor(Math.random() * 40),
        });
      }
    }
    const nodeDefs: [string, string, number, number][] = NODE_DEFS;
    for (const [kind, itemKey, x, y] of nodeDefs) {
      const cfg = getCropKind(kind);
      const stages = cfg?.stages ?? 1;
      await tx.insert(resourceNodes).values({
        kind,
        itemKey,
        x,
        y,
        qty: cfg?.yield ?? 1,
        stage: stages - 1,
      });
    }
    await tx.insert(worldEvents).values({ kind: "world", text: "The grove wakes up for the first time." });
  });
  void WILD_ZONES;
  void sql;
}

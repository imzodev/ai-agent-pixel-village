import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/db";
import {
  activities,
  animals,
  buildings,
  characterCollection,
  cosmeticItems,
  dailyQuests,
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
import { NPC_DEFS } from "./npcDefs";
import { LEGACY_NPC_KEYS } from "./npcKeys";
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
  { key: "short_bow", name: "Short Bow", kind: "tool", icon: "🏹", description: "Equip it, then attack (J) to shoot from a distance. Each shot uses an arrow.", value: 30, equippable: true },
  { key: "recurve_bow", name: "Recurve Bow", kind: "tool", icon: "🏹", description: "A smith's bow: hits harder and reaches further than a short bow.", value: 90, equippable: true },
  { key: "great_bow", name: "Great Bow", kind: "tool", icon: "🏹", description: "A rare, mighty bow from a buried hoard. Long reach, heavy arrows.", value: 220, equippable: true },
  { key: "arrow", name: "Arrow", kind: "material", icon: "➶", description: "Ammunition for bows. One per shot.", value: 1 },
  { key: "bicycle", name: "Bicycle", kind: "tool", icon: "🚲", description: "Press V to ride: more than twice as fast as walking. You'll get off to fight, fish or go indoors.", value: 75 },
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
  // Ranch growth (src/lib/ranchUpgrades.ts): quality goods from happy animals, workshop goods, and Bjorn's fittings.
  { key: "golden_egg", name: "Golden Egg", kind: "material", icon: "🥚", description: "From a hen who adores you. Worth a small fortune.", value: 15 },
  { key: "fine_wool", name: "Fine Wool", kind: "material", icon: "🧶", description: "Soft as a cloud. Weaves into cloth on its own.", value: 12 },
  { key: "rich_milk", name: "Rich Milk", kind: "material", icon: "🥛", description: "Thick and golden. Makes cheese on its own.", value: 14 },
  { key: "honey", name: "Jar of Honey", kind: "material", icon: "🍯", description: "From your own hives. Marigold's buns need it.", value: 6 },
  { key: "cheese", name: "Wheel of Cheese", kind: "material", icon: "🧀", description: "Pressed on your ranch. The inns pay well for it.", value: 12 },
  { key: "cloth", name: "Bolt of Cloth", kind: "material", icon: "🧵", description: "Woven on your ranch's loom.", value: 14 },
  { key: "fittings", name: "Iron Fittings", kind: "material", icon: "🔩", description: "Hinges, nails and brackets from Bjorn's forge. For building.", value: 6 },
  // Vineyards (src/lib/vineyard.ts): what you plant, what it bears, and the winery's goods.
  { key: "grape_cutting", name: "Grape Cutting", kind: "seed", icon: "🌱", description: "A red grapevine. Plant it on a vineyard trellis; it fruits again and again.", value: 12 },
  { key: "white_grape_cutting", name: "White Grape Cutting", kind: "seed", icon: "🌱", description: "A white grapevine (vineyard level 2). Plant it on a trellis.", value: 18 },
  { key: "apple_sapling", name: "Apple Sapling", kind: "seed", icon: "🌱", description: "Plant it in a vineyard's orchard. Slow to grow, then apples for good.", value: 22 },
  { key: "red_grape", name: "Red Grapes", kind: "material", icon: "🍇", description: "Sweet and dark. Press them, or make wine.", value: 2 },
  { key: "white_grape", name: "White Grapes", kind: "material", icon: "🍇", description: "Pale gold and crisp. For white wine.", value: 2 },
  { key: "apple", name: "Apple", kind: "consumable", icon: "🍎", description: "Crunchy. Restores 4 HP. Marigold bakes them into pies.", value: 2 },
  { key: "grape_juice", name: "Grape Juice", kind: "consumable", icon: "🧃", description: "Fresh-pressed. Restores 6 HP.", value: 8 },
  { key: "cider", name: "Cider", kind: "material", icon: "🍺", description: "Pressed from your apples. The inns love it.", value: 10 },
  { key: "red_wine", name: "Red Wine", kind: "material", icon: "🍷", description: "A young red from your cellar.", value: 18 },
  { key: "white_wine", name: "White Wine", kind: "material", icon: "🥂", description: "A young white from your cellar.", value: 20 },
  { key: "aged_red_wine", name: "Aged Red Wine", kind: "material", icon: "🍷", description: "Rested in your racks. Deep and rare.", value: 55 },
  { key: "aged_white_wine", name: "Aged White Wine", kind: "material", icon: "🥂", description: "Rested in your racks. Golden and rare.", value: 60 },
  { key: "jam", name: "Jar of Jam", kind: "consumable", icon: "🫙", description: "Fruit and honey. Restores 10 HP.", value: 9 },
  { key: "apple_pie", name: "Apple Pie", kind: "consumable", icon: "🥧", description: "Marigold's, from your apples. Restores 16 HP.", value: 10 },
] as const;

export { NPC_DEFS };

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
    npc: "village_marigold",
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
    npc: "village_wren",
    title: "Gather Wild Herbs",
    description: "Wren wants 3 wild herbs from the herb patches at the edges of the grove.",
    offerLine: "Bring me three herbs — the good ones grow where the trees thin out — and I'll teach you a recipe for calming tea.",
    completeLine: "Perfect. Smell that? That's the good stuff. Here's the tea recipe. Steep it slow.",
    requirement: { type: "collect", itemKey: "herb", qty: 3 },
    reward: { coins: 10, xp: 20, items: [{ itemKey: "recipe_tea", qty: 1 }] },
  },
  {
    key: "elder_pet",
    npc: "village_oswin",
    title: "Say Hello to the Sheep",
    description: "Elder Oswin thinks the sheep have been lonely. Pet 2 of them.",
    offerLine: "The sheep out west have seemed glum. Would you go and say hello? Pet two of them for me — my knees aren't what they were.",
    completeLine: "You went? Wonderful. I can hear them bleating happier already. Take this seal — it marks you as a friend of the village.",
    requirement: { type: "pet", species: "sheep", qty: 2 },
    reward: { coins: 8, xp: 25, items: [{ itemKey: "elder_seal", qty: 1 }] },
  },
  {
    key: "orphan_talk",
    npc: "village_tobin",
    title: "Visit the Inn with Tobin",
    description: "Tobin wants you to go see Bram at the inn and tell him Tobin says hi.",
    offerLine: "Can you go tell Bram I said hi? He's at the inn. He makes a funny face when you say my name.",
    completeLine: "Did he make the face?? He always makes the face. Here, take this sweet bun my friend baked for me.",
    requirement: { type: "talk", npcKey: "innkeeper" },
    reward: { coins: 3, xp: 15, items: [{ itemKey: "honey_bun", qty: 1 }] },
  },
  {
    key: "innkeeper_slimes",
    npc: "village_hettie",
    title: "Slimes in the Cellar Field",
    description: "Slimes keep creeping toward the inn from the wild edges. Defeat 3.",
    offerLine: "Those slimes out past the trees have been getting bold. Knock three of them back and there's stew and a proper sword in it for you.",
    completeLine: "Ha! Knew you had it in you. Here — take this sword, it's better than the stick you've been using.",
    requirement: { type: "defeat", enemyKind: "slime", qty: 3 },
    reward: { coins: 20, xp: 40, items: [{ itemKey: "wooden_sword", qty: 1 }, { itemKey: "honey_bun", qty: 1 }] },
  },
  {
    key: "shopkeeper_stones",
    npc: "village_pip",
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
    npc: "village_greta",
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
    npc: "village_hollis",
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
    npc: "village_greta",
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
    npc: "village_wren",
    title: "Tincture of the Cap",
    description: "Wren will trade a calming tincture for 3 speckled mushrooms.",
    offerLine: "Three mushrooms and I'll brew you a tincture. Tastes the way the woods smell after rain.",
    completeLine: "Here's a flask. Two drops under the tongue and the world gets quieter. I'll put a rug down for you while you wait it out.",
    requirement: { type: "collect", itemKey: "mushroom", qty: 3 },
    reward: { coins: 6, xp: 12, items: [{ itemKey: "tea", qty: 1 }, { itemKey: "rug", qty: 1 }] },
  },
  {
    key: "shopkeeper_slimy",
    npc: "village_pip",
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
    npc: "village_tobin",
    title: "Catching the Sunset Bunny",
    description: "Tobin lost his favorite rabbit. Pet two of them to calm them down.",
    offerLine: "The bunnies at the north end get nervous around dusk. Pet a couple and see if one of them is BunBun.",
    completeLine: "You found her! She's OK, just shy. Here — feather for your trouble, and a painting for your wall.",
    requirement: { type: "pet", species: "rabbit", qty: 2 },
    reward: { coins: 5, xp: 12, items: [{ itemKey: "painting", qty: 1 }] },
  },
  {
    key: "shopkeeper_cabins",
    npc: "village_pip",
    title: "Visit a Cabin",
    description: "Pip wants you to drop by one of the cabins and say hello.",
    offerLine: "Stick your head in a cabin, any cabin, and tell me what the kettle's doing. I'll furnish the rest.",
    completeLine: "Kettle on, is it? Lovely. A bookcase and a lamp for the trouble — and a bed, if you'll take it.",
    requirement: { type: "visit", buildingKey: "cabin_1" },
    reward: { coins: 4, xp: 10, items: [{ itemKey: "bookshelf", qty: 1 }, { itemKey: "lamp", qty: 1 }, { itemKey: "bed", qty: 1 }] },
  },
  {
    key: "innkeeper_bats",
    npc: "village_hettie",
    title: "Bats in the Belfry",
    description: "Bats are roosting where they shouldn't. Defeat 2 of them.",
    offerLine: "Two bats in the belfry and I'll throw in a painting and a round on the house.",
    completeLine: "Belfry's clear. Here's the painting and dinner's on the inn tonight.",
    requirement: { type: "defeat", enemyKind: "bat", qty: 2 },
    reward: { coins: 12, xp: 20, items: [{ itemKey: "painting", qty: 1 }, { itemKey: "honey_bun", qty: 2 }] },
  },
  {
    key: "hm_boars",
    npc: "hollowmere_sorrel",
    title: "Thin the Boars of Whisperwood",
    description: "Bramble boars have been charging woodcutters near Hollowmere. Old Sorrel wants 5 of them driven off.",
    offerLine: "The boars have grown bold — tusked half a cart to splinters last week. Drive off five of 'em and Hollowmere will owe you.",
    completeLine: "Five! The lads can work the west woods again. Here — coin, and some hides for Bjorn to make you something sharp.",
    requirement: { type: "defeat", enemyKind: "boar", qty: 5 },
    reward: { coins: 40, xp: 60, items: [{ itemKey: "boar_hide", qty: 2 }] },
  },
  {
    key: "hm_wood",
    npc: "hollowmere_sorrel",
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
    npc: "brightwater_wynn",
    title: "Lights in the Dark",
    description: "Shade wisps drift out of the Greyspine caverns. Mayor Wynn will pay a bounty for 3.",
    offerLine: "Those cold little lights from the caverns — they frighten the fishermen something terrible. Three of them, and the town treasury is yours! Well, part of it.",
    completeLine: "Splendid! Brightwater sleeps easier tonight. A bounty, as promised, from a grateful town.",
    requirement: { type: "defeat", enemyKind: "wisp", qty: 3 },
    reward: { coins: 80, xp: 120, items: [{ itemKey: "wisp_essence", qty: 1 }] },
  },
  {
    key: "bw_heartwood",
    npc: "brightwater_wynn",
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

// Keep seeded NPCs in step with NPC_DEFS: their home spot (cabin-village
// positions) and role/persona/greeting. Runs once per process — edit
// NPC_DEFS and restart the dev server to re-apply. If the configured tile
// sits on a Collision tile, snap to the nearest walkable neighbour so NPCs
// stay reachable. An NPC stays where it is across restarts (it may be
// mid-trip or lingering somewhere it travelled to, src/lib/nav/trips.ts);
// only one standing somewhere no longer walkable is sent back home.
async function syncNpcLayout() {
  if (npcSynced) return;
  npcSynced = true;
  try {
    await renameLegacyNpcKeys();
    for (const n of NPC_DEFS) {
      const p = tilePoint(n.tilePos[0], n.tilePos[1]);
      let x = p.x;
      let y = p.y;
      if (!(await isWalkableServer(x, y))) {
        const snap = await nearestWalkable(n.tilePos[0], n.tilePos[1]);
        x = snap.x;
        y = snap.y;
      }
      const [cur] = await db.select({ x: npcs.x, y: npcs.y }).from(npcs).where(eq(npcs.key, n.key));
      const stranded = cur ? !(await isWalkableServer(cur.x, cur.y)) : false;
      await db.update(npcs)
        .set({
          homeX: x, homeY: y,
          // Back home only when where it stands is no longer walkable.
          ...(stranded ? { x, y, movePath: null, moveStartAt: null, moveSpeed: null, moveAfter: null } : {}),
          name: n.name, appearance: n.appearance,
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

// Move saved data from old NPC keys to new ones (src/lib/npcKeys.ts): the
// npc row itself, the Folk page of the collection book and "talk to"
// daily quests. Everything else points at NPCs by id. Idempotent: once no
// old key is left this is a handful of no-op updates.
async function renameLegacyNpcKeys() {
  const olds = Object.keys(LEGACY_NPC_KEYS);
  const found = await db.select({ key: npcs.key }).from(npcs).where(inArray(npcs.key, olds));
  const left = await db.select({ key: characterCollection.key }).from(characterCollection)
    .where(and(eq(characterCollection.kind, "npc"), inArray(characterCollection.key, olds))).limit(1);
  const quests = await db.select({ id: dailyQuests.id }).from(dailyQuests)
    .where(inArray(sql`${dailyQuests.requirement}->>'npcKey'`, olds)).limit(1);
  if (!found.length && !left.length && !quests.length) return;
  await db.transaction(async (tx) => {
    for (const [from, to] of Object.entries(LEGACY_NPC_KEYS)) {
      const [stale] = await tx.select({ id: npcs.id }).from(npcs).where(eq(npcs.key, from));
      if (stale) {
        // A server that booted with the new defs before this ran may have
        // seeded a fresh row under the new key: retire it (hidden, history
        // kept) so the established row, with its conversations, keeps going.
        const [fresh] = await tx.select({ id: npcs.id }).from(npcs).where(eq(npcs.key, to));
        if (fresh) await tx.update(npcs).set({ key: `retired_${fresh.id}`, active: false }).where(eq(npcs.id, fresh.id));
        await tx.update(npcs).set({ key: to }).where(eq(npcs.id, stale.id));
      }
      await tx.execute(sql`
        insert into character_collection (character_id, kind, key, count, first_at)
        select character_id, 'npc', ${to}, count, first_at from character_collection where kind = 'npc' and key = ${from}
        on conflict (character_id, kind, key) do update
          set count = greatest(character_collection.count, excluded.count),
              first_at = least(character_collection.first_at, excluded.first_at)`);
      await tx.execute(sql`delete from character_collection where kind = 'npc' and key = ${from}`);
      await tx.execute(sql`
        update daily_quests set requirement = jsonb_set(requirement, '{npcKey}', to_jsonb(${to}::text))
        where requirement->>'npcKey' = ${from}`);
    }
  });
  console.log(`[seed] renamed ${found.length} NPC keys to <place>_<name>: ${found.map((r) => `${r.key} → ${LEGACY_NPC_KEYS[r.key]}`).join(", ")}`);
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

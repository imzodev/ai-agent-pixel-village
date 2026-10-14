import { and, eq, inArray, isNull, ne, sql, notInArray } from "drizzle-orm";
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
import { getBuildingsManifest, getTemplate, upsertBuildingRow } from "./buildingsServer";
import { doorWorldPx, footprintOf } from "./buildingManifest";
import { getCropKind } from "@/lib/crops";
import { syncLotsFromManifest } from "./lots";
import { forestTrees } from "./forest";
import { REGION_NODES } from "./regions";
import { commonFieldWheat } from "./commonField";
import { FOX_DEN, paddock, ranchPickSpots } from "./villageRanch";
import { MISSION_DEFS } from "./missionDefs";
import { NPC_DEFS } from "./npcDefs";
import { LEGACY_NPC_KEYS } from "./npcKeys";
import { forageSpots } from "./forage";
import { ORCHARD_FRUITS, ORCHARD_PRODUCTS } from "./orchard";
import { resiteTreasureMaps } from "./treasureServer";
import { BOSS_KIND } from "./progression";
import { LAIR_BOSSES } from "./lairs";

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
  { key: "bell_pepper", name: "Red Bell Pepper", kind: "material", icon: "🫑", description: "Glossy, sweet and crunchy.", value: 5 },
  { key: "onion", name: "Onion", kind: "material", icon: "🧅", description: "Makes a stew a stew. And makes you cry.", value: 3 },
  { key: "cabbage", name: "Cabbage", kind: "material", icon: "🥬", description: "Tight, leafy and heavy as a stone.", value: 4 },
  { key: "pumpkin", name: "Pumpkin", kind: "material", icon: "🎃", description: "Heavy. Worth it.", value: 20 },
  { key: "wood", name: "Log of Wood", kind: "material", icon: "🪵", description: "Oak, freshly chopped. Greta turns it into furniture.", value: 2 },
  { key: "fishing_rod", name: "Fishing Rod", kind: "tool", icon: "🎣", description: "Face deep water and press R (🎣 on a phone) to cast. Keep it in your bag.", value: 30 },
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
  // Trophies of the far lands (danger tiers 5–8); Bjorn forges them into gear.
  { key: "stalker_scale", name: "Stalker Scale", kind: "material", icon: "🦎", description: "Sun-hard scale from a dune stalker.", value: 18 },
  { key: "hag_charm", name: "Hag's Charm", kind: "material", icon: "🧿", description: "A knot of bone and reed. It hums.", value: 22 },
  { key: "troll_hide", name: "Troll Hide", kind: "material", icon: "🧊", description: "Thick, frost-rimed hide from an ice troll.", value: 26 },
  { key: "gloam_antler", name: "Gloam Antler", kind: "material", icon: "🦌", description: "Still faintly glowing violet.", value: 26 },
  { key: "basalt_core", name: "Basalt Core", kind: "material", icon: "🔥", description: "A golem's heart, warm as a forge.", value: 34 },
  { key: "wyvern_bone", name: "Wyvern Bone", kind: "material", icon: "🦴", description: "Light, hollow and stronger than steel.", value: 34 },
  { key: "rime_essence", name: "Rime Essence", kind: "material", icon: "❄️", description: "Cold that never melts, from a wraith.", value: 42 },
  { key: "elder_heartwood", name: "Elder Heartwood", kind: "material", icon: "🌲", description: "From the oldest tree that ever walked.", value: 48 },
  { key: "steel_sword", name: "Steel Sword", kind: "tool", icon: "🗡️", description: "+16 attack. Bjorn's best steel, scale-wrapped.", value: 160, equippable: true },
  { key: "runed_bow", name: "Runed Bow", kind: "tool", icon: "🏹", description: "Antler-tipped and troll-strung. Long reach, heavy arrows.", value: 220, equippable: true },
  { key: "wyvernbone_blade", name: "Wyvernbone Blade", kind: "tool", icon: "🗡️", description: "+21 attack. Light as a feather, hot as a forge.", value: 320, equippable: true },
  // Lair bosses' trophies and unique weapons (src/lib/lairs.ts).
  { key: "wyrm_fang", name: "Wyrm Fang", kind: "material", icon: "🦷", description: "From the Sand Wyrm of the Glass Pit. Proof you faced it.", value: 120 },
  { key: "giant_heart", name: "Giant's Heart", kind: "material", icon: "💠", description: "A Frost Giant's heart of living ice, from the Rime Hall.", value: 180 },
  { key: "drake_horn", name: "Drake Horn", kind: "material", icon: "🦴", description: "Still warm. From the Fire Drake of the Cinder Roost.", value: 240 },
  { key: "hollow_eye", name: "Hollow Eye", kind: "material", icon: "🟢", description: "It glows, and it watches. From the Hollow Grove.", value: 320 },
  { key: "dunecaller_bow", name: "Dunecaller Bow", kind: "tool", icon: "🏹", description: "The Sand Wyrm's own sinew. The longest reach of any bow.", value: 600, equippable: true },
  { key: "glacier_blade", name: "Glacier Blade", kind: "tool", icon: "🗡️", description: "+31 attack. Carved from the Frost Giant's crown.", value: 700, equippable: true },
  { key: "drakefire_blade", name: "Drakefire Blade", kind: "tool", icon: "🗡️", description: "+35 attack. Forged in the Fire Drake's own breath.", value: 900, equippable: true },
  { key: "hollow_edge", name: "Hollow Edge", kind: "tool", icon: "🗡️", description: "+40 attack. Whatever it was, it isn't any more.", value: 1200, equippable: true },
  { key: "elder_blade", name: "Elder Blade", kind: "tool", icon: "🗡️", description: "+27 attack. Heartwood and rime, for the end of the world.", value: 520, equippable: true },
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
  // Orchards (src/lib/orchard.ts): fruit, saplings from the towns that grow them, and what the fruit becomes.
  ...ORCHARD_FRUITS.flatMap((f) => [
    { key: f.fruit, name: f.name, kind: "consumable" as const, icon: f.icon, description: `Fresh from an orchard. Restores 4 HP.`, value: f.value },
    { key: f.sapling, name: `${f.name} Sapling`, kind: "seed" as const, icon: "🌱", description: `Plant it in an orchard. Sold in ${f.origin}.`, value: Math.round(f.saplingPrice / 3) },
  ]),
  ...ORCHARD_PRODUCTS.map((p) => ({ key: p.key, name: p.name, kind: (p.heal ? "consumable" : "material") as "consumable" | "material", icon: p.icon, description: p.description, value: p.value })),
  { key: "grape_juice", name: "Grape Juice", kind: "consumable", icon: "🧃", description: "Fresh-pressed. Restores 6 HP.", value: 8 },
  { key: "cider", name: "Cider", kind: "material", icon: "🍺", description: "Pressed from your apples. The inns love it.", value: 10 },
  { key: "red_wine", name: "Red Wine", kind: "material", icon: "🍷", description: "A young red from your cellar.", value: 18 },
  { key: "white_wine", name: "White Wine", kind: "material", icon: "🥂", description: "A young white from your cellar.", value: 20 },
  { key: "aged_red_wine", name: "Aged Red Wine", kind: "material", icon: "🍷", description: "Rested in your racks. Deep and rare.", value: 55 },
  { key: "aged_white_wine", name: "Aged White Wine", kind: "material", icon: "🥂", description: "Rested in your racks. Golden and rare.", value: 60 },
  { key: "jam", name: "Jar of Jam", kind: "consumable", icon: "🫙", description: "Fruit and honey. Restores 10 HP.", value: 9 },
  { key: "apple_pie", name: "Apple Pie", kind: "consumable", icon: "🥧", description: "Marigold's, from your apples. Restores 16 HP.", value: 10 },
  // Carpenter's workshops (src/lib/furniture.ts): planks, and the furniture made from them.
  { key: "plank", name: "Plank", kind: "material", icon: "🪵", description: "Sawn from a log at a workshop's saw bench.", value: 1 },
  { key: "stool", name: "Stool", kind: "furniture", icon: "🪑", description: "Three legs, no wobble. Place it at home.", value: 6, placeable: true },
  { key: "cabinet", name: "Cabinet", kind: "furniture", icon: "🗄️", description: "Two doors and brass knobs.", value: 20, placeable: true },
  { key: "wardrobe", name: "Wardrobe", kind: "furniture", icon: "🚪", description: "Tall enough to hide in.", value: 32, placeable: true },
  { key: "rocking_chair", name: "Rocking Chair", kind: "furniture", icon: "🪑", description: "Turned on a lathe. Creaks just right.", value: 24, placeable: true },
  { key: "armchair", name: "Armchair", kind: "furniture", icon: "🛋️", description: "Upholstered in your own cloth and wool.", value: 30, placeable: true },
  { key: "sofa", name: "Sofa", kind: "furniture", icon: "🛋️", description: "Room for three and a cat.", value: 44, placeable: true },
  { key: "polished_chair", name: "Polished Chair", kind: "furniture", icon: "🪑", description: "Walnut-dark and waxed with honey.", value: 22, placeable: true },
  { key: "polished_table", name: "Polished Table", kind: "furniture", icon: "🟫", description: "You can see your face in it.", value: 30, placeable: true },
  { key: "polished_cabinet", name: "Polished Cabinet", kind: "furniture", icon: "🗄️", description: "Waxed to a deep shine.", value: 42, placeable: true },
  { key: "polished_wardrobe", name: "Polished Wardrobe", kind: "furniture", icon: "🚪", description: "The pride of any bedroom.", value: 66, placeable: true },
] as const;

export { NPC_DEFS };

// Animal roam zones in world-tile units (tileRect, ty grows downward).
// The village's farm animals live at the Village Ranch east of the village,
// each kind in its own paddock (src/lib/villageRanch.json); pets stay near
// the houses; wild species live in the WILD_ZONES outskirts ring.
const ANIMAL_DEFS: { species: string; names: string[]; zone: { x: number; y: number; w: number; h: number } }[] = [
  { species: "sheep", names: ["Clover", "Dumpling", "Mabel"], zone: paddock("sheep") },
  { species: "cow", names: ["Buttercup", "Juniper"], zone: paddock("cow") },
  { species: "pig", names: ["Truffle", "Hamlet"], zone: paddock("pig") },
  { species: "llama", names: ["Paco", "Luna"], zone: paddock("llama") },
  { species: "chicken", names: ["Nugget", "Pecky", "Henrietta", "Biscuit"], zone: paddock("chicken") },
  { species: "duck", names: ["Puddle", "Waddles", "Quilliam"], zone: paddock("duck") },
  { species: "rabbit", names: ["Thimble", "Moss"], zone: tileRect(6, -54, 30, 20) },
  // The fox's den: the meadow just east of the ranch fence, near enough to
  // reach the hen yard (round by the south gate) for its egg raids.
  { species: "fox", names: ["Ember"], zone: FOX_DEN },
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
  // East of the Common Field (the old spots were up on the mountain plateau).
  ["herb_patch", "herb", 78, -26], ["herb_patch", "herb", 84, -17],
  ["berry_bush", "berry", 14, 49], ["berry_bush", "berry", 64, 56], ["berry_bush", "berry", 130, -21],
  ["rock", "stone", 123, 12], ["rock", "stone", 135, 39], ["rock", "stone", -77, 6], ["rock", "stone", 52, 54],
  ["mushroom_ring", "mushroom", -76, -6], ["mushroom_ring", "mushroom", 130, 54],
  // The Common Field north-east of the village (src/lib/commonField.ts).
  ...commonFieldWheat().map(([tx, ty]): [string, string, number, number] => ["wheat_field", "wheat", tx, ty]),
  // The Village Ranch's garden and beehives: free for anyone to pick (src/lib/ranchPicks.ts).
  ...ranchPickSpots(),
  // The regions west of the village place their own nodes (props keep clear of them).
  ...REGION_NODES.map((n): [string, string, number, number] => [n.kind, n.itemKey, n.tx, n.ty]),
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
// only one standing somewhere no longer walkable, or whose home moved, is
// sent (back) home.
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
      const [cur] = await db.select({ x: npcs.x, y: npcs.y, homeX: npcs.homeX, homeY: npcs.homeY }).from(npcs).where(eq(npcs.key, n.key));
      const stranded = cur ? !(await isWalkableServer(cur.x, cur.y)) : false;
      // A home moved in NPC_DEFS (more than a few tiles): they live there now.
      const moved = cur ? Math.hypot(cur.homeX - x, cur.homeY - y) > 8 * 16 : false;
      await db.update(npcs)
        .set({
          homeX: x, homeY: y,
          // Back home only when where it stands is no longer walkable, or home moved.
          ...(stranded || moved ? { x, y, movePath: null, moveStartAt: null, moveSpeed: null, moveAfter: null } : {}),
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
    await db.delete(enemies).where(notInArray(enemies.kind, [BOSS_KIND, ...LAIR_BOSSES.map((b) => b.kind)])); // bosses stay
    // Treasure maps whose X ended up in the sea get a new spot.
    const resited = await resiteTreasureMaps();
    if (resited) console.log(`[seed] moved ${resited} treasure maps off ground that's no longer open`);
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
    for (const entry of manifest.buildings) await upsertBuildingRow(entry);
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

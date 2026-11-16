// The hand-written stories: offered in the picker, and the fallback when the
// AI can't write one (no key, an error, a reply that didn't check out). Each
// names only real NPCs, places, foes and items a new hero can reach
// (story.test.ts checks them against the level-1 catalog).

import type { StoryTemplate } from "@/types/story";

export const STORY_TEMPLATES: StoryTemplate[] = [
  {
    key: "lost_heir",
    icon: "👑",
    title: "The Lost Heir",
    blurb: "A sealed letter with your name on it, and a crest nobody has seen in forty years.",
    tags: ["heir", "noble", "family", "crest", "letter", "royal", "lost", "orphan", "past", "secret", "knight", "prince", "princess"],
    premise: "Elder Oswin has found an old letter addressed to you, sealed with a crest the grove hasn't seen in forty years.",
    ending: "The crest is yours again: the heirs of the old Whisperwood watch are home.",
    heroTitle: "Heir of the Watch",
    chapters: [
      { title: "The sealed letter", text: "Elder Oswin has something for you. Go and hear him out.", event: "talk", match: { npcKey: "village_oswin" }, qty: 1,
        npcNote: "You found an old letter addressed to this player, sealed with a crest you half remember from your youth. You think Old Sorrel in Hollowmere would know it. Tell them so." },
      { title: "The road west", text: "Follow the King's Road west, through the Whisperwood, to Hollowmere.", event: "visit", match: { region: "hollowmere" }, qty: 1 },
      { title: "The elder's memory", text: "Old Sorrel remembers every crest in the west. Ask about yours.", event: "talk", match: { npcKey: "hollowmere_sorrel" }, qty: 1,
        npcNote: "The crest on the player's letter belonged to the family who kept the old Whisperwood watch, gone forty years. Wolves took over their watchpost. Tell the player that if they're the heir, they'll have to prove it to the wolves first." },
      { title: "Wolves at the watchpost", text: "Grey wolves den where your family once kept watch. Drive them off.", event: "defeat", match: { enemyKind: "wolf" }, qty: 3 },
      { title: "A pin for the crest", text: "Bjorn can forge the old crest into a pin, given two wolf pelts.", event: "deliver", match: { npcKey: "hollowmere_bjorn", itemKey: "wolf_pelt" }, qty: 2,
        npcNote: "The player is the lost heir of the old Whisperwood watch. You'll forge their family crest into a pin if they bring you 2 wolf pelts." },
      { title: "Home, with a name", text: "Show Elder Oswin what you've found.", event: "talk", match: { npcKey: "village_oswin" }, qty: 1,
        npcNote: "The player has proven they're the heir of the old Whisperwood watch, and carries the family crest. Welcome them home, proud and a little moved." },
    ],
  },
  {
    key: "smiths_apprentice",
    icon: "⚒️",
    title: "The Smith's Apprentice",
    blurb: "Bjorn needs a pair of hands at the forge. He won't say so twice.",
    tags: ["smith", "forge", "blacksmith", "craft", "apprentice", "iron", "hammer", "maker", "worker", "strong"],
    premise: "Bjorn, the blacksmith of Hollowmere, has more work than hands and is looking for an apprentice who can keep up.",
    ending: "Bjorn grunts, which from him means you're one of the forge now.",
    heroTitle: "Forge-Sworn",
    chapters: [
      { title: "A word with Bjorn", text: "The smith of Hollowmere is looking for help. Ask him for a chance.", event: "talk", match: { npcKey: "hollowmere_bjorn" }, qty: 1,
        npcNote: "You're looking for an apprentice and the player wants the job. Gruffly tell them to prove they can haul: you need river stone for the forge." },
      { title: "Stone for the forge", text: "Gather river stone: the forge's hearth needs relining.", event: "collect", match: { itemKey: "stone" }, qty: 8 },
      { title: "Hauling stone", text: "Bring Bjorn six stones for his hearth.", event: "deliver", match: { npcKey: "hollowmere_bjorn", itemKey: "stone" }, qty: 6,
        npcNote: "Your would-be apprentice should bring you 6 river stones for the hearth. Next you'll want timber, and Ansel the woodcutter knows the best of it." },
      { title: "The woodcutter's advice", text: "Ansel knows which oak burns hottest. Ask him.", event: "talk", match: { npcKey: "hollowmere_ansel" }, qty: 1,
        npcNote: "Bjorn sent the player, his new apprentice, to ask which timber burns best. Tell them: old oak from the Whisperwood, and plenty of it." },
      { title: "Fuel for the fire", text: "Chop oak in the Whisperwood.", event: "collect", match: { itemKey: "wood" }, qty: 12 },
      { title: "The first fire", text: "Bring Bjorn ten logs and light the forge together.", event: "deliver", match: { npcKey: "hollowmere_bjorn", itemKey: "wood" }, qty: 10,
        npcNote: "Your apprentice is bringing the 10 logs for their first fire at your forge. If they have them, admit, briefly, that they'll do." },
    ],
  },
  {
    key: "healers_oath",
    icon: "🌿",
    title: "The Healer's Oath",
    blurb: "Fever at the inn in Hollowmere, and nobody who knows the old remedies.",
    tags: ["healer", "herb", "medicine", "doctor", "kind", "cure", "potion", "witch", "druid", "nature", "help"],
    premise: "Travellers at Ivy's inn in Hollowmere have come down with a marsh fever, and nobody remembers the old remedy.",
    ending: "The fever breaks. Ivy says the inn will always keep a bed for its healer.",
    heroTitle: "Oathbound Healer",
    chapters: [
      { title: "Fever at the inn", text: "Ivy, the innkeeper of Hollowmere, needs help with her sick guests.", event: "talk", match: { npcKey: "hollowmere_ivy" }, qty: 1,
        npcNote: "Three of your guests have a marsh fever. The old remedy needs wild herbs and speckled mushrooms. Ask the player to gather them." },
      { title: "Wild herbs", text: "Pick wild herbs where they grow.", event: "collect", match: { itemKey: "herb" }, qty: 6 },
      { title: "Speckled caps", text: "Find speckled mushrooms in the woods.", event: "collect", match: { itemKey: "mushroom" }, qty: 4 },
      { title: "The tea", text: "Bring Ivy five herbs for the fever tea.", event: "deliver", match: { npcKey: "hollowmere_ivy", itemKey: "herb" }, qty: 5,
        npcNote: "The player is bringing 5 wild herbs for your guests' fever tea. The salve still needs slime gel, which slimes leave behind." },
      { title: "Slime for the salve", text: "Slimes leave a gel that soothes fever. Find some.", event: "defeat", match: { enemyKind: "slime" }, qty: 3 },
      { title: "The salve", text: "Bring Ivy three slime gels and finish the cure.", event: "deliver", match: { npcKey: "hollowmere_ivy", itemKey: "slime_gel" }, qty: 3,
        npcNote: "The player is bringing 3 slime gels for the fever salve, the last of the cure. If they have them, thank them warmly: your guests will be fine." },
    ],
  },
  {
    key: "old_map",
    icon: "🗺️",
    title: "The Old Map",
    blurb: "Tobin found half a map in the hayloft. The other half is somewhere west.",
    tags: ["map", "explore", "explorer", "treasure", "adventure", "travel", "wander", "curious", "river", "pirate", "sailor", "fisher"],
    premise: "Tobin found half of an old map in a hayloft, marked with a pond, a wood and a cross nobody can place.",
    ending: "The marks add up: the map was an old angler's chart of the meadow pond, and now it's yours.",
    heroTitle: "Mapfinder",
    chapters: [
      { title: "Half a map", text: "Tobin wants to show you something he found.", event: "talk", match: { npcKey: "village_tobin" }, qty: 1,
        npcNote: "You found half an old map in a hayloft, with a pond, a big wood and a cross drawn on it. You're bursting to show the player and think the wood is the Whisperwood, west along the road." },
      { title: "Into the wood", text: "The map's wood looks like the Whisperwood. Go and look.", event: "visit", match: { region: "whisperwood" }, qty: 1 },
      { title: "Bats in the dusk", text: "Bats circle the old trees where the cross should be. Clear them off for a better look.", event: "defeat", match: { enemyKind: "bat" }, qty: 3 },
      { title: "The pond on the map", text: "The pond must be the one in the Western Meadow. Head there.", event: "visit", match: { region: "meadow" }, qty: 1 },
      { title: "What the pond gives", text: "The cross marks a fishing spot. Catch a few fish.", event: "fish", match: {}, qty: 3 },
      { title: "Back to Tobin", text: "Tell Tobin what his map really was.", event: "talk", match: { npcKey: "village_tobin" }, qty: 1,
        npcNote: "The player followed your half-map to the pond in the Western Meadow: it was an old angler's chart. Be thrilled, and insist they keep it." },
    ],
  },
  {
    key: "hunters_mark",
    icon: "🐺",
    title: "The Hunter's Mark",
    blurb: "Old Sorrel says the wilds are getting bolder. Someone has to push back.",
    tags: ["hunter", "warrior", "fighter", "monster", "beast", "brave", "sword", "soldier", "guard", "ranger", "slayer"],
    premise: "Old Sorrel says the beasts around Hollowmere are getting bolder every season, and the town needs a hunter.",
    ending: "The wilds have learned your name. Hollowmere sleeps a little easier.",
    heroTitle: "Beastwarden",
    chapters: [
      { title: "The elder's worry", text: "Old Sorrel wants a word about the wilds.", event: "talk", match: { npcKey: "hollowmere_sorrel" }, qty: 1,
        npcNote: "The beasts near Hollowmere are getting bolder. You want the player to start small, with the slimes, and work up to the boars and the wolves." },
      { title: "Start small", text: "Clear the slimes off the meadow paths.", event: "defeat", match: { enemyKind: "slime" }, qty: 5 },
      { title: "Thorns on the road", text: "Thornlings are creeping onto the road. Cut them back.", event: "defeat", match: { enemyKind: "thornling" }, qty: 3 },
      { title: "Bramble boars", text: "Two boars have been tearing up the woods. Bring them down.", event: "defeat", match: { enemyKind: "boar" }, qty: 2 },
      { title: "A trophy for Vesna", text: "Vesna collects proof of a hunter's work. Bring her a boar hide.", event: "deliver", match: { npcKey: "hollowmere_vesna", itemKey: "boar_hide" }, qty: 1,
        npcNote: "Old Sorrel told you about the player, Hollowmere's new hunter. You'll take a boar hide as proof of their work, and you've heard the wolves are the real trouble." },
      { title: "The pack", text: "The grey wolves are the real trouble. Thin the pack.", event: "defeat", match: { enemyKind: "wolf" }, qty: 4 },
    ],
  },
  {
    key: "merchants_road",
    icon: "🪙",
    title: "The Merchant's Road",
    blurb: "Odo says anyone can be a trader. Anyone who listens to Odo, anyway.",
    tags: ["merchant", "trader", "trade", "money", "rich", "gold", "coins", "shop", "business", "sell", "deal", "thief", "rogue"],
    premise: "Odo, the grove's trader, swears he can make a merchant out of anyone, and he's decided to make one out of you.",
    ending: "Odo calls you a natural, then asks for a cut. You're a merchant now.",
    heroTitle: "Road Merchant",
    chapters: [
      { title: "Odo's offer", text: "Odo, on the village plaza, has a proposition.", event: "talk", match: { npcKey: "village_odo" }, qty: 1,
        npcNote: "You've decided to teach the player to trade. Lesson one: start with what grows for free. Send them to cut wheat in the Common Field." },
      { title: "Free goods", text: "Cut wheat in the Common Field north of the village.", event: "collect", match: { itemKey: "wheat" }, qty: 10 },
      { title: "To the mill", text: "Hollis the miller always needs wheat. Bring him eight sheaves.", event: "deliver", match: { npcKey: "village_hollis", itemKey: "wheat" }, qty: 8,
        npcNote: "Odo sent the player, his new merchant pupil, with wheat for your mill. You'll gladly take 8 sheaves." },
      { title: "Learn to sell", text: "Sell a few things to the villagers.", event: "sell", match: {}, qty: 5 },
      { title: "Wider markets", text: "Every trader should see Hollowmere's market.", event: "visit", match: { region: "hollowmere" }, qty: 1 },
      { title: "Odo's verdict", text: "Report back to Odo.", event: "talk", match: { npcKey: "village_odo" }, qty: 1,
        npcNote: "Your pupil has gathered, sold and travelled to Hollowmere. Declare them a proper merchant, and joke about wanting a cut." },
    ],
  },
  {
    key: "harvest_keeper",
    icon: "🌾",
    title: "The Harvest Keeper",
    blurb: "Rowan can't keep up with the fields alone. The grove needs a farmer.",
    tags: ["farmer", "farm", "harvest", "garden", "grow", "plant", "animals", "cozy", "peaceful", "simple", "baker", "cook"],
    premise: "Rowan the farmhand is run off his feet, and the grove's kitchens are running low.",
    ending: "The grove's tables are full, and everyone knows whose hands filled them.",
    heroTitle: "Harvest Keeper",
    chapters: [
      { title: "A farmhand's plea", text: "Rowan could use a hand. Ask him what needs doing.", event: "talk", match: { npcKey: "village_rowan" }, qty: 1,
        npcNote: "You can't keep up with the fields alone. Ask the player to plant something of their own, and to help cut the wheat." },
      { title: "Seeds in the ground", text: "Plant a few seeds in a field of your own.", event: "plant", match: {}, qty: 3 },
      { title: "The common wheat", text: "Cut wheat in the Common Field.", event: "collect", match: { itemKey: "wheat" }, qty: 10 },
      { title: "Eggs for the bakery", text: "Collect eggs from the hens (pet them nicely).", event: "collect", match: { itemKey: "egg" }, qty: 3 },
      { title: "Marigold's order", text: "Bring Marigold three eggs for her baking.", event: "deliver", match: { npcKey: "village_marigold", itemKey: "egg" }, qty: 3,
        npcNote: "Rowan told you the player is helping with the harvest. You're short of eggs for your baking and would love 3." },
      { title: "The dairymaid's thanks", text: "Della at the Village Ranch wants to meet the grove's new farmer.", event: "talk", match: { npcKey: "village_della" }, qty: 1,
        npcNote: "Everyone's talking about the player helping Rowan and Marigold with the harvest. Thank them and welcome them as one of the grove's farmers." },
    ],
  },
];

export const storyTemplate = (key: string): StoryTemplate | undefined => STORY_TEMPLATES.find((t) => t.key === key);

/** The hand-written story that best fits a hero line (by its tags), for when the AI can't write one. */
export function closestTemplate(prompt: string): StoryTemplate {
  const words = prompt.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  let best = STORY_TEMPLATES[0], score = -1;
  for (const t of STORY_TEMPLATES) {
    const s = t.tags.filter((tag) => words.some((w) => w === tag || w.startsWith(tag))).length;
    if (s > score) { best = t; score = s; }
  }
  return best;
}

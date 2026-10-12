// The journey: a ladder of goals after the tutorial, so a new player always
// knows a good next thing to do and is paid for doing it. Each goal is a
// check on the player's own state (src/lib/journeyServer.ts measures it),
// shown one at a time in the HUD (JourneyTracker) with a guide arrow when
// there's somewhere to go. Pure data, shared by server and client.

import type { JourneyGoal } from "@/types/journey";

export type { JourneyGoal, JourneyView } from "@/types/journey";

export const JOURNEY: readonly JourneyGoal[] = [
  {
    key: "level4", title: "Reach level 4",
    hint: "Everything earns XP: harvesting, chopping, fishing, fighting and helping villagers. Keep going!",
    check: { kind: "level", n: 4 }, reward: { coins: 40, xp: 50 },
  },
  {
    key: "fish", title: "Catch a fish",
    hint: "Pip sells fishing rods. Stand by water with the rod and cast (R); strike when it bites.",
    check: { kind: "fishCaught", n: 1 }, target: { kind: "npc", npcKey: "village_pip" }, reward: { coins: 50, xp: 60 },
  },
  {
    key: "mission", title: "Finish a mission for a villager",
    hint: "Villagers with a gold ! over their head have work for you. Talk to them, then come back when it's done.",
    check: { kind: "missionsDone", n: 1 }, reward: { coins: 40, xp: 60 },
  },
  {
    key: "ranch", title: "Raise your first animal",
    hint: "Claim a ranch south of the village at its gate, then buy a chick in its panel. Hens lay eggs while they're fed.",
    check: { kind: "animalsOwned", n: 1 }, target: { kind: "freeLot", prefix: "ranch_" }, reward: { coins: 80, xp: 80 },
  },
  {
    key: "hollowmere", title: "Travel to Hollowmere",
    hint: "Take the King's Road west through Whisperwood to the woodcutters' town, and touch its waystone. Waystones let you travel back fast.",
    check: { kind: "waystone", key: "waystone_hollowmere" }, target: { kind: "point", x: -334 * 16 + 8, y: -4 * 16 + 8 }, reward: { coins: 100, xp: 120 },
  },
  {
    key: "sword", title: "Get a stone sword",
    hint: "Bjorn at the forge in Hollowmere (or Greta in the grove) makes one from stone and wood. Ask them to Craft.",
    check: { kind: "ownsAnyItem", itemKeys: ["stone_sword", "thorn_blade", "wisp_blade", "steel_sword", "wyvernbone_blade", "elder_blade", "glacier_blade", "drakefire_blade", "hollow_edge"] },
    target: { kind: "npc", npcKey: "hollowmere_bjorn" }, reward: { coins: 60, xp: 100 },
  },
  {
    key: "bounties", title: "Complete 2 bounties",
    hint: "Every town has a bounty board by its square. Take a job, do it, and turn it in at the same board.",
    check: { kind: "bountiesDone", n: 2 }, reward: { coins: 120, xp: 150 },
  },
  {
    key: "page", title: "Complete a page of your collection book",
    hint: "Open the Book: catch every fish, grow every crop or meet everyone on a page, then claim its reward and title.",
    check: { kind: "pagesClaimed", n: 1 }, reward: { coins: 150, xp: 150 },
  },
  {
    key: "secondLot", title: "Own two lots",
    hint: "At level 10 you can hold a second lot: a ranch, a vineyard, an orchard or a workshop. Claim one at its gate.",
    check: { kind: "lotsOwned", n: 2 }, target: { kind: "freeLot", prefix: "land_" }, reward: { coins: 200, xp: 250 },
  },
  {
    key: "towns", title: "Visit 5 towns",
    hint: "Twenty towns lie across the continent. Open the map (M) and pick a road; the further you go, the tougher it gets.",
    check: { kind: "townsVisited", n: 5 }, reward: { coins: 250, xp: 300 },
  },
  {
    key: "friend", title: "Become a villager's dear friend",
    hint: "Marigold and Bjorn remember who helps them. Buy from them, bring what they ask for, take their standing orders.",
    check: { kind: "dearFriends", n: 1 }, target: { kind: "npc", npcKey: "village_marigold" }, reward: { coins: 150, xp: 200 },
  },
  {
    key: "lair", title: "Defeat a lair boss",
    hint: "Four great beasts guard lairs in the far lands (☠️ on the map once you've seen them). Bring friends: everyone who deals a fair share is rewarded.",
    check: { kind: "lairBosses", n: 1 }, reward: { coins: 500, xp: 600 },
  },
];

/** How far along a goal is, from what was measured. */
export const goalDone = (have: number, need: number): boolean => have >= need;

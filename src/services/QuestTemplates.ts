// Registry of quest templates. Adding a new quest = push one entry here, no
// other edits required. Weights are relative.

import type { QuestTemplate } from "@/types/quest";

export const QUEST_TEMPLATES: QuestTemplate[] = [
  {
    key: "collect_stone_3",
    title: "Gather river stones",
    description: "Bring 3 river stones from the rocks near the pond.",
    requirement: { type: "collect", itemKey: "stone", qty: 3 },
    reward: { coins: 12, xp: 6 },
    weight: 10,
  },
  {
    key: "collect_berry_5",
    title: "Berry picker",
    description: "Pick 5 berries from the bushes south of the pond.",
    requirement: { type: "collect", itemKey: "berry", qty: 5 },
    reward: { coins: 25, xp: 8 },
    weight: 10,
  },
  {
    key: "pet_chickens_3",
    title: "Chicken whisperer",
    description: "Pet 3 chickens today.",
    requirement: { type: "pet", species: "chicken", qty: 3 },
    reward: { coins: 20, xp: 6 },
    weight: 8,
  },
  {
    key: "visit_cabin_1",
    title: "Cabin visit",
    description: "Stop by Cabin One and see how Marigold keeps house.",
    requirement: { type: "visit", buildingKey: "cabin_1" },
    reward: { coins: 15, xp: 8 },
    weight: 6,
  },
  {
    key: "talk_baker",
    title: "Catch up with the baker",
    description: "Say hello to the baker and hear today's special.",
    requirement: { type: "talk", npcKey: "baker" },
    reward: { coins: 15, xp: 4 },
    weight: 8,
  },
  {
    key: "spend_50",
    title: "Generous day",
    description: "Spend 50 coins in the village today.",
    requirement: { type: "spend_coins", amount: 50 },
    reward: { coins: 20, gems: 5 },
    weight: 5,
  },
  {
    key: "starter_first_steps",
    title: "First steps",
    description: "Talk to any villager to get oriented.",
    requirement: { type: "talk", npcKey: "any" },
    reward: { coins: 10, xp: 2 },
    weight: 50,
    starterOnly: true,
  },
  {
    key: "collect_slime_gel_3",
    title: "Globs of gel",
    description: "Slimes out past the trees leak useful stuff. Collect 3 slime gel.",
    requirement: { type: "collect", itemKey: "slime_gel", qty: 3 },
    reward: { coins: 18, xp: 10 },
    weight: 7,
  },
  {
    key: "pet_rabbit_2",
    title: "Bunny calm-down",
    description: "Pet 2 of the bunnies at the north end.",
    requirement: { type: "pet", species: "rabbit", qty: 2 },
    reward: { coins: 10, xp: 8 },
    weight: 6,
  },
  {
    key: "collect_flour_3",
    title: "Flour by the sack",
    description: "Gather 3 bags of flour — from the mill or by crafting.",
    requirement: { type: "collect", itemKey: "flour", qty: 3 },
    reward: { coins: 20, xp: 12 },
    weight: 7,
  },
];

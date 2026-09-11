// Registry of quest templates. Adding a new quest = push one entry here, no
// other edits required. Weights are relative.

import type { QuestTemplate } from "@/types/quest";

export const QUEST_TEMPLATES: QuestTemplate[] = [
  {
    key: "collect_wood_3",
    title: "Gather firewood",
    description: "Bring 3 pieces of wood to the carpenter.",
    requirement: { type: "collect", itemKey: "wood", qty: 3 },
    reward: { coins: 30, xp: 10 },
    weight: 10,
  },
  {
    key: "collect_berries_5",
    title: "Berry picker",
    description: "Pick 5 berries from the bushes south of the pond.",
    requirement: { type: "collect", itemKey: "berries", qty: 5 },
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
    key: "visit_mill",
    title: "Mill tour",
    description: "Visit the mill to learn how flour is made.",
    requirement: { type: "visit", buildingKey: "mill" },
    reward: { coins: 40, xp: 12 },
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
];

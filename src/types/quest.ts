// Daily quests + streaks. Generator strategy interface lives in src/services/QuestGenerator.ts.

export type QuestRequirement =
  | { type: "collect"; itemKey: string; qty: number }
  | { type: "pet"; species: string; qty: number }
  | { type: "talk"; npcKey: string }
  | { type: "visit"; buildingKey: string }
  | { type: "spend_coins"; amount: number };

export type QuestReward = {
  coins?: number;
  gems?: number;
  xp?: number;
  /** Cosmetic items granted on completion (ownership rows created). */
  itemKeys?: string[];
};

export type QuestTemplate = {
  key: string;
  title: string;
  description: string;
  requirement: QuestRequirement;
  reward: QuestReward;
  /** Higher = more likely to be chosen for a given slot. */
  weight: number;
  /** True if this quest can be rolled into a player whose character has no chat yet. */
  starterOnly?: boolean;
  /** True if this quest is gated to sponsored villages only. */
  sponsorOnly?: boolean;
};

export type DailyQuest = {
  id: number;
  characterId: number;
  /** YYYY-MM-DD (UTC) — unique per character per day. */
  forDate: string;
  templateKey: string;
  title: string;
  description: string;
  requirement: QuestRequirement;
  reward: QuestReward;
  progress: number;
  status: "active" | "completed" | "expired";
  createdAt: Date;
  completedAt: Date | null;
};

export type StreakState = {
  characterId: number;
  /** Number of consecutive days a quest was completed. */
  current: number;
  /** All-time longest streak. */
  longest: number;
  /** UTC date of the last completed quest (YYYY-MM-DD). */
  lastCompletedOn: string | null;
  /** One free skip per calendar month. */
  graceUsedOn: string | null;
};

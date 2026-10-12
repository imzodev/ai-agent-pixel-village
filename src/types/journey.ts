// The journey: goals after the tutorial (src/lib/journey.ts). Types only.

import type { TutorialTarget } from "./tutorial";

/** What a goal measures, from the player's own state (never lost, never double-counted). */
export type JourneyCheck =
  | { kind: "level"; n: number }
  | { kind: "fishCaught"; n: number }
  | { kind: "missionsDone"; n: number }
  | { kind: "animalsOwned"; n: number }
  | { kind: "waystone"; key: string }
  | { kind: "ownsAnyItem"; itemKeys: string[] }
  | { kind: "bountiesDone"; n: number }
  | { kind: "pagesClaimed"; n: number }
  | { kind: "lotsOwned"; n: number }
  | { kind: "townsVisited"; n: number }
  | { kind: "dearFriends"; n: number }
  | { kind: "lairBosses"; n: number };

export type JourneyGoal = {
  key: string;
  title: string;
  hint: string;
  check: JourneyCheck;
  /** Where the guide arrow points, when it's somewhere in particular. */
  target?: TutorialTarget;
  reward: { coins: number; xp: number };
};

/** The current goal as the client sees it (/api/me). */
export type JourneyView = {
  step: number;
  total: number;
  key: string;
  title: string;
  hint: string;
  have: number;
  need: number;
  reward: { coins: number; xp: number };
  target?: TutorialTarget;
};

// Activity service. Owns the registry of activity strategies; new activities
// = push one entry into ACTIVITY_STRATEGIES and one row at activity start.

import type { AnalyticsPort } from "@/types/ports";
import type { DrizzleActivityRepo } from "@/db/repos/activity";
import type { Activity, ActivityParticipant } from "@/types/activity";

export type ActivityStrategy = {
  /** Stable key matching `activity.kind`. */
  kind: string;
  /** How many participants can join at once. */
  capacity: number;
  /** Seconds the activity lasts before auto-ending. */
  durationSec: number;
  /** Score a participant gets for a given state delta. Pure. */
  scoreFor: (state: Record<string, unknown>, delta: Record<string, unknown>) => number;
};

export const FISHING_DOCK_STRATEGY: ActivityStrategy = {
  kind: "fishing_dock",
  capacity: 2,
  durationSec: 60,
  scoreFor: (state, delta) => {
    const fishCaught = Number(delta.fishCaught ?? 0);
    const casts = Number(delta.casts ?? 0);
    return (state.fishCaught as number | undefined ?? 0) + fishCaught * 10 - casts * 1;
  },
};

const ACTIVITY_STRATEGIES = new Map<string, ActivityStrategy>([[FISHING_DOCK_STRATEGY.kind, FISHING_DOCK_STRATEGY]]);

export function getActivityStrategy(kind: string): ActivityStrategy {
  const s = ACTIVITY_STRATEGIES.get(kind);
  if (!s) throw new Error(`unknown activity kind ${kind}`);
  return s;
}

export class ActivityService {
  constructor(private repo: DrizzleActivityRepo, private analytics: AnalyticsPort) {}

  async listLive(): Promise<Activity[]> {
    return this.repo.listLive();
  }

  async join(activityId: number, characterId: number): Promise<void> {
    const activity = await this.repo.findById(activityId);
    if (!activity) throw new Error("activity not found");
    const strategy = getActivityStrategy(activity.kind);
    if (activity.participants.length >= strategy.capacity) throw new Error("activity full");
    await this.repo.join(activityId, characterId);
    this.analytics.track("activity_join", { activityId, kind: activity.kind });
  }

  async leave(activityId: number, characterId: number): Promise<void> {
    await this.repo.leave(activityId, characterId);
  }

  async submitResult(activityId: number, characterId: number, delta: Record<string, unknown>): Promise<ActivityParticipant | null> {
    const activity = await this.repo.findById(activityId);
    if (!activity) throw new Error("activity not found");
    const me = activity.participants.find((p) => p.characterId === characterId);
    if (!me) throw new Error("not a participant");
    const strategy = getActivityStrategy(activity.kind);
    const score = strategy.scoreFor(me.state, delta);
    const newState = { ...me.state, ...delta };
    await this.repo.updateParticipantState(activityId, characterId, newState, score);
    return { ...me, state: newState, score };
  }
}

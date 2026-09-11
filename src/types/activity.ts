// Group activities. New activities = new file implementing ActivityStrategy.

export type ActivityStatus = "scheduled" | "live" | "ended" | "cancelled";

export type ActivityParticipant = {
  characterId: number;
  joinedAt: Date;
  /** Free-form per-activity state, e.g. `{ casts: 3, fishCaught: 2 }`. */
  state: Record<string, unknown>;
  /** Final score when the activity ends; null while in progress. */
  score: number | null;
};

export type Activity = {
  id: number;
  kind: string; // e.g. "fishing_dock"
  status: ActivityStatus;
  /** World coordinates of the activity's hotspot. */
  x: number;
  y: number;
  /** ISO timestamp when the activity is scheduled to start; null = always live. */
  startsAt: Date | null;
  /** ISO timestamp when the activity auto-ends; null = no auto-end. */
  endsAt: Date | null;
  /** Sponsor that funded this activity, if any. */
  sponsorId: number | null;
  /** Per-activity config (e.g. duration, max participants). */
  config: Record<string, unknown>;
  participants: ActivityParticipant[];
  createdAt: Date;
};

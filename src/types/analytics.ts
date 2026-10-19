// Analytics events and the admin stats view (src/lib/track.ts,
// src/lib/statsServer.ts). Types only.

export type TrackKind =
  | "signup"
  | "login"
  // A "Play now" character saved with a username and password.
  | "character_saved"
  | "tutorial_step"
  | "tutorial_skip"
  | "journey_step"
  | "moment_created"
  | "share_click"
  | "profile_view"
  | "moment_view"
  | "visitor"
  // Someone's first page view, with where they came from (src/lib/acquisition.ts).
  | "landing";

/** Where a visitor came from: a source ("x", "reddit", "direct"…) and, when tagged, a campaign. */
export type Acquisition = { src: string; campaign: string };

/** One source in the stats: who landed, who signed up, who came back (d1/d7 of those old enough to). */
export type SourceRow = { src: string; landings: number; signups: number; d1: number; d1Of: number; d7: number; d7Of: number; campaigns: string[] };

/** One day's number. */
export type DayCount = { day: string; n: number };

/** GET /api/admin/stats. */
export type StatsView = {
  generatedAt: string;
  totals: { players: number; signups30d: number; activeToday: number; active7d: number };
  signups: DayCount[];
  daily: DayCount[];
  visitors: DayCount[];
  /** Of the players who signed up that day, the share who came back 1 and 7 days later. */
  retention: { day: string; cohort: number; d1: number | null; d7: number | null }[];
  /** Players (signed up in the last 30 days) who reached each tutorial step. */
  tutorial: { step: string; n: number }[];
  sharing: { momentsCreated: number; shareClicks: Record<string, number>; profileViews: number; momentViews: number; signupsFromShares: number };
  /** Last 30 days, by where people came from (busiest first). */
  bySource: SourceRow[];
};

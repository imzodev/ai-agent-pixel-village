// Player reports and bans (src/lib/moderationServer.ts). Types only.

/** An open report as admins see it (GET /api/admin/reports). */
export type ReportView = {
  id: number;
  at: string;
  reason: string;
  /** The reported player's chat lines at the time. */
  chat: string[];
  reporter: { characterId: number; name: string };
  target: { characterId: number; name: string; username: string | null; reports: number };
};

// Drizzle adapter for the sponsor event attribution table.

import { and, desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { SponsorEvent, SponsorEventType } from "@/types/sponsor";
import { sponsorEvents } from "@/db/schema";

export class DrizzleSponsorEventRepo {
  constructor(private db: NodePgDatabase) {}

  async record(input: Omit<SponsorEvent, "id" | "createdAt">): Promise<void> {
    await this.db.insert(sponsorEvents).values(input);
  }

  async listForSponsor(sponsorId: number, limit: number): Promise<SponsorEvent[]> {
    return (await this.db
      .select()
      .from(sponsorEvents)
      .where(eq(sponsorEvents.sponsorId, sponsorId))
      .orderBy(desc(sponsorEvents.createdAt))
      .limit(limit)) as SponsorEvent[];
  }

  async countByType(sponsorId: number, since: Date): Promise<Record<SponsorEventType, number>> {
    const rows = await this.db
      .select({ type: sponsorEvents.type, n: sql<number>`count(*)::int` })
      .from(sponsorEvents)
      .where(and(eq(sponsorEvents.sponsorId, sponsorId), sql`${sponsorEvents.createdAt} >= ${since}`))
      .groupBy(sponsorEvents.type);
    const out: Record<string, number> = {};
    for (const r of rows) out[r.type] = Number(r.n);
    return out as Record<SponsorEventType, number>;
  }
}

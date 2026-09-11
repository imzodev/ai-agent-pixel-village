// Drizzle adapter for the LeadRepository port.

import { desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Lead } from "@/types/domain";
import type { LeadRepository } from "@/types/ports";
import { leads } from "@/db/schema";

export class DrizzleLeadRepo implements LeadRepository {
  constructor(private db: NodePgDatabase) {}

  async create(input: Omit<Lead, "id" | "createdAt">): Promise<Lead> {
    const [row] = await this.db.insert(leads).values(input).returning();
    return row as Lead;
  }

  async listForSponsor(sponsorId: number, limit: number): Promise<Lead[]> {
    return (await this.db
      .select()
      .from(leads)
      .where(eq(leads.sponsorId, sponsorId))
      .orderBy(desc(leads.createdAt))
      .limit(limit)) as Lead[];
  }
}

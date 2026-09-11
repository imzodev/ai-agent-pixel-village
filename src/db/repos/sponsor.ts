// Drizzle adapter for the SponsorRepository port.

import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Sponsor } from "@/types/domain";
import type { SponsorRepository } from "@/types/ports";
import { sponsors } from "@/db/schema";

export class DrizzleSponsorRepo implements SponsorRepository {
  constructor(private db: NodePgDatabase) {}

  async list(): Promise<Sponsor[]> {
    return (await this.db.select().from(sponsors)) as Sponsor[];
  }

  async findById(id: number): Promise<Sponsor | null> {
    const [row] = await this.db.select().from(sponsors).where(eq(sponsors.id, id)).limit(1);
    return (row as Sponsor | undefined) ?? null;
  }

  async findByOwnerToken(token: string): Promise<Sponsor | null> {
    const [row] = await this.db.select().from(sponsors).where(eq(sponsors.ownerToken, token)).limit(1);
    return (row as Sponsor | undefined) ?? null;
  }

  async create(input: Omit<Sponsor, "id" | "createdAt">): Promise<Sponsor> {
    const [row] = await this.db.insert(sponsors).values(input).returning();
    return row as Sponsor;
  }

  async update(id: number, patch: Partial<Sponsor>): Promise<void> {
    await this.db.update(sponsors).set(patch).where(eq(sponsors.id, id));
  }
}

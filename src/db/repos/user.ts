// Drizzle adapter for the UserRepository port. Pure mapping: row -> domain.

import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { User } from "@/types/domain";
import type { UserRepository } from "@/types/ports";
import { users } from "@/db/schema";

export class DrizzleUserRepo implements UserRepository {
  constructor(private db: NodePgDatabase) {}

  async findById(id: number): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
    return row ?? null;
  }

  async create(input: { username: string; passwordHash: string }): Promise<User> {
    const [row] = await this.db.insert(users).values(input).returning();
    return row;
  }
}

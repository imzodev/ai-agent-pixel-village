// Drizzle adapter for the WebhookLogRepository port.

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { WebhookLog } from "@/types/domain";
import type { WebhookLogRepository } from "@/types/ports";
import { webhookLogs } from "@/db/schema";

export class DrizzleWebhookLogRepo implements WebhookLogRepository {
  constructor(private db: NodePgDatabase) {}

  async create(input: Omit<WebhookLog, "id" | "createdAt">): Promise<void> {
    await this.db.insert(webhookLogs).values(input);
  }
}

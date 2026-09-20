import { db } from "@/db";
import { sql } from "drizzle-orm";
import { redisDegraded } from "@/lib/redis";

export const dynamic = "force-dynamic";

type Health = {
  ok: boolean;
  db: boolean;
  redis: { configured: boolean; degraded: boolean };
  // WS connection count is reported via a separate WS-side getter; we
  // don't import the ws module here to keep this endpoint dependency-light.
};

export async function GET() {
  const health: Health = {
    ok: true,
    db: false,
    redis: {
      configured: Boolean(process.env.UPSTASH_REDIS_REST_URL),
      degraded: redisDegraded(),
    },
  };

  try {
    await db.execute(sql`select 1`);
    health.db = true;
  } catch {
    health.db = false;
    health.ok = false;
  }

  // If Upstash is configured but the client failed to initialise, that's
  // a degraded state — the app still runs but cross-process pub/sub
  // doesn't work, so we mark the overall health false.
  if (health.redis.configured && health.redis.degraded) {
    health.ok = false;
  }

  return Response.json(health, { status: health.ok ? 200 : 503 });
}